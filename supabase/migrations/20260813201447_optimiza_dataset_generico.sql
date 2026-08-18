-- Evita evaluar una política ALL adicional en cada SELECT. Separamos las
-- escrituras por operación manteniendo exactamente el mismo control tenant/admin.
drop policy if exists dataset_campo_escritura on public.dataset_campo;

create policy dataset_campo_insertar on public.dataset_campo
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.es_admin())
  );

create policy dataset_campo_actualizar on public.dataset_campo
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.es_admin())
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.es_admin())
  );

create policy dataset_campo_eliminar on public.dataset_campo
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.es_admin())
  );

-- Es la ruta principal de Inicio, Datos, catálogo y consulta universal.
create index if not exists carga_dataset_estado_created_idx
  on public.carga (dataset_id, estado, created_at desc)
  where dataset_id is not null;
;
