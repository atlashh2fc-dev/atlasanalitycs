-- ---------------------------------------------------------------------
-- 30 · Piso estadístico del control por ejecutivo
-- ---------------------------------------------------------------------
-- El cuadro de mando mostraba el equilibrio del equipo. Para gestionar
-- hace falta el de cada persona: cuánto tiene que producir para cubrir
-- su propio costo, cuánto para llegar a su meta, y dónde se le rompe la
-- cadena entre marcar, conversar y cerrar.
--
-- Cuatro decisiones:
--
-- 1. Meta por ejecutivo. Si hay una meta individual cargada, manda. Si
--    no, se reparte la del equipo en proporción a la jornada: pedirle lo
--    mismo a alguien de 30 horas que a uno de 42 no es una meta, es un
--    error de cálculo.
--
-- 2. Punto de equilibrio individual. Costo fijo dividido por el margen
--    de contribución por asegurado, a su mix y su tramo de comisión
--    actuales. Si cambia de tramo el número se mueve, y por eso la vista
--    también muestra el margen en pesos, que es exacto.
--
-- 3. Ritmo esperado. La meta prorrateada por la fracción del periodo ya
--    transcurrida, para no acusar de atraso a mitad de mes.
--
-- 4. Piso estadístico. Bajo 20 intentos o 20 contactos, el porcentaje se
--    mueve entero con un solo caso: dos gestiones y diez ventas dan un
--    cierre de 500%, que no es un dato sino un artefacto. Esos casos
--    devuelven null.
-- ---------------------------------------------------------------------

drop function if exists control_ejecutivo(date, date, uuid);

