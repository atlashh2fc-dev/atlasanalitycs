-- ---------------------------------------------------------------------
-- 23 · Los tramos se resuelven por su piso, no por el intervalo
-- ---------------------------------------------------------------------
-- La tabla del mandante deja huecos: el oncológico salta de "105–109%"
-- a "más de 110%", así que un cumplimiento de exactamente 110% —66
-- beneficiarios sobre una meta de 60— no caía en ningún tramo y el
-- ingreso quedaba en cero. Lo mismo con "63–65" y "67+", que se saltan
-- el 66.
--
-- La corrección no es rellenar los huecos a mano sino cambiar la forma
-- de buscar: se toma el tramo de piso más alto que no supere el valor.
-- Así no hay hueco posible, y la columna 'hasta' pasa a ser
-- documentación de lo que dice el contrato en vez de una condición que
-- puede dejar una venta sin tarifa.
-- ---------------------------------------------------------------------

create or replace function ingreso_periodo(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  agrupacion_meta   text,
  criterio          text,
  contratos         int,
  titulares         int,
  adicionales       int,
  asegurados        int,
  meta              numeric,
  cumplimiento_pct  numeric,
  tarifa_uf         numeric,
  ingreso_uf        numeric,
  ingreso_clp       numeric
)
language sql
stable
security invoker
set search_path = public
as $$
with ventas as (
  select v.id, v.fecha_solicitud, pr.agrupacion_meta
  from venta v
  join producto pr on pr.id = v.producto_id
  where v.fecha_solicitud::date between p_desde and p_hasta
    and (p_campana is null or v.campana_id = p_campana)
),
personas as (
  select
    ve.agrupacion_meta,
    ve.id as venta_id,
    va.parentesco,
    va.edad
  from ventas ve
  join venta_asegurado va on va.venta_id = ve.id
),
avance as (
  select
    p.agrupacion_meta,
    count(*)::int as asegurados,
    (select m.valor from meta m
      where m.agrupacion_meta = p.agrupacion_meta
        and m.ejecutivo_id is null
        and (p_campana is null or m.campana_id = p_campana)
        and daterange(m.periodo_inicio, m.periodo_fin, '[]') && daterange(p_desde, p_hasta, '[]')
      order by m.periodo_inicio desc limit 1) as meta
  from personas p
  group by 1
),
-- Complementario y catastrófico: el titular por su tramo etario —el
-- tramo de piso más alto que no supere su edad— y cada adicional a
-- valor único.
por_edad as (
  select
    p.agrupacion_meta,
    sum(
      coalesce(
        case when p.parentesco = 'titular' and p.edad is not null then
          (select t.valor_uf from tarifa t
            where t.agrupacion_meta = p.agrupacion_meta
              and t.criterio = 'edad'
              and t.alcance = 'titular'
              and (p_campana is null or t.campana_id = p_campana)
              and t.vigencia_desde <= p_hasta
              and (t.vigencia_hasta is null or t.vigencia_hasta >= p_desde)
              and t.desde <= p.edad
            order by t.desde desc limit 1)
        end,
        case when p.parentesco = 'carga' then
          (select t.valor_uf from tarifa t
            where t.agrupacion_meta = p.agrupacion_meta
              and t.criterio = 'edad'
              and t.alcance = 'adicional'
              and (p_campana is null or t.campana_id = p_campana)
              and t.vigencia_desde <= p_hasta
              and (t.vigencia_hasta is null or t.vigencia_hasta >= p_desde)
            order by t.desde desc limit 1)
        end,
        0
      )
    ) as ingreso_uf
  from personas p
  group by 1
),
-- Oncológico: todos los beneficiarios al mismo valor, que sube por
-- tramo de cumplimiento. Sube para todos, no sólo para el excedente.
tarifa_cumplimiento as (
  select
    a.agrupacion_meta,
    (select t.valor_uf from tarifa t
      where t.agrupacion_meta = a.agrupacion_meta
        and t.criterio = 'cumplimiento'
        and (p_campana is null or t.campana_id = p_campana)
        and t.vigencia_desde <= p_hasta
        and (t.vigencia_hasta is null or t.vigencia_hasta >= p_desde)
        and t.desde <= coalesce(a.asegurados::numeric / nullif(a.meta, 0) * 100, 0)
      order by t.desde desc limit 1) as tarifa_uf
  from avance a
)
select
  a.agrupacion_meta,
  case when tc.tarifa_uf is not null then 'cumplimiento' else 'edad' end as criterio,
  (select count(distinct p.venta_id)::int from personas p where p.agrupacion_meta = a.agrupacion_meta) as contratos,
  (select count(*)::int from personas p where p.agrupacion_meta = a.agrupacion_meta and p.parentesco = 'titular') as titulares,
  (select count(*)::int from personas p where p.agrupacion_meta = a.agrupacion_meta and p.parentesco = 'carga') as adicionales,
  a.asegurados,
  a.meta,
  round(a.asegurados::numeric / nullif(a.meta, 0) * 100, 2) as cumplimiento_pct,
  tc.tarifa_uf,
  round(coalesce(tc.tarifa_uf * a.asegurados, pe.ingreso_uf, 0), 4) as ingreso_uf,
  round(coalesce(tc.tarifa_uf * a.asegurados, pe.ingreso_uf, 0) * uf_del_periodo(p_desde, p_hasta), 0) as ingreso_clp
from avance a
left join tarifa_cumplimiento tc on tc.agrupacion_meta = a.agrupacion_meta
left join por_edad pe on pe.agrupacion_meta = a.agrupacion_meta
order by 1;
$$;

-- El último tramo del oncológico arranca en 110,1% y no en 109: con la
-- meta de 60, el 110% exacto son 66 beneficiarios, que la tabla del
-- mandante deja fuera tanto de "63-65" como de "67+". Se toma la
-- lectura conservadora —1,7 UF— y queda anotado para confirmarlo.
update tarifa
set desde = 110.1,
    hasta = null,
    notas = 'Sobre 110% (67 o más beneficiarios con meta 60). El 110% exacto, 66 beneficiarios, queda en el tramo anterior: la tabla del mandante salta del 65 al 67 y se toma la lectura conservadora.'
where agrupacion_meta = 'ONCO'
  and criterio = 'cumplimiento'
  and desde = 109;

update tarifa
set notas = 'Hasta 60 beneficiarios (meta del mes)'
where agrupacion_meta = 'ONCO' and criterio = 'cumplimiento' and desde = 0;

update tarifa
set notas = '61 a 62 beneficiarios'
where agrupacion_meta = 'ONCO' and criterio = 'cumplimiento' and desde = 100.1;

update tarifa
set notas = '63 a 65 beneficiarios'
where agrupacion_meta = 'ONCO' and criterio = 'cumplimiento' and desde = 105;

-- El tramo superior de complementario no tiene tope: "60 a 60" en el
-- contrato es el piso, no un tramo de un solo año.
update tarifa
set hasta = null, notas = 'Titular de 60 años en adelante'
where agrupacion_meta = 'CM+CAT' and criterio = 'edad' and alcance = 'titular' and desde = 60;;
