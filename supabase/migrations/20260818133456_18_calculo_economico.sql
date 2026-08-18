-- ---------------------------------------------------------------------
-- 18 · Cálculo económico del periodo
-- ---------------------------------------------------------------------
-- Todo se resuelve en Postgres. PostgREST corta en 1.000 filas, así que
-- cualquier agregación hecha en Node sobre las filas crudas daría un
-- número equivocado en silencio apenas la operación crezca.
--
-- Todas las funciones son SECURITY INVOKER: el que consulta ve lo que
-- sus políticas le permiten, y la remuneración sigue siendo sólo de
-- administración.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Fracción de mes cubierta por un periodo
-- ---------------------------------------------------------------------
-- Un sueldo es mensual; si el periodo consultado es del 1 al 15, cargar
-- el sueldo completo infla el costo al doble. Se suma la proporción de
-- cada mes tocado, así que un rango que cruza meses también queda bien.
-- ---------------------------------------------------------------------
create or replace function fraccion_de_mes(p_desde date, p_hasta date)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(
    (least(p_hasta, (m + interval '1 month - 1 day')::date)
     - greatest(p_desde, m::date) + 1)::numeric
    / extract(day from (m + interval '1 month - 1 day'))::numeric
  ), 0)
  from generate_series(
    date_trunc('month', p_desde),
    date_trunc('month', p_hasta),
    interval '1 month'
  ) as m;
$$;

-- ---------------------------------------------------------------------
-- Valor de la UF a usar
-- ---------------------------------------------------------------------
-- Primero el que traen las propias ventas del periodo, que es el que se
-- aplicó de verdad. La tabla valor_uf existe para fijarlo a mano cuando
-- todavía no hay ventas cargadas.
-- ---------------------------------------------------------------------
create or replace function uf_del_periodo(p_desde date, p_hasta date)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select avg(valor_uf) from venta
      where valor_uf is not null
        and fecha_solicitud::date between p_desde and p_hasta),
    (select avg(valor_clp) from valor_uf
      where fecha between p_desde and p_hasta),
    (select valor_uf from venta where valor_uf is not null
      order by fecha_solicitud desc limit 1)
  );
$$;

-- ---------------------------------------------------------------------
-- Ingreso del contact center por línea de producto
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
-- Cuánto lleva cada línea respecto de su meta. La tarifa del
-- oncológico depende de esto, así que se calcula antes.
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
-- Complementario y catastrófico: el titular por su tramo etario y cada
-- adicional a valor único.
por_edad as (
  select
    p.agrupacion_meta,
    sum(t.valor_uf) as ingreso_uf
  from personas p
  join tarifa t
    on t.agrupacion_meta = p.agrupacion_meta
   and t.criterio = 'edad'
   and (p_campana is null or t.campana_id = p_campana)
   and t.vigencia_desde <= p_hasta
   and (t.vigencia_hasta is null or t.vigencia_hasta >= p_desde)
   and (
     (t.alcance = 'titular'   and p.parentesco = 'titular'
        and p.edad is not null
        and p.edad >= t.desde and p.edad <= coalesce(t.hasta, 999))
     or (t.alcance = 'adicional' and p.parentesco = 'carga')
     or (t.alcance = 'todos')
   )
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
        and coalesce(a.asegurados::numeric / nullif(a.meta, 0) * 100, 0) >= t.desde
        and coalesce(a.asegurados::numeric / nullif(a.meta, 0) * 100, 0) <= coalesce(t.hasta, 99999)
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

comment on function ingreso_periodo is
  'Ingreso del contact center por línea, según la tarifa vigente. El
   oncológico se liquida al cierre del periodo porque su tarifa depende
   del cumplimiento total, no de cada venta.';
