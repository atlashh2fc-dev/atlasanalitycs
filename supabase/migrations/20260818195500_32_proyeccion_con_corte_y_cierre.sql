-- ---------------------------------------------------------------------
-- 32 · La fecha real y el horizonte de forecast son conceptos distintos
-- ---------------------------------------------------------------------
-- Los KPI del mes se cortan en p_corte. La serie continúa hasta
-- p_cierre para que real, forecast e ideal puedan compararse al cierre.

drop function if exists proyeccion_cierre(date, date, uuid);

create or replace function proyeccion_cierre(
  p_desde date,
  p_corte date,
  p_cierre date,
  p_campana uuid default null
)
returns table (
  fecha date,
  es_habil boolean,
  asegurados_dia int,
  acumulado int,
  proyectado numeric,
  linea_meta numeric,
  es_futuro boolean
)
language sql
stable
security invoker
set search_path = public
as $fn$
with limites as (
  select
    least(p_corte, p_cierre, current_date) as corte,
    greatest(p_desde, p_cierre) as cierre
),
dias as (
  select
    d::date as fecha,
    extract(isodow from d) <= 5
      and not exists (select 1 from feriado f where f.fecha = d::date) as es_habil
  from limites l,
       generate_series(p_desde, l.cierre, interval '1 day') d
),
ventas as (
  select v.fecha_solicitud::date as fecha, count(va.id)::int as n
  from venta v
  join venta_asegurado va on va.venta_id = v.id
  cross join limites l
  where v.fecha_solicitud::date between p_desde and l.corte
    and (p_campana is null or v.campana_id = p_campana)
  group by 1
),
meta_total as (
  select coalesce(sum(m.valor), 0) as valor
  from meta m cross join limites l
  where m.ejecutivo_id is null
    and (p_campana is null or m.campana_id = p_campana)
    and daterange(m.periodo_inicio, m.periodo_fin, '[]')
        && daterange(p_desde, l.cierre, '[]')
),
serie as (
  select
    d.fecha,
    d.es_habil,
    coalesce(v.n, 0) as asegurados_dia,
    sum(coalesce(v.n, 0)) over (order by d.fecha) as acumulado,
    count(*) filter (where d.es_habil) over (order by d.fecha) as habiles_hasta,
    d.fecha > l.corte as es_futuro
  from dias d
  cross join limites l
  left join ventas v on v.fecha = d.fecha
),
base as (
  select
    (select count(*) from dias where es_habil) as habiles_total,
    (select count(*) from dias d cross join limites l where d.es_habil and d.fecha <= l.corte) as habiles_corridos,
    coalesce((select acumulado from serie s cross join limites l where s.fecha <= l.corte order by s.fecha desc limit 1), 0) as producido
)
select
  s.fecha,
  s.es_habil,
  s.asegurados_dia,
  s.acumulado::int,
  case when b.habiles_corridos > 0 then
    round(
      b.producido
      + (b.producido::numeric / b.habiles_corridos)
        * greatest(s.habiles_hasta - b.habiles_corridos, 0),
      1
    )
  end as proyectado,
  round((select valor from meta_total) * s.habiles_hasta::numeric
        / nullif(b.habiles_total, 0), 1) as linea_meta,
  s.es_futuro
from serie s cross join base b
order by s.fecha;
$fn$;

comment on function proyeccion_cierre(date, date, date, uuid) is
  'Serie mensual con producción real hasta p_corte y forecast/ideal hasta p_cierre.';

-- El gestor de tareas no pertenece al cuadro de mando. La migración 31
-- alcanzó a producción, por lo que se retira explícitamente y no se deja
-- infraestructura huérfana.
drop table if exists accion_bsc;

-- Un embudo sólo contiene etapas secuenciales. Los compromisos son
-- backlog y los asegurados son profundidad de venta, no conversiones.
create or replace function embudo_periodo(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (orden int, etapa text, valor int, tasa_pct numeric, detalle text)
language sql stable security invoker set search_path = public
as $fn$
with g as (
  select count(*)::int as gestiones,
         count(*) filter (where ti.cuenta_como_contacto)::int as contactos
  from gestion ge left join tipificacion ti on ti.id = ge.tipificacion_id
  where ge.fecha::date between p_desde and p_hasta
    and (p_campana is null or ge.campana_id = p_campana)
),
c as (
  select count(*)::int n from cotizacion
  where fecha::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
v as (
  select count(*)::int n from venta
  where fecha_solicitud::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
etapas as (
  select * from (values
    (1, 'Gestiones', (select gestiones from g), 'Intentos de contacto del discador'),
    (2, 'Contactos', (select contactos from g), 'Gestiones con conversación real'),
    (3, 'Cotizaciones', (select n from c), 'Cotizaciones emitidas en el periodo'),
    (4, 'Ventas', (select n from v), 'Contratos cerrados en el periodo')
  ) as t(orden, etapa, valor, detalle)
)
select e.orden, e.etapa, e.valor,
       case when p.valor > 0 then round(e.valor::numeric / p.valor * 100, 2) end,
       e.detalle
from etapas e left join etapas p on p.orden = e.orden - 1
order by e.orden;
$fn$;
