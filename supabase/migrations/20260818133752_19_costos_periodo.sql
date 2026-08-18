-- ---------------------------------------------------------------------
-- 19 · Costos del periodo
-- ---------------------------------------------------------------------

-- Posiciones ocupadas: quien vendió o gestionó en el periodo. Sirve para
-- prorratear los costos que se pagan por puesto de trabajo.
create or replace function posiciones_periodo(
  p_desde date, p_hasta date, p_campana uuid default null
)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int from (
    select ejecutivo_id from venta
      where fecha_solicitud::date between p_desde and p_hasta
        and ejecutivo_id is not null
        and (p_campana is null or campana_id = p_campana)
    union
    select ejecutivo_id from gestion
      where fecha::date between p_desde and p_hasta
        and ejecutivo_id is not null
        and (p_campana is null or campana_id = p_campana)
  ) q;
$$;

create or replace function costos_periodo(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  concepto   text,
  base       text,
  cantidad   numeric,
  monto_clp  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
with fraccion as (select fraccion_de_mes(p_desde, p_hasta) as f),
asegurados_por_ejecutivo as (
  select v.ejecutivo_id, count(va.id)::int as asegurados
  from venta v
  join venta_asegurado va on va.venta_id = v.id
  where v.fecha_solicitud::date between p_desde and p_hasta
    and (p_campana is null or v.campana_id = p_campana)
  group by 1
),
-- Sueldo base prorrateado más comisión por asegurado, todo llevado a
-- costo empresa con el factor de leyes sociales.
remuneraciones as (
  select
    sum(r.sueldo_base_clp * (select f from fraccion) * r.factor_leyes) as base,
    sum(coalesce(a.asegurados, 0) * r.comision_asegurado_clp * r.factor_leyes) as comision
  from remuneracion r
  left join asegurados_por_ejecutivo a on a.ejecutivo_id = r.ejecutivo_id
  where r.vigencia_desde <= p_hasta
    and (r.vigencia_hasta is null or r.vigencia_hasta >= p_desde)
),
gestiones as (
  select count(*)::numeric as n from gestion
  where fecha::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
horas as (
  select coalesce(sum(a.horas_conectado), sum(a.jornada_horas), 0)::numeric as n
  from asistencia a
  where a.fecha between p_desde and p_hasta
    and (p_campana is null or a.campana_id = p_campana)
),
otros as (
  select
    co.concepto,
    co.base::text as base,
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
select 'Comisiones'::text, 'por asegurado'::text,
       (select coalesce(sum(asegurados), 0) from asegurados_por_ejecutivo)::numeric,
       round(coalesce((select comision from remuneraciones), 0), 0)
union all
select o.concepto, o.base, round(o.cantidad, 4), round(o.cantidad * o.monto_clp, 0)
from otros o;
$$;

comment on function costos_periodo is
  'Costos del periodo. El sueldo se prorratea por la fracción de mes
   consultada; los costos por puesto, por gestión o por hora se
   multiplican por la cantidad real del periodo.';;
