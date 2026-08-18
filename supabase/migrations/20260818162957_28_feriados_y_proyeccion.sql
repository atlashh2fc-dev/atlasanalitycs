-- ---------------------------------------------------------------------
-- 28 · Feriados y proyección al cierre por días hábiles
-- ---------------------------------------------------------------------
-- Proyectar por días corridos infla el resultado: el equipo no vende
-- domingos. Al 18 de agosto, 126 asegurados en 17 días corridos
-- proyectan 230; los mismos 126 en 12 días hábiles proyectan 221. La
-- diferencia son nueve asegurados de humo.
-- ---------------------------------------------------------------------

insert into feriado (fecha, nombre, irrenunciable) values
  ('2026-01-01', 'Año Nuevo', true),
  ('2026-04-03', 'Viernes Santo', false),
  ('2026-04-04', 'Sábado Santo', false),
  ('2026-05-01', 'Día del Trabajo', true),
  ('2026-05-21', 'Glorias Navales', false),
  ('2026-06-21', 'Día de los Pueblos Originarios', false),
  ('2026-06-29', 'San Pedro y San Pablo', false),
  ('2026-07-16', 'Virgen del Carmen', false),
  ('2026-08-15', 'Asunción de la Virgen', false),
  ('2026-09-18', 'Independencia Nacional', true),
  ('2026-09-19', 'Glorias del Ejército', true),
  ('2026-10-12', 'Encuentro de Dos Mundos', false),
  ('2026-10-31', 'Iglesias Evangélicas', false),
  ('2026-11-01', 'Día de Todos los Santos', false),
  ('2026-12-08', 'Inmaculada Concepción', false),
  ('2026-12-25', 'Navidad', true)
on conflict (fecha) do nothing;

-- ---------------------------------------------------------------------
create or replace function dias_habiles(p_desde date, p_hasta date)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from generate_series(p_desde, p_hasta, interval '1 day') d
  where extract(isodow from d) <= 5
    and not exists (select 1 from feriado f where f.fecha = d::date);
$$;

comment on function dias_habiles is
  'Días de lunes a viernes que no son feriado. Es el denominador de
   cualquier proyección: proyectar por días corridos cuenta domingos en
   los que nadie vende.';

-- ---------------------------------------------------------------------
-- Serie acumulada y proyección lineal al cierre
-- ---------------------------------------------------------------------
create or replace function proyeccion_cierre(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  fecha              date,
  es_habil           boolean,
  asegurados_dia     int,
  acumulado          int,
  proyectado         numeric,
  linea_meta         numeric,
  es_futuro          boolean
)
language sql
stable
security invoker
set search_path = public
as $$
with dias as (
  select
    d::date as fecha,
    extract(isodow from d) <= 5
      and not exists (select 1 from feriado f where f.fecha = d::date) as es_habil
  from generate_series(p_desde, p_hasta, interval '1 day') d
),
corte as (select least(p_hasta, current_date) as hoy),
ventas as (
  select v.fecha_solicitud::date as fecha, count(va.id)::int as n
  from venta v
  join venta_asegurado va on va.venta_id = v.id
  where v.fecha_solicitud::date between p_desde and p_hasta
    and (p_campana is null or v.campana_id = p_campana)
  group by 1
),
meta_total as (
  select coalesce(sum(m.valor), 0) as valor
  from meta m
  where m.ejecutivo_id is null
    and (p_campana is null or m.campana_id = p_campana)
    and daterange(m.periodo_inicio, m.periodo_fin, '[]') && daterange(p_desde, p_hasta, '[]')
),
serie as (
  select
    d.fecha,
    d.es_habil,
    coalesce(v.n, 0) as asegurados_dia,
    sum(coalesce(v.n, 0)) over (order by d.fecha) as acumulado,
    -- Hábiles transcurridos y totales, para el ritmo y la proyección.
    count(*) filter (where d.es_habil) over (order by d.fecha) as habiles_hasta,
    d.fecha > (select hoy from corte) as es_futuro
  from dias d
  left join ventas v on v.fecha = d.fecha
),
base as (
  select
    (select count(*) from dias where es_habil) as habiles_total,
    (select count(*) from dias where es_habil and fecha <= (select hoy from corte)) as habiles_corridos,
    (select acumulado from serie where fecha = (select hoy from corte)) as producido
)
select
  s.fecha,
  s.es_habil,
  s.asegurados_dia,
  s.acumulado::int,
  -- La proyección arranca en lo producido a hoy y avanza al ritmo por
  -- día hábil; en los días no hábiles se mantiene plana, como la realidad.
  case
    when b.habiles_corridos > 0 then
      round(
        b.producido
        + (b.producido::numeric / b.habiles_corridos)
          * greatest(s.habiles_hasta - b.habiles_corridos, 0),
        1)
  end as proyectado,
  round((select valor from meta_total) * s.habiles_hasta::numeric
        / nullif(b.habiles_total, 0), 1) as linea_meta,
  s.es_futuro
from serie s cross join base b
order by s.fecha;
$$;

comment on function proyeccion_cierre is
  'Acumulado diario de asegurados, la recta de proyección al ritmo por
   día hábil y la recta de la meta. La proyección se mantiene plana los
   días no hábiles porque esos días no se vende.';;
