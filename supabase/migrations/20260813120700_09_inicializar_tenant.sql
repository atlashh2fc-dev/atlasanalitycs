-- =====================================================================
-- Atlas Analytics — 09. Arranque de una organización
--
--   Con RLS activo, un usuario recién registrado no puede crear su
--   propio tenant desde el cliente: todavía no tiene perfil, así que
--   current_tenant_id() es nulo y ninguna política lo deja escribir.
--
--   Esta función SECURITY DEFINER resuelve el arranque sin exponer la
--   service role key en la aplicación. Sólo funciona una vez por
--   usuario: si ya tiene perfil, falla.
-- =====================================================================

create or replace function inicializar_tenant(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user    uuid := auth.uid();
  v_email   text;
  v_slug    text;
  v_tenant  uuid;
  v_campana uuid;
  v_inicio  date := date_trunc('month', current_date)::date;
  v_fin     date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  if v_user is null then
    raise exception 'Sin sesión activa.';
  end if;

  if exists (select 1 from perfil where id = v_user) then
    raise exception 'Este usuario ya pertenece a una organización.';
  end if;

  select email into v_email from auth.users where id = v_user;

  v_slug := regexp_replace(lower(unaccent(coalesce(p_nombre, 'atlas'))), '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  if v_slug = '' then v_slug := 'atlas'; end if;
  if exists (select 1 from tenant where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(v_user::text, '-', ''), 1, 6);
  end if;

  insert into tenant (nombre, slug)
       values (coalesce(p_nombre, 'Atlas'), v_slug)
    returning id into v_tenant;

  insert into perfil (id, tenant_id, nombre, email, rol)
       values (v_user, v_tenant, coalesce(v_email, 'Administrador'), coalesce(v_email, ''), 'admin');

  insert into campana (tenant_id, nombre, tipo, fecha_inicio)
       values (v_tenant, 'Venta Seguros', 'venta', v_inicio)
    returning id into v_campana;

  -- Catálogo de productos con su agrupación de meta:
  -- Complementario y Catastrófico comparten meta; Oncológico va aparte.
  insert into producto (tenant_id, nombre, linea, agrupacion_meta) values
    (v_tenant, 'Seguro Complementario',   'Complementario', 'CM+CAT'),
    (v_tenant, 'Seguro Catastrófico',     'Catastrófico',   'CM+CAT'),
    (v_tenant, 'Seguro Oncológico',       'Oncológico',     'ONCO'),
    (v_tenant, 'Seguro Oncológico Total', 'Oncológico',     'ONCO');

  insert into meta (tenant_id, campana_id, agrupacion_meta, unidad, valor, dg_esperados, periodo_inicio, periodo_fin) values
    (v_tenant, v_campana, 'CM+CAT', 'asegurados', 250, 22, v_inicio, v_fin),
    (v_tenant, v_campana, 'ONCO',   'asegurados',  60, 22, v_inicio, v_fin);

  return v_tenant;
end;
$$;

revoke execute on function inicializar_tenant(text) from anon, public;
grant  execute on function inicializar_tenant(text) to authenticated;

comment on function inicializar_tenant is
  'Arranque de una organización: tenant + perfil admin + campaña base + productos + metas del mes.';
