-- Forecast adaptativo: mantiene el promedio mensual como base, pero cuando
-- tres ventanas móviles de cinco días hábiles muestran crecimiento sostenido
-- usa el ritmo de la última ventana. Así la proyección responde al patrón más
-- reciente sin reaccionar a un único día excepcional ni a semanas incompletas.

drop function if exists public.proyeccion_cierre(date, date, date, uuid);

create function public.proyeccion_cierre(
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
  es_futuro boolean,
  ritmo_proyeccion numeric,
  metodo_proyeccion text
)
language sql stable security invoker set search_path = public
as $fn$
with limites as (
  select least(p_corte, p_cierre, current_date) as corte,
         greatest(p_desde, p_cierre) as cierre
),
dias as (
  select d::date as fecha,
         extract(isodow from d) <= 5
           and not exists (select 1 from feriado f where f.fecha = d::date) as es_habil
  from limites l, generate_series(p_desde, l.cierre, interval '1 day') d
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
  select d.fecha, d.es_habil, coalesce(v.n, 0) as asegurados_dia,
         sum(coalesce(v.n, 0)) over (order by d.fecha) as acumulado,
         count(*) filter (where d.es_habil) over (order by d.fecha) as habiles_hasta,
         d.fecha > l.corte as es_futuro
  from dias d
  cross join limites l
  left join ventas v on v.fecha = d.fecha
),
observados as (
  select s.asegurados_dia,
         row_number() over (order by s.fecha desc) as posicion
  from serie s cross join limites l
  where s.es_habil and s.fecha <= l.corte
),
ventanas as (
  select
    count(*) filter (where posicion between 1 and 5) as n_reciente,
    count(*) filter (where posicion between 6 and 10) as n_previa,
    count(*) filter (where posicion between 11 and 15) as n_anteprevia,
    coalesce(avg(asegurados_dia) filter (where posicion between 1 and 5), 0) as reciente,
    coalesce(avg(asegurados_dia) filter (where posicion between 6 and 10), 0) as previa,
    coalesce(avg(asegurados_dia) filter (where posicion between 11 and 15), 0) as anteprevia
  from observados
),
base as (
  select (select count(*) from dias where es_habil) as habiles_total,
         (select count(*) from dias d cross join limites l
           where d.es_habil and d.fecha <= l.corte) as habiles_corridos,
         coalesce((select acumulado from serie s cross join limites l
           where s.fecha <= l.corte order by s.fecha desc limit 1), 0) as producido
),
modelo as (
  select b.*,
    case when v.n_reciente = 5 and v.n_previa = 5 and v.n_anteprevia = 5
                   and v.reciente >= v.previa and v.previa >= v.anteprevia
                   and v.reciente > v.anteprevia
         then v.reciente
         else b.producido::numeric / nullif(b.habiles_corridos, 0)
    end as ritmo,
    case when v.n_reciente = 5 and v.n_previa = 5 and v.n_anteprevia = 5
                   and v.reciente >= v.previa and v.previa >= v.anteprevia
                   and v.reciente > v.anteprevia
         then 'tendencia_ultima_semana' else 'promedio_periodo'
    end as metodo
  from base b cross join ventanas v
)
select s.fecha, s.es_habil, s.asegurados_dia, s.acumulado::int,
       case when m.habiles_corridos > 0 then
         round(m.producido + m.ritmo * greatest(s.habiles_hasta - m.habiles_corridos, 0), 1)
       end as proyectado,
       round((select valor from meta_total) * s.habiles_hasta::numeric
             / nullif(m.habiles_total, 0), 1) as linea_meta,
       s.es_futuro, round(m.ritmo, 2), m.metodo
from serie s cross join modelo m
order by s.fecha;
$fn$;

comment on function public.proyeccion_cierre(date, date, date, uuid) is
  'Forecast mensual adaptativo. Usa la ultima ventana de cinco dias habiles solo ante crecimiento sostenido en tres ventanas; en otro caso usa el promedio del periodo.';

drop function if exists public.proyeccion_cierre_por_linea(date, date, date, uuid);

