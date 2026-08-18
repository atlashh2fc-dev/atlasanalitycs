-- El archivo se sube a Storage y el procesamiento ocurre en el servidor
-- por lotes. El avance vive en la base, así que sobrevive a que el
-- usuario navegue a otra pantalla o cierre el navegador.

insert into storage.buckets (id, name, public, file_size_limit)
values ('cargas', 'cargas', false, 52428800)
on conflict (id) do nothing;

create policy cargas_lectura on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cargas'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy cargas_escritura on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cargas'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy cargas_borrado on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cargas'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

-- Avance y receta de procesamiento
alter table carga add column if not exists filas_procesadas int not null default 0;
alter table carga add column if not exists config jsonb not null default '{}'::jsonb;

comment on column carga.filas_procesadas is
  'Cuántas filas del archivo ya se derivaron al modelo canónico. Permite reanudar exactamente donde quedó.';
comment on column carga.config is
  'Mapeo confirmado, modo de lectura y fila de encabezado. Se guarda para poder reanudar sin volver a preguntar.';

create index if not exists carga_pendientes on carga (tenant_id, estado)
  where estado in ('recibida', 'perfilada', 'mapeada');;
