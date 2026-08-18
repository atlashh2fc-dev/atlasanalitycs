-- Paneles personales con contexto explícito.
alter table public.panel
  add column dataset_id uuid references public.dataset(id) on delete cascade;

alter table public.panel
  add constraint panel_un_solo_contexto
  check (campana_id is null or dataset_id is null);

create index panel_dataset_idx on public.panel (tenant_id, dataset_id)
  where dataset_id is not null;

create unique index panel_perfil_dataset_unico
  on public.panel (perfil_id, dataset_id)
  where perfil_id is not null and dataset_id is not null;

drop policy if exists panel_widget_visible on public.panel_widget;
create policy panel_widget_lectura on public.panel_widget
  for select to authenticated
  using (exists (
    select 1 from public.panel p
     where p.id = panel_widget.panel_id
       and p.tenant_id = public.current_tenant_id()
       and (p.perfil_id is null or p.perfil_id = auth.uid())
  ));
create policy panel_widget_escritura on public.panel_widget
  for all to authenticated
  using (exists (
    select 1 from public.panel p
     where p.id = panel_widget.panel_id
       and p.tenant_id = public.current_tenant_id()
       and (p.perfil_id = auth.uid() or (p.perfil_id is null and public.es_admin()))
  ))
  with check (exists (
    select 1 from public.panel p
     where p.id = panel_widget.panel_id
       and p.tenant_id = public.current_tenant_id()
       and (p.perfil_id = auth.uid() or (p.perfil_id is null and public.es_admin()))
  ));

create or replace function public.tg_panel_dataset_tenant()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare v_tenant uuid;
begin
  if new.dataset_id is null then return new; end if;
  select d.tenant_id into v_tenant from public.dataset d where d.id = new.dataset_id;
  if v_tenant is null or v_tenant <> new.tenant_id then
    raise exception 'El panel y su base deben pertenecer a la misma organización.';
  end if;
  return new;
end;
$$;

create trigger t_panel_dataset_tenant
  before insert or update of tenant_id, dataset_id on public.panel
  for each row execute function public.tg_panel_dataset_tenant();

create or replace function public.obtener_o_crear_panel_dataset(p_dataset uuid)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid := public.current_tenant_id();
  v_panel uuid; v_nombre text;
  v_metrica uuid; v_metrica_nombre text; v_metrica_agregacion text;
  v_dimension uuid; v_dimension_nombre text;
  v_fecha uuid; v_fecha_nombre text;
begin
  if v_user is null or v_tenant is null then raise exception 'Sin sesión activa.'; end if;
  select d.nombre into v_nombre from public.dataset d
   where d.id = p_dataset and d.tenant_id = v_tenant and d.activo;
  if v_nombre is null then raise exception 'Base inexistente o no autorizada.'; end if;

  insert into public.panel (tenant_id, perfil_id, dataset_id, nombre, es_default)
  values (v_tenant, v_user, p_dataset, v_nombre, false)
  on conflict (perfil_id, dataset_id) where perfil_id is not null and dataset_id is not null
  do update set updated_at = now()
  returning id into v_panel;

  if exists (select 1 from public.panel_widget pw where pw.panel_id = v_panel) then return v_panel; end if;

  select dc.id, dc.nombre, coalesce(dc.agregacion, 'sum')
    into v_metrica, v_metrica_nombre, v_metrica_agregacion
    from public.dataset_campo dc
   where dc.dataset_id = p_dataset and dc.activo and dc.rol = 'metrica'
   order by dc.orden, dc.created_at limit 1;
  select dc.id, dc.nombre into v_dimension, v_dimension_nombre
    from public.dataset_campo dc
   where dc.dataset_id = p_dataset and dc.activo and dc.rol = 'dimension'
   order by dc.orden, dc.created_at limit 1;
  select dc.id, dc.nombre into v_fecha, v_fecha_nombre
    from public.dataset_campo dc
   where dc.dataset_id = p_dataset and dc.activo and dc.rol = 'fecha'
   order by dc.orden, dc.created_at limit 1;

  insert into public.panel_widget (panel_id,tipo,titulo,config,x,y,w,h,orden)
  values (v_panel,'kpi','Total de registros',
    jsonb_build_object('fuente','dataset','datasetId',p_dataset,'agregacion','count','tieneFecha',v_fecha is not null),
    0,0,3,4,0);
  if v_metrica is not null then
    insert into public.panel_widget (panel_id,tipo,titulo,config,x,y,w,h,orden)
    values (v_panel,'kpi',v_metrica_nombre,
      jsonb_build_object('fuente','dataset','datasetId',p_dataset,'metricaId',v_metrica,
        'agregacion',v_metrica_agregacion,'tieneFecha',v_fecha is not null),
      3,0,3,4,1);
  end if;
  if v_dimension is not null then
    insert into public.panel_widget (panel_id,tipo,titulo,config,x,y,w,h,orden)
    values (v_panel,'barras',coalesce(v_metrica_nombre,'Registros') || ' por ' || lower(v_dimension_nombre),
      jsonb_strip_nulls(jsonb_build_object('fuente','dataset','datasetId',p_dataset,
        'metricaId',v_metrica,'dimensionId',v_dimension,
        'agregacion',case when v_metrica is null then 'count' else v_metrica_agregacion end,
        'limite',12,'orden','desc','tieneFecha',v_fecha is not null)),
      0,4,6,5,2);
  end if;
  if v_fecha is not null then
    insert into public.panel_widget (panel_id,tipo,titulo,config,x,y,w,h,orden)
    values (v_panel,'area',coalesce(v_metrica_nombre,'Registros') || ' por ' || lower(v_fecha_nombre),
      jsonb_strip_nulls(jsonb_build_object('fuente','dataset','datasetId',p_dataset,
        'metricaId',v_metrica,'dimensionId',v_fecha,
        'agregacion',case when v_metrica is null then 'count' else v_metrica_agregacion end,
        'granularidad','dia','orden','asc','tieneFecha',true)),
      6,4,6,5,3);
  end if;
  return v_panel;
end;
$$;

revoke execute on function public.obtener_o_crear_panel_dataset(uuid) from public, anon;
grant execute on function public.obtener_o_crear_panel_dataset(uuid) to authenticated;
comment on column public.panel.dataset_id is
  'NULL: panel legacy/campaña. UUID: panel personal persistente de una base genérica.';;
