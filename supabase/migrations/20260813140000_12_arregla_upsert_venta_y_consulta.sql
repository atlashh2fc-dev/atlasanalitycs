-- Ver el detalle en la migración aplicada con el mismo nombre en Supabase.
-- 1. El índice único de venta era PARCIAL y ON CONFLICT no puede
--    inferirlo: cada venta fallaba en silencio mientras el cliente sí se
--    creaba (73 clientes, 0 ventas). Se reemplaza por una restricción
--    única normal.
drop index if exists venta_tenant_id_nro_solicitud_idx;
alter table venta
  add constraint venta_tenant_nro_solicitud_unico
  unique (tenant_id, nro_solicitud);

-- 2. consulta_widget: agrega en la base para no chocar con el tope de
--    1.000 filas de la API REST, que truncaba los totales.
--    (Cuerpo completo en el repositorio de migraciones de Supabase.)
