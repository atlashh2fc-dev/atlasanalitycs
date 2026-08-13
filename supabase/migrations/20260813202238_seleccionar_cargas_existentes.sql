-- Convierte cargas históricas en una base analizable sin volver a subir el
-- archivo. Un administrador puede organizar cualquier carga de su tenant;
-- los demás usuarios, únicamente las que ellos mismos cargaron.
create or replace function public.usar_cargas_en_dataset(
  p_cargas uuid[],
  p_dataset uuid default null,
  p_nombre text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_admin boolean;
  v_dataset uuid;
  v_solicitadas int;
  v_autorizadas int;
  v_carga uuid;
  v_nombre text := nullif(btrim(p_nombre), '');
begin
  if v_user is null then
    raise exception 'Sin sesión activa.';
  end if;

  select p.tenant_id, p.rol = 'admin'
    into v_tenant, v_admin
    from public.perfil p
   where p.id = v_user and p.activo;

  if v_tenant is null then
    raise exception 'El usuario no tiene un espacio activo.';
  end if;

  select count(distinct x)
    into v_solicitadas
    from unnest(coalesce(p_cargas, array[]::uuid[])) x
   where x is not null;

  if v_solicitadas = 0 or v_solicitadas > 100 then
    raise exception 'Selecciona entre 1 y 100 cargas.';
  end if;

  select count(distinct c.id)
    into v_autorizadas
    from public.carga c
   where c.id = any(p_cargas)
     and c.tenant_id = v_tenant
     and c.estado = 'procesada'
     and (v_admin or c.cargado_por = v_user);

  if v_autorizadas <> v_solicitadas then
    raise exception 'Una o más cargas no existen, no están completas o no te pertenecen.';
  end if;

  if p_dataset is not null then
    select d.id into v_dataset
      from public.dataset d
     where d.id = p_dataset
       and d.tenant_id = v_tenant
       and d.activo;

    if v_dataset is null then
      raise exception 'La base seleccionada no existe.';
    end if;
  else
    if v_nombre is null then
      raise exception 'Escribe un nombre para la nueva base.';
    end if;

    insert into public.dataset (tenant_id, nombre)
    values (v_tenant, v_nombre)
    on conflict (tenant_id, nombre) do update
      set activo = true, updated_at = now()
    returning id into v_dataset;
  end if;

  update public.carga c
     set dataset_id = v_dataset
   where c.id = any(p_cargas)
     and c.tenant_id = v_tenant;

  for v_carga in
    select distinct c.id
      from public.carga c
     where c.id = any(p_cargas) and c.tenant_id = v_tenant
  loop
    perform public.sincronizar_campos_dataset(v_carga);
  end loop;

  return v_dataset;
end;
$$;

revoke execute on function public.usar_cargas_en_dataset(uuid[], uuid, text)
  from public, anon;
grant execute on function public.usar_cargas_en_dataset(uuid[], uuid, text)
  to authenticated;

create index if not exists carga_cargado_por_estado_idx
  on public.carga (cargado_por, estado, created_at desc)
  where cargado_por is not null;

comment on function public.usar_cargas_en_dataset(uuid[], uuid, text) is
  'Organiza cargas completas ya existentes en una base analizable. Admin: tenant completo; usuario: sólo cargas propias.';
