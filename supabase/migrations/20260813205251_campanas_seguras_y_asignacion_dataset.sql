create or replace function public.tg_campana_mismo_tenant()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.campana_id is not null and not exists (
    select 1 from public.campana c
     where c.id = new.campana_id and c.tenant_id = new.tenant_id
  ) then raise exception 'La campaña y el registro deben pertenecer al mismo espacio.'; end if;
  return new;
end;
$$;
revoke execute on function public.tg_campana_mismo_tenant() from public, anon, authenticated;

drop trigger if exists t_dataset_campana_tenant on public.dataset;
create trigger t_dataset_campana_tenant
  before insert or update of tenant_id, campana_id on public.dataset
  for each row execute function public.tg_campana_mismo_tenant();
drop trigger if exists t_carga_campana_tenant on public.carga;
create trigger t_carga_campana_tenant
  before insert or update of tenant_id, campana_id on public.carga
  for each row execute function public.tg_campana_mismo_tenant();

create or replace function public.asignar_campana_dataset(p_dataset uuid,p_campana uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_user uuid := auth.uid(); v_tenant uuid; v_admin boolean;
  v_cargas int := 0; v_registros int := 0; v_filas int;
begin
  if v_user is null then raise exception 'Sin sesión activa.'; end if;
  select p.tenant_id, p.rol = 'admin' into v_tenant, v_admin
    from public.perfil p where p.id = v_user and p.activo;
  if v_tenant is null then raise exception 'El usuario no tiene un espacio activo.'; end if;
  if not coalesce(v_admin,false) then raise exception 'Sólo un administrador puede asignar campañas.'; end if;
  if not exists (select 1 from public.dataset d where d.id=p_dataset and d.tenant_id=v_tenant)
    then raise exception 'La base no existe o no pertenece a tu espacio.'; end if;
  if p_campana is not null and not exists (
    select 1 from public.campana c where c.id=p_campana and c.tenant_id=v_tenant and c.activo
  ) then raise exception 'La campaña no existe, está inactiva o pertenece a otro espacio.'; end if;

  update public.dataset set campana_id=p_campana where id=p_dataset and tenant_id=v_tenant;
  update public.carga set campana_id=p_campana,
    config=jsonb_set(coalesce(config,'{}'::jsonb),'{campanaId}',coalesce(to_jsonb(p_campana),'null'::jsonb),true)
    where dataset_id=p_dataset and tenant_id=v_tenant;
  get diagnostics v_cargas = row_count;

  update public.gestion g set campana_id=p_campana where g.tenant_id=v_tenant
    and exists (select 1 from public.carga c where c.id=g.carga_id and c.dataset_id=p_dataset);
  get diagnostics v_filas=row_count; v_registros:=v_registros+v_filas;
  update public.cotizacion x set campana_id=p_campana where x.tenant_id=v_tenant
    and exists (select 1 from public.carga c where c.id=x.carga_id and c.dataset_id=p_dataset);
  get diagnostics v_filas=row_count; v_registros:=v_registros+v_filas;
  update public.venta v set campana_id=p_campana where v.tenant_id=v_tenant
    and exists (select 1 from public.carga c where c.id=v.carga_id and c.dataset_id=p_dataset);
  get diagnostics v_filas=row_count; v_registros:=v_registros+v_filas;
  update public.agendamiento a set campana_id=p_campana where a.tenant_id=v_tenant
    and exists (select 1 from public.carga c where c.id=a.carga_id and c.dataset_id=p_dataset);
  get diagnostics v_filas=row_count; v_registros:=v_registros+v_filas;
  update public.asistencia a set campana_id=p_campana where a.tenant_id=v_tenant
    and exists (select 1 from public.carga c where c.id=a.carga_id and c.dataset_id=p_dataset);
  get diagnostics v_filas=row_count; v_registros:=v_registros+v_filas;
  update public.plantilla_mapeo p set campana_id=p_campana
    where p.dataset_id=p_dataset and p.tenant_id=v_tenant;

  return jsonb_build_object('datasetId',p_dataset,'campanaId',p_campana,
    'cargasActualizadas',v_cargas,'registrosActualizados',v_registros);
end;
$$;
revoke execute on function public.asignar_campana_dataset(uuid,uuid) from public, anon;
grant execute on function public.asignar_campana_dataset(uuid,uuid) to authenticated;
comment on function public.asignar_campana_dataset(uuid,uuid) is
  'Admin-only y tenant-scoped. Asigna o quita una campaña de un dataset y propaga la decisión a sus cargas y hechos derivados.';;
