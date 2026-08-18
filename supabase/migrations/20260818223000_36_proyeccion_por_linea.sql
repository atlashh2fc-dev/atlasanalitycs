-- ---------------------------------------------------------------------
-- 36 · Apertura de la trayectoria por línea de producto
-- ---------------------------------------------------------------------
-- ONCO y CM+CAT tienen metas y ritmos distintos. Esta serie conserva
-- esa separación para que el forecast de una línea no oculte a la otra.

create or replace function proyeccion_cierre_por_linea(
  p_desde date,
  p_corte date,
  p_cierre date,
  p_campana uuid default null
)
returns table (
  agrupacion_meta text,
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
grupos as (
  select distinct m.agrupacion_meta
  from meta m cross join limites l
  where m.agrupacion_meta is not null
    and m.ejecutivo_id is null
    and (p_campana is null or m.campana_id = p_campana)
    and daterange(m.periodo_inicio, m.periodo_fin, '[]')
        && daterange(p_desde, l.cierre, '[]')
  union
  select distinct pr.agrupacion_meta
  from venta v
  join producto pr on pr.id = v.producto_id
  cross join limites l
  where pr.agrupacion_meta is not null
    and v.fecha_solicitud::date between p_desde and l.corte
    and (p_campana is null or v.campana_id = p_campana)
),
ventas as (
  select
    pr.agrupacion_meta,
    v.fecha_solicitud::date as fecha,
    count(va.id)::int as n
  from venta v
  join producto pr on pr.id = v.producto_id
  join venta_asegurado va on va.venta_id = v.id
  cross join limites l
  where v.fecha_solicitud::date between p_desde and l.corte
    and (p_campana is null or v.campana_id = p_campana)
  group by 1, 2
),
metas as (
  select m.agrupacion_meta, coalesce(sum(m.valor), 0) as valor
  from meta m cross join limites l
  where m.agrupacion_meta is not null
    and m.ejecutivo_id is null
    and (p_campana is null or m.campana_id = p_campana)
    and daterange(m.periodo_inicio, m.periodo_fin, '[]')
        && daterange(p_desde, l.cierre, '[]')
  group by 1
),
serie as (
  select
    g.agrupacion_meta,
    d.fecha,
    d.es_habil,
    coalesce(v.n, 0) as asegurados_dia,
    sum(coalesce(v.n, 0)) over (
      partition by g.agrupacion_meta order by d.fecha
    ) as acumulado,
    count(*) filter (where d.es_habil) over (
      partition by g.agrupacion_meta order by d.fecha
    ) as habiles_hasta,
    d.fecha > l.corte as es_futuro
  from grupos g
  cross join dias d
  cross join limites l
  left join ventas v
    on v.agrupacion_meta = g.agrupacion_meta and v.fecha = d.fecha
),
base as (
  select
    g.agrupacion_meta,
    (select count(*) from dias where es_habil) as habiles_total,
    (select count(*) from dias d cross join limites l
      where d.es_habil and d.fecha <= l.corte) as habiles_corridos,
    coalesce((select s.acumulado from serie s cross join limites l
      where s.agrupacion_meta = g.agrupacion_meta and s.fecha <= l.corte
      order by s.fecha desc limit 1), 0) as producido
  from grupos g
)
select
  s.agrupacion_meta,
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
  round(coalesce(m.valor, 0) * s.habiles_hasta::numeric
        / nullif(b.habiles_total, 0), 1) as linea_meta,
  s.es_futuro
from serie s
join base b on b.agrupacion_meta = s.agrupacion_meta
left join metas m on m.agrupacion_meta = s.agrupacion_meta
order by s.agrupacion_meta, s.fecha;
$fn$;

comment on function proyeccion_cierre_por_linea(date, date, date, uuid) is
  'Producción, forecast e ideal diarios separados por agrupación de meta (ONCO y CM+CAT).';
