-- ---------------------------------------------------------------------
-- 20 · Identidad de la gestión
-- ---------------------------------------------------------------------
-- El discador entrega su propio ID por gestión. Con él, recargar el
-- mismo archivo actualiza en vez de duplicar.
--
-- El índice es total y no parcial a propósito: ON CONFLICT no sabe
-- inferir índices parciales y el upsert fallaba en silencio. Las
-- gestiones sin ID quedan fuera del índice igual, porque en Postgres
-- dos NULL no colisionan.
-- ---------------------------------------------------------------------
create unique index gestion_id_externo_unico
  on gestion (tenant_id, id_externo);

-- Consultas del cuadro de mando: siempre por periodo y campaña.
create index if not exists gestion_periodo
  on gestion (tenant_id, fecha, campana_id);

create index if not exists gestion_ejecutivo_periodo
  on gestion (tenant_id, ejecutivo_id, fecha);;
