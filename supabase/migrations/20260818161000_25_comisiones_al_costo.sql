-- ---------------------------------------------------------------------
-- 25 · Las comisiones entran al costo
-- ---------------------------------------------------------------------
-- Hasta acá el costo era sueldo base más una comisión plana por
-- asegurado. Con el esquema real —tramos por volumen y bonos por
-- ventas— la comisión se calcula en comision_ejecutivo y se suma al
-- costo empresa como cualquier otra remuneración: el factor de leyes
-- sociales se aplica igual, porque comisiones y bonos son imponibles.
--
-- La comisión plana de la tabla remuneracion no se elimina: sirve para
-- campañas con un esquema simple y se suma a la escalonada.
-- ---------------------------------------------------------------------

create or replace function costos_periodo(
  p_desde date, p_hasta date, p_campana uuid default null
)
returns table (concepto text, base text, cantidad numeric, monto_clp numeric)
language sql stable security invoker set search_path = public
as $fn$
with fraccion as (select fraccion_de_mes(p_desde, p_hasta) as f),
asegurados_por_ejecutivo as (
  select v.ejecutivo_id, count(va.id)::int as asegurados
  from venta v join venta_asegurado va on va.venta_id = v.id
  where v.fecha_solicitud::date between p_desde and p_hasta
    and (p_campana is null or v.campana_id = p_campana)
  group by 1
),
-- Factor de leyes por ejecutivo, para no promediar lo que puede diferir.
factores as (
  select r.ejecutivo_id, r.factor_leyes from remuneracion r
  where r.vigencia_desde <= p_hasta
    and (r.vigencia_hasta is null or r.vigencia_hasta >= p_desde)
),
remuneraciones as (
  select
    sum(r.sueldo_base_clp * (select f from fraccion) * r.factor_leyes) as base,
    sum(coalesce(a.asegurados, 0) * r.comision_asegurado_clp * r.factor_leyes) as plana
  from remuneracion r
  left join asegurados_por_ejecutivo a on a.ejecutivo_id = r.ejecutivo_id
  where r.vigencia_desde <= p_hasta
    and (r.vigencia_hasta is null or r.vigencia_hasta >= p_desde)
),
escalonadas as (
  select
    coalesce(sum(ce.comision_clp * coalesce(f.factor_leyes, 1)), 0) as comisiones,
    coalesce(sum(ce.bonos_clp    * coalesce(f.factor_leyes, 1)), 0) as bonos,
    -- Sólo los beneficiarios que efectivamente generan comisión: sumar
    -- todos haría creer que las líneas sin esquema también comisionan.
    coalesce(sum(ce.beneficiarios) filter (where ce.tramo_clp is not null), 0)::numeric as beneficiarios
  from comision_ejecutivo(p_desde, p_hasta, p_campana) ce
  left join factores f on f.ejecutivo_id = ce.ejecutivo_id
),
gestiones as (
  select count(*)::numeric as n from gestion
  where fecha::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
horas as (
  select coalesce(sum(a.horas_conectado), sum(a.jornada_horas), 0)::numeric as n
  from asistencia a where a.fecha between p_desde and p_hasta
    and (p_campana is null or a.campana_id = p_campana)
),
otros as (
  select co.concepto, co.base::text as base,
    case co.base
      when 'mensual'      then (select f from fraccion)
      when 'por_posicion' then posiciones_periodo(p_desde, p_hasta, p_campana) * (select f from fraccion)
      when 'por_gestion'  then (select n from gestiones)
      when 'por_hora'     then (select n from horas)
    end as cantidad,
    co.monto_clp
  from costo_operacion co
  where (p_campana is null or co.campana_id = p_campana)
    and co.vigencia_desde <= p_hasta
    and (co.vigencia_hasta is null or co.vigencia_hasta >= p_desde)
)
select 'Sueldo base'::text, 'mensual'::text,
       round((select f from fraccion), 4),
       round(coalesce((select base from remuneraciones), 0), 0)
union all
select 'Comisiones'::text, 'beneficiarios con esquema'::text,
       (select beneficiarios from escalonadas),
       round((select comisiones from escalonadas) + coalesce((select plana from remuneraciones), 0), 0)
union all
select 'Bonos'::text, 'por ventas alcanzadas'::text, null::numeric,
       round((select bonos from escalonadas), 0)
union all
select o.concepto, o.base, round(o.cantidad, 4), round(o.cantidad * o.monto_clp, 0) from otros o;
$fn$;

comment on function costos_periodo is
  'Costos del periodo, con leyes sociales aplicadas. El sueldo se
   prorratea por la fracción de mes consultada; comisiones y bonos salen
   del esquema escalonado por ejecutivo.';
