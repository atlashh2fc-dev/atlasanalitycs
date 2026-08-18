-- =====================================================================
-- Atlas Analytics — 07. Row Level Security
--   Regla general:
--     admin      -> todo lo de su tenant
--     supervisor -> sólo las campañas que tiene asignadas
--   Las tablas sin campana_id se restringen sólo por tenant.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Habilitar RLS en todas las tablas de datos
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'tenant','perfil','campana','perfil_campana','ejecutivo','ejecutivo_alias',
    'ejecutivo_campana','producto','meta','metrica_def','auditoria',
    'dataset','carga','carga_columna','fila_cruda','plantilla_mapeo',
    'sinonimo_columna','carga_reversion',
    'cliente','tipificacion','gestion','cotizacion','venta','venta_asegurado',
    'catalogo_dps','venta_preexistencia','anulacion','enlace_cotizacion_venta',
    'agendamiento','asistencia','periodo','kpi_ejecutivo','kpi_equipo'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- Catálogos de referencia: lectura para cualquier usuario autenticado
alter table ges_categoria enable row level security;
alter table ges_problema  enable row level security;
alter table feriado       enable row level security;

create policy ges_categoria_lectura on ges_categoria
  for select to authenticated using (true);
create policy ges_problema_lectura on ges_problema
  for select to authenticated using (true);
create policy feriado_lectura on feriado
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Tenant y perfil
-- ---------------------------------------------------------------------
create policy tenant_propio on tenant
  for select to authenticated
  using (id = current_tenant_id());

create policy perfil_lectura on perfil
  for select to authenticated
  using (tenant_id = current_tenant_id());

create policy perfil_admin_escribe on perfil
  for all to authenticated
  using (tenant_id = current_tenant_id() and es_admin())
  with check (tenant_id = current_tenant_id() and es_admin());

-- ---------------------------------------------------------------------
-- Tablas restringidas sólo por tenant
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'ejecutivo','ejecutivo_alias','producto','metrica_def','auditoria',
    'dataset','sinonimo_columna','cliente','tipificacion','catalogo_dps','periodo'
  ] loop
    execute format($f$
      create policy %1$s_tenant_lectura on %1$I
        for select to authenticated
        using (tenant_id = current_tenant_id());
    $f$, t);

    execute format($f$
      create policy %1$s_tenant_escritura on %1$I
        for all to authenticated
        using (tenant_id = current_tenant_id() and es_admin())
        with check (tenant_id = current_tenant_id() and es_admin());
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Tablas con campana_id: filtradas por campañas visibles
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'campana','carga','cotizacion','venta','gestion','agendamiento',
    'asistencia','meta','kpi_ejecutivo','kpi_equipo','plantilla_mapeo'
  ] loop
    if t = 'campana' then
      execute $f$
        create policy campana_visible on campana
          for select to authenticated
          using (id in (select campanas_visibles()));
      $f$;
      execute $f$
        create policy campana_escritura on campana
          for all to authenticated
          using (tenant_id = current_tenant_id() and es_admin())
          with check (tenant_id = current_tenant_id() and es_admin());
      $f$;
    else
      execute format($f$
        create policy %1$s_campana_visible on %1$I
          for select to authenticated
          using (
            tenant_id = current_tenant_id()
            and (campana_id is null or campana_id in (select campanas_visibles()))
          );
      $f$, t);

      execute format($f$
        create policy %1$s_campana_escritura on %1$I
          for all to authenticated
          using (
            tenant_id = current_tenant_id()
            and (es_admin() or campana_id in (select campanas_visibles()))
          )
          with check (
            tenant_id = current_tenant_id()
            and (es_admin() or campana_id in (select campanas_visibles()))
          );
      $f$, t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Tablas hijas: heredan la visibilidad del padre
-- ---------------------------------------------------------------------
create policy carga_columna_visible on carga_columna
  for all to authenticated
  using (exists (select 1 from carga c where c.id = carga_columna.carga_id))
  with check (exists (select 1 from carga c where c.id = carga_columna.carga_id));

create policy fila_cruda_visible on fila_cruda
  for all to authenticated
  using (exists (select 1 from carga c where c.id = fila_cruda.carga_id))
  with check (exists (select 1 from carga c where c.id = fila_cruda.carga_id));

create policy carga_reversion_visible on carga_reversion
  for all to authenticated
  using (exists (select 1 from carga c where c.id = carga_reversion.carga_id))
  with check (exists (select 1 from carga c where c.id = carga_reversion.carga_id));

create policy venta_asegurado_visible on venta_asegurado
  for all to authenticated
  using (exists (select 1 from venta v where v.id = venta_asegurado.venta_id))
  with check (exists (select 1 from venta v where v.id = venta_asegurado.venta_id));

create policy venta_preexistencia_visible on venta_preexistencia
  for all to authenticated
  using (exists (select 1
                   from venta_asegurado va
                  where va.id = venta_preexistencia.venta_asegurado_id))
  with check (exists (select 1
                        from venta_asegurado va
                       where va.id = venta_preexistencia.venta_asegurado_id));

create policy anulacion_visible on anulacion
  for all to authenticated
  using (exists (select 1 from venta v where v.id = anulacion.venta_id))
  with check (exists (select 1 from venta v where v.id = anulacion.venta_id));

create policy enlace_visible on enlace_cotizacion_venta
  for all to authenticated
  using (exists (select 1 from venta v where v.id = enlace_cotizacion_venta.venta_id))
  with check (exists (select 1 from venta v where v.id = enlace_cotizacion_venta.venta_id));

create policy perfil_campana_visible on perfil_campana
  for select to authenticated
  using (exists (select 1 from perfil p
                  where p.id = perfil_campana.perfil_id
                    and p.tenant_id = current_tenant_id()));

create policy perfil_campana_admin on perfil_campana
  for all to authenticated
  using (es_admin() and exists (select 1 from perfil p
                                 where p.id = perfil_campana.perfil_id
                                   and p.tenant_id = current_tenant_id()))
  with check (es_admin() and exists (select 1 from perfil p
                                      where p.id = perfil_campana.perfil_id
                                        and p.tenant_id = current_tenant_id()));

create policy ejecutivo_campana_visible on ejecutivo_campana
  for all to authenticated
  using (campana_id in (select campanas_visibles()))
  with check (campana_id in (select campanas_visibles()));

-- ---------------------------------------------------------------------
-- Las vistas heredan RLS de las tablas base (security_invoker)
-- ---------------------------------------------------------------------
alter view v_dias_gestionados   set (security_invoker = on);
alter view v_movilidad_cuartil  set (security_invoker = on);
alter view v_matriz_transicion  set (security_invoker = on);
alter view v_tendencia_equipo   set (security_invoker = on);
