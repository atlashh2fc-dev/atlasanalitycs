-- ---------------------------------------------------------------------
-- 29 · Embudo del periodo
-- ---------------------------------------------------------------------
-- Dónde se rompe la cadena. Cada etapa trae su tasa respecto de la
-- anterior, que es lo que separa un problema de volumen de uno de
-- efectividad.
--
-- Advertencia que la propia vista debe mostrar: las etapas vienen de
-- fuentes distintas y no están enlazadas por cliente, así que las tasas
-- son del periodo y no de una misma cohorte. Sirven para comparar meses
-- y ejecutivos entre sí, no para seguir a una persona por el embudo.
-- ---------------------------------------------------------------------
create or replace function embudo_periodo(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  orden      int,
  etapa      text,
  valor      int,
  tasa_pct   numeric,
  detalle    text
)
language sql
stable
security invoker
set search_path = public
as $$
with g as (
  select
    count(*)::int as gestiones,
    count(*) filter (where ti.cuenta_como_contacto)::int as contactos,
    count(*) filter (where ti.categoria = 'pendiente')::int as compromisos
  from gestion ge
  left join tipificacion ti on ti.id = ge.tipificacion_id
  where ge.fecha::date between p_desde and p_hasta
    and (p_campana is null or ge.campana_id = p_campana)
),
c as (
  select count(*)::int n from cotizacion
  where fecha::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
v as (
  select
    count(distinct ve.id)::int as contratos,
    count(va.id)::int as asegurados
  from venta ve
  join venta_asegurado va on va.venta_id = ve.id
  where ve.fecha_solicitud::date between p_desde and p_hasta
    and (p_campana is null or ve.campana_id = p_campana)
),
etapas as (
  select * from (values
    (1, 'Gestiones',   (select gestiones from g),
        'Intentos de contacto del discador'),
    (2, 'Contactos',   (select contactos from g),
        'Gestiones en las que se habló con la persona'),
    (3, 'Compromisos', (select compromisos from g),
        'Agendamientos y rellamadas vivas'),
    (4, 'Cotizaciones',(select n from c),
        'Cotizaciones emitidas en el periodo'),
    (5, 'Ventas',      (select contratos from v),
        'Contratos cerrados'),
    (6, 'Asegurados',  (select asegurados from v),
        'Personas cubiertas: titulares más adicionales')
  ) as t(orden, etapa, valor, detalle)
)
select
  e.orden,
  e.etapa,
  e.valor,
  case when p.valor > 0 then round(e.valor::numeric / p.valor * 100, 2) end as tasa_pct,
  e.detalle
from etapas e
left join etapas p on p.orden = e.orden - 1
order by e.orden;
$$;;