create function public.proyeccion_cierre_por_linea(
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
  es_futuro boolean,
  ritmo_proyeccion numeric,
  metodo_proyeccion text
)
language sql stable security invoker set search_path = public
as $fn$
with limites as (
  select least(p_corte, p_cierre, current_date) as corte,
         greatest(p_desde, p_cierre) as cierre
),
dias as (
  select d::date as fecha,
         extract(isodow from d) <= 5
           and not exists (select 1 from feriado f where f.fecha = d::date) as es_habil
  from limites l, generate_series(p_desde, l.cierre, interval '1 day') d
),
grupos as (
  select distinct m.agrupacion_meta
  from meta m cross join limites l
  where m.agrupacion_meta is not null and m.ejecutivo_id is null
    and (p_campana is null or m.campana_id = p_campana)
    and daterange(m.periodo_inicio, m.periodo_fin, '[]') && daterange(p_desde, l.cierre, '[]')
  union
  select distinct pr.agrupacion_meta
  from venta v join producto pr on pr.id = v.producto_id cross join limites l
  where pr.agrupacion_meta is not null
    and v.fecha_solicitud::date between p_desde and l.corte
    and (p_campana is null or v.campana_id = p_campana)
),
ventas as (
  select pr.agrupacion_meta, v.fecha_solicitud::date as fecha, count(va.id)::int as n
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
  where m.agrupacion_meta is not null and m.ejecutivo_id is null
    and (p_campana is null or m.campana_id = p_campana)
    and daterange(m.periodo_inicio, m.periodo_fin, '[]') && daterange(p_desde, l.cierre, '[]')
  group by 1
),
serie as (
  select g.agrupacion_meta, d.fecha, d.es_habil, coalesce(v.n, 0) as asegurados_dia,
         sum(coalesce(v.n, 0)) over (partition by g.agrupacion_meta order by d.fecha) as acumulado,
         count(*) filter (where d.es_habil) over (partition by g.agrupacion_meta order by d.fecha) as habiles_hasta,
         d.fecha > l.corte as es_futuro
  from grupos g cross join dias d cross join limites l
  left join ventas v on v.agrupacion_meta = g.agrupacion_meta and v.fecha = d.fecha
),
observados as (
  select s.agrupacion_meta, s.asegurados_dia,
         row_number() over (partition by s.agrupacion_meta order by s.fecha desc) as posicion
  from serie s cross join limites l
  where s.es_habil and s.fecha <= l.corte
),
ventanas as (
  select agrupacion_meta,
    count(*) filter (where posicion between 1 and 5) as n_reciente,
    count(*) filter (where posicion between 6 and 10) as n_previa,
    count(*) filter (where posicion between 11 and 15) as n_anteprevia,
    coalesce(avg(asegurados_dia) filter (where posicion between 1 and 5), 0) as reciente,
    coalesce(avg(asegurados_dia) filter (where posicion between 6 and 10), 0) as previa,
    coalesce(avg(asegurados_dia) filter (where posicion between 11 and 15), 0) as anteprevia
  from observados group by agrupacion_meta
),
base as (
  select g.agrupacion_meta,
         (select count(*) from dias where es_habil) as habiles_total,
         (select count(*) from dias d cross join limites l where d.es_habil and d.fecha <= l.corte) as habiles_corridos,
         coalesce((select s.acumulado from serie s cross join limites l
           where s.agrupacion_meta = g.agrupacion_meta and s.fecha <= l.corte
           order by s.fecha desc limit 1), 0) as producido
  from grupos g
),
modelo as (
  select b.*,
    case when v.n_reciente = 5 and v.n_previa = 5 and v.n_anteprevia = 5
                   and v.reciente >= v.previa and v.previa >= v.anteprevia
                   and v.reciente > v.anteprevia
         then v.reciente
         else b.producido::numeric / nullif(b.habiles_corridos, 0)
    end as ritmo,
    case when v.n_reciente = 5 and v.n_previa = 5 and v.n_anteprevia = 5
                   and v.reciente >= v.previa and v.previa >= v.anteprevia
                   and v.reciente > v.anteprevia
         then 'tendencia_ultima_semana' else 'promedio_periodo'
    end as metodo
  from base b left join ventanas v using (agrupacion_meta)
)
select s.agrupacion_meta, s.fecha, s.es_habil, s.asegurados_dia, s.acumulado::int,
       case when m.habiles_corridos > 0 then
         round(m.producido + m.ritmo * greatest(s.habiles_hasta - m.habiles_corridos, 0), 1)
       end as proyectado,
       round(coalesce(me.valor, 0) * s.habiles_hasta::numeric / nullif(m.habiles_total, 0), 1),
       s.es_futuro, round(m.ritmo, 2), m.metodo
from serie s
join modelo m on m.agrupacion_meta = s.agrupacion_meta
left join metas me on me.agrupacion_meta = s.agrupacion_meta
order by s.agrupacion_meta, s.fecha;
$fn$;

comment on function public.proyeccion_cierre_por_linea(date, date, date, uuid) is
  'Forecast adaptativo por linea, con tendencia reciente solo cuando tres ventanas semanales confirman crecimiento sostenido.';
