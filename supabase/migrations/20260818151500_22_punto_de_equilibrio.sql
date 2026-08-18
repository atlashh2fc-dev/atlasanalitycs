-- ---------------------------------------------------------------------
-- 22 · Punto de equilibrio
-- ---------------------------------------------------------------------
-- Con la remuneración cargada aparece el número que de verdad decide si
-- la campaña se sostiene: cuántos asegurados hay que producir para que
-- el ingreso cubra el costo.
--
-- Va con dos advertencias que el propio indicador explica:
--   · el sueldo se carga por el periodo completo, así que consultar un
--     mes entero cuando sólo hay ventas hasta la mitad da un margen
--     peor que el real;
--   · la tarifa media depende del mix, y el oncológico sube de tramo al
--     cruzar la meta, así que el equilibrio se mueve.
-- ---------------------------------------------------------------------
create or replace function punto_equilibrio(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  asegurados_equilibrio numeric,
  asegurados_reales     int,
  tarifa_media_clp      numeric,
  costo_total_clp       numeric,
  ultima_venta          date
)
language sql
stable
security invoker
set search_path = public
as $$
with ing as (select * from ingreso_periodo(p_desde, p_hasta, p_campana)),
tot as (
  select
    coalesce(sum(ingreso_clp), 0) as ingreso,
    coalesce(sum(asegurados), 0)  as asegurados
  from ing
),
costo as (
  select coalesce(sum(monto_clp), 0) as total
  from costos_periodo(p_desde, p_hasta, p_campana)
)
select
  case when t.asegurados > 0 and t.ingreso > 0
       then round(c.total / (t.ingreso / t.asegurados), 1) end,
  t.asegurados::int,
  case when t.asegurados > 0 then round(t.ingreso / t.asegurados, 0) end,
  c.total,
  (select max(fecha_solicitud)::date from venta
    where fecha_solicitud::date between p_desde and p_hasta
      and (p_campana is null or campana_id = p_campana))
from tot t cross join costo c;
$$;

comment on function punto_equilibrio is
  'Asegurados necesarios para que el ingreso cubra el costo del periodo,
   a la tarifa media obtenida.';
