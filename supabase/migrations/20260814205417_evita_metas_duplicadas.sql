-- Una meta mensual se guarda una sola vez por alcance. Antes el formulario
-- siempre hacía INSERT, por lo que presionar dos veces "Agregar meta" creaba
-- dos objetivos idénticos y cualquier agregado podía leer 500 en vez de 250.
with repetidas as (
  select id,
         row_number() over (
           partition by campana_id, agrupacion_meta, producto_id, ejecutivo_id,
                        unidad, periodo_inicio, periodo_fin
           order by created_at, id
         ) as posicion
    from public.meta
)
delete from public.meta m
 using repetidas r
 where m.id = r.id
   and r.posicion > 1;

create unique index meta_alcance_periodo_unico
  on public.meta (
    campana_id, agrupacion_meta, producto_id, ejecutivo_id,
    unidad, periodo_inicio, periodo_fin
  ) nulls not distinct;

comment on index public.meta_alcance_periodo_unico is
  'Impide duplicar una meta para la misma campaña, alcance, unidad y vigencia.';
;
