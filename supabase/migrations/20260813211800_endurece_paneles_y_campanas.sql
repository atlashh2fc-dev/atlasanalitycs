-- Ajuste posterior para proyectos que ya recibieron las dos migraciones de
-- flujo: evita que una policy ALL duplique la policy SELECT y ejecuta la
-- asignación con permisos/RLS del administrador autenticado.
drop policy if exists panel_widget_escritura on public.panel_widget;
drop policy if exists panel_widget_insertar on public.panel_widget;
drop policy if exists panel_widget_actualizar on public.panel_widget;
drop policy if exists panel_widget_eliminar on public.panel_widget;

create policy panel_widget_insertar on public.panel_widget
  for insert to authenticated
  with check (exists (
    select 1 from public.panel p
     where p.id = panel_widget.panel_id
       and p.tenant_id = public.current_tenant_id()
       and (p.perfil_id = auth.uid() or (p.perfil_id is null and public.es_admin()))
  ));

create policy panel_widget_actualizar on public.panel_widget
  for update to authenticated
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

create policy panel_widget_eliminar on public.panel_widget
  for delete to authenticated
  using (exists (
    select 1 from public.panel p
     where p.id = panel_widget.panel_id
       and p.tenant_id = public.current_tenant_id()
       and (p.perfil_id = auth.uid() or (p.perfil_id is null and public.es_admin()))
  ));

alter function public.asignar_campana_dataset(uuid, uuid) security invoker;