create or replace function control_ejecutivo(
  p_desde date, p_hasta date, p_campana uuid default null
)
returns table (
  ejecutivo_id uuid, ejecutivo text, jornada_horas numeric,
  gestiones int, contactos int, contactabilidad_pct numeric, conversion_pct numeric,
  contratos int, asegurados int, meta_asignada numeric, meta_es_propia boolean,
  cumplimiento_pct numeric, ritmo_esperado numeric, proyeccion numeric,
  ingreso_clp numeric, costo_fijo_clp numeric, costo_variable_clp numeric,
  costo_total_clp numeric, margen_clp numeric, equilibrio_aseg numeric, estado text
)
language sql stable security invoker set search_path = public
as $fn$
with fraccion as (select fraccion_de_mes(p_desde, p_hasta) as f),
avance_periodo as (
  select case
    when current_date >= p_hasta then 1::numeric
    when current_date <  p_desde then 0::numeric
    else (current_date - p_desde + 1)::numeric / nullif((p_hasta - p_desde + 1), 0)
  end as t
),
eco as (select * from economia_ejecutivo(p_desde, p_hasta, p_campana)),
gest as (
  select g.ejecutivo_id, count(*)::int as gestiones,
         count(*) filter (where ti.cuenta_como_contacto)::int as contactos
  from gestion g
  left join tipificacion ti on ti.id = g.tipificacion_id
  where g.fecha::date between p_desde and p_hasta
    and g.ejecutivo_id is not null
    and (p_campana is null or g.campana_id = p_campana)
  group by 1
),
com as (
  select ejecutivo_id, sum(comision_clp + semana_corrida_clp) as variable, sum(bonos_clp) as bonos
  from comision_ejecutivo(p_desde, p_hasta, p_campana) group by 1
),
rem as (
  select r.ejecutivo_id, r.sueldo_base_clp, r.factor_leyes from remuneracion r
  where r.vigencia_desde <= p_hasta and (r.vigencia_hasta is null or r.vigencia_hasta >= p_desde)
),
activos as (
  select e.id, coalesce(e.jornada_horas, 42) as jornada from ejecutivo e
  where e.activo and (p_campana is null
    or exists (select 1 from ejecutivo_campana ec where ec.ejecutivo_id = e.id and ec.campana_id = p_campana))
),
meta_equipo as (
  select coalesce(sum(m.valor), 0) as valor from meta m
  where m.ejecutivo_id is null and (p_campana is null or m.campana_id = p_campana)
    and daterange(m.periodo_inicio, m.periodo_fin, '[]') && daterange(p_desde, p_hasta, '[]')
),
meta_propia as (
  select m.ejecutivo_id, sum(m.valor) as valor from meta m
  where m.ejecutivo_id is not null and (p_campana is null or m.campana_id = p_campana)
    and daterange(m.periodo_inicio, m.periodo_fin, '[]') && daterange(p_desde, p_hasta, '[]')
  group by 1
),
armado as (
  select ec.ejecutivo_id, ec.ejecutivo, a.jornada as jornada_horas,
    coalesce(g.gestiones, 0) as gestiones, coalesce(g.contactos, 0) as contactos,
    ec.contratos, ec.asegurados,
    coalesce(mp.valor, round((select valor from meta_equipo) * a.jornada
      / nullif((select sum(jornada) from activos), 0), 1)) as meta_asignada,
    mp.valor is not null as meta_es_propia,
    ec.ingreso_clp,
    round(coalesce(r.sueldo_base_clp, 0) * (select f from fraccion) * coalesce(r.factor_leyes, 1), 0) as costo_fijo_clp,
    round((coalesce(c.variable, 0) + coalesce(c.bonos, 0)) * coalesce(r.factor_leyes, 1), 0) as costo_variable_clp
  from eco ec
  join activos a on a.id = ec.ejecutivo_id
  left join rem r on r.ejecutivo_id = ec.ejecutivo_id
  left join com c on c.ejecutivo_id = ec.ejecutivo_id
  left join gest g on g.ejecutivo_id = ec.ejecutivo_id
  left join meta_propia mp on mp.ejecutivo_id = ec.ejecutivo_id
)
select
  x.ejecutivo_id, x.ejecutivo, x.jornada_horas, x.gestiones, x.contactos,
  -- Piso estadístico: bajo 20 intentos o 20 contactos el porcentaje se
  -- mueve entero con un solo caso. Mostrarlo daría un 500% de cierre y
  -- una conversación equivocada con la persona.
  case when x.gestiones >= 20
       then round(x.contactos::numeric / x.gestiones * 100, 1) end,
  case when x.contactos >= 20
       then round(x.contratos::numeric / x.contactos * 100, 2) end,
  x.contratos, x.asegurados, x.meta_asignada, x.meta_es_propia,
  round(x.asegurados::numeric / nullif(x.meta_asignada, 0) * 100, 1),
  round(x.meta_asignada * (select t from avance_periodo), 1),
  case when (select t from avance_periodo) > 0
       then round(x.asegurados / (select t from avance_periodo), 1) end,
  x.ingreso_clp, x.costo_fijo_clp, x.costo_variable_clp,
  x.costo_fijo_clp + x.costo_variable_clp,
  x.ingreso_clp - x.costo_fijo_clp - x.costo_variable_clp,
  case when x.asegurados > 0 and (x.ingreso_clp - x.costo_variable_clp) > 0
       then round(x.costo_fijo_clp / ((x.ingreso_clp - x.costo_variable_clp) / x.asegurados), 1) end,
  case
    when x.asegurados = 0 then 'sin produccion'
    when x.ingreso_clp - x.costo_fijo_clp - x.costo_variable_clp < 0 then 'no cubre su costo'
    when x.asegurados >= coalesce(x.meta_asignada, 0) then 'en meta'
    when x.asegurados >= x.meta_asignada * (select t from avance_periodo) then 'en ritmo'
    else 'bajo ritmo'
  end
from armado x
order by x.ingreso_clp - x.costo_fijo_clp - x.costo_variable_clp desc;
$fn$;

comment on function control_ejecutivo is
  'Una fila por ejecutivo con el resultado de su gestión, su meta
   asignada, su ritmo y su punto de equilibrio individual.';
