create or replace function bsc_periodo(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  perspectiva  text,
  orden        int,
  indicador    text,
  valor        numeric,
  unidad       text,
  meta         numeric,
  cumplimiento numeric,
  sentido      text,
  detalle      text
)
language sql
stable
security invoker
set search_path = public
as $fn$
with
uf as (select uf_del_periodo(p_desde, p_hasta) as v),
ing as (select * from ingreso_periodo(p_desde, p_hasta, p_campana)),
cos as (select * from costos_periodo(p_desde, p_hasta, p_campana)),
tot as (
  select
    coalesce((select sum(ingreso_clp) from ing), 0) as ingreso,
    coalesce((select sum(ingreso_uf)  from ing), 0) as ingreso_uf,
    coalesce((select sum(monto_clp)   from cos), 0) as costo,
    coalesce((select sum(asegurados)  from ing), 0) as asegurados,
    coalesce((select sum(contratos)   from ing), 0) as contratos,
    coalesce((select sum(meta)        from ing), 0) as meta_asegurados
),
g as (
  select
    count(*)::numeric                                                as gestiones,
    count(distinct ge.cliente_id)::numeric                           as clientes,
    count(*) filter (where ti.cuenta_como_contacto)::numeric         as contactos,
    count(*) filter (where ti.categoria = 'rechazo')::numeric        as rechazos,
    count(*) filter (where ti.codigo = 'no volver a llamar')::numeric as no_llamar,
    count(*) filter (where ti.categoria = 'pendiente')::numeric      as agendados,
    count(distinct ge.ejecutivo_id)::numeric                         as ejecutivos,
    count(distinct ge.fecha::date)::numeric                          as dias
  from gestion ge
  left join tipificacion ti on ti.id = ge.tipificacion_id
  where ge.fecha::date between p_desde and p_hasta
    and (p_campana is null or ge.campana_id = p_campana)
),
cot as (
  select count(*)::numeric n from cotizacion
  where fecha::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
asis as (
  select
    count(*) filter (where marca = 'P')::numeric as presentes,
    count(*)::numeric as marcas
  from asistencia
  where fecha between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
-- Dispersión del equipo: cuánto rinde el cuartil superior frente al
-- inferior. Es la brecha que se puede cerrar sin contratar a nadie.
rank_ej as (
  select
    ejecutivo,
    asegurados,
    ntile(4) over (order by asegurados) as cuartil
  from economia_ejecutivo(p_desde, p_hasta, p_campana)
  where asegurados > 0
),
disp as (
  select
    avg(asegurados) filter (where cuartil = 4) as q4,
    avg(asegurados) filter (where cuartil = 1) as q1,
    percentile_cont(0.5) within group (order by asegurados) as mediana,
    count(*) as n
  from rank_ej
)
select * from (values
  -- ------------------------------------------------------------------
  ('Financiera', 1, 'Ingreso del periodo',
    (select ingreso from tot), 'clp',
    (select case when meta_asegurados > 0 and asegurados > 0
                 then round(ingreso / asegurados * meta_asegurados, 0) end from tot),
    (select case when meta_asegurados > 0 and asegurados > 0
                 then round(asegurados::numeric / meta_asegurados * 100, 1) end from tot),
    'mas_mejor',
    'Lo que factura el contact center según la tarifa vigente. La meta es el ingreso que daría cumplir la meta de asegurados al mismo mix.'),

  ('Financiera', 2, 'Costo total',
    (select costo from tot), 'clp', null::numeric, null::numeric, 'menos_mejor',
    'Remuneración con leyes sociales más los costos de operación cargados en el mantenedor.'),

  ('Financiera', 3, 'Margen',
    (select ingreso - costo from tot), 'clp', null::numeric, null::numeric, 'mas_mejor',
    'Ingreso menos costo. Sin remuneración cargada, es igual al ingreso.'),

  ('Financiera', 4, 'Margen sobre ingreso',
    (select case when ingreso > 0 then round((ingreso - costo) / ingreso * 100, 1) end from tot),
    'pct', null::numeric, null::numeric, 'mas_mejor',
    'Qué porcentaje de cada peso facturado queda después de costos.'),

  ('Financiera', 5, 'Ingreso por asegurado',
    (select case when asegurados > 0 then round(ingreso_uf / asegurados, 3) end from tot),
    'uf', null::numeric, null::numeric, 'mas_mejor',
    'Tarifa media obtenida. Sube con el mix: titulares mayores y pólizas con adicionales pagan más.'),

  ('Financiera', 6, 'Costo por asegurado',
    (select case when asegurados > 0 then round(costo / asegurados, 0) end from tot),
    'clp', null::numeric, null::numeric, 'menos_mejor',
    'Cuánto cuesta producir un asegurado. Es el número que hay que comparar contra la tarifa.'),

  -- ------------------------------------------------------------------
  ('Cliente', 1, 'Contactabilidad',
    (select case when gestiones > 0 then round(contactos / gestiones * 100, 1) end from g),
    'pct', null::numeric, null::numeric, 'mas_mejor',
    'De cada cien intentos, en cuántos se habló con la persona. Mide la calidad de la base y del horario de marcado, no del ejecutivo.'),

  ('Cliente', 2, 'Clientes gestionados',
    (select clientes from g), 'entero', null::numeric, null::numeric, 'mas_mejor',
    'Personas únicas tocadas en el periodo.'),

  ('Cliente', 3, 'Intentos por cliente',
    (select case when clientes > 0 then round(gestiones / clientes, 2) end from g),
    'decimal', null::numeric, null::numeric, 'mas_mejor',
    'Insistencia media. Muy bajo quema base; muy alto molesta y no convierte.'),

  ('Cliente', 4, 'Tasa de rechazo',
    (select case when contactos > 0 then round(rechazos / contactos * 100, 1) end from g),
    'pct', null::numeric, null::numeric, 'menos_mejor',
    'De los que sí contestaron, cuántos dijeron que no. Es la señal más limpia de si el producto y el discurso calzan con la base.'),

  ('Cliente', 5, 'Base quemada',
    (select case when clientes > 0 then round(no_llamar / clientes * 100, 1) end from g),
    'pct', null::numeric, null::numeric, 'menos_mejor',
    'Clientes que pidieron no volver a ser llamados. Es pérdida permanente de base.'),

  -- ------------------------------------------------------------------
  ('Procesos', 1, 'Gestiones',
    (select gestiones from g), 'entero', null::numeric, null::numeric, 'mas_mejor',
    'Volumen total de intentos de contacto.'),

  ('Procesos', 2, 'Gestiones por ejecutivo-día',
    (select case when ejecutivos > 0 and dias > 0
                 then round(gestiones / (ejecutivos * dias), 1) end from g),
    'decimal', null::numeric, null::numeric, 'mas_mejor',
    'Intensidad de marcado. Es lo que separa un problema de esfuerzo de uno de efectividad.'),

  ('Procesos', 3, 'Conversión contacto a venta',
    (select case when (select contactos from g) > 0
                 then round((select contratos from tot) / (select contactos from g) * 100, 2) end),
    'pct', null::numeric, null::numeric, 'mas_mejor',
    'De cada cien conversaciones reales, cuántas terminaron en contrato. Es la efectividad del ejecutivo, ya descontada la calidad de la base.'),

  ('Procesos', 4, 'Conversión gestión a venta',
    (select case when (select gestiones from g) > 0
                 then round((select contratos from tot) / (select gestiones from g) * 100, 2) end),
    'pct', null::numeric, null::numeric, 'mas_mejor',
    'Contratos sobre intentos totales. Mezcla calidad de base y efectividad, por eso conviene leerla junto a la anterior.'),

  ('Procesos', 5, 'Cierre sobre cotización',
    (select case when (select n from cot) > 0
                 then round((select contratos from tot) / (select n from cot) * 100, 2) end),
    'pct', null::numeric, null::numeric, 'mas_mejor',
    'Cuántas cotizaciones terminan en venta.'),

  ('Procesos', 6, 'Compromisos abiertos',
    (select agendados from g), 'entero', null::numeric, null::numeric, 'mas_mejor',
    'Agendamientos y rellamadas vivas: el embudo que queda para los próximos días.'),

  -- ------------------------------------------------------------------
  ('Personas', 1, 'Cumplimiento de meta',
    (select case when meta_asegurados > 0
                 then round(asegurados::numeric / meta_asegurados * 100, 1) end from tot),
    'pct', 100::numeric,
    (select case when meta_asegurados > 0
                 then round(asegurados::numeric / meta_asegurados * 100, 1) end from tot),
    'mas_mejor',
    'Asegurados sobre la meta del periodo, sumando todas las líneas.'),

  ('Personas', 2, 'Ejecutivos con venta',
    (select count(*)::numeric from rank_ej), 'entero',
    (select ejecutivos from g), null::numeric, 'mas_mejor',
    'Cuántos de los que gestionaron lograron vender. La diferencia con el total es la cola que no despega.'),

  ('Personas', 3, 'Brecha entre cuartiles',
    (select case when q1 > 0 then round(q4 / q1, 1) end from disp),
    'decimal', null::numeric, null::numeric, 'menos_mejor',
    'Cuántas veces rinde el cuartil superior respecto del inferior. Sobre tres, el problema es de método, no de personas.'),

  ('Personas', 4, 'Mediana del equipo',
    (select mediana from disp), 'decimal', null::numeric, null::numeric, 'mas_mejor',
    'Asegurados del ejecutivo del medio. Más honesta que el promedio, que se infla con un solo caso excepcional.'),

  ('Personas', 5, 'Asistencia',
    (select case when marcas > 0 then round(presentes / marcas * 100, 1) end from asis),
    'pct', null::numeric, null::numeric, 'mas_mejor',
    'Presencias sobre marcas registradas. Requiere la planilla de asistencia cargada.')
) as t(perspectiva, orden, indicador, valor, unidad, meta, cumplimiento, sentido, detalle);
$fn$;

comment on function bsc_periodo is
  'Cuadro de mando integral del periodo, en las cuatro perspectivas de
   Kaplan y Norton. Un indicador sin datos devuelve null y no cero: cero
   es un resultado, la ausencia de dato no.';
