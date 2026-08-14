-- Mueve extensiones fuera de public
create schema if not exists extensions;
alter extension unaccent set schema extensions;
alter extension pg_trgm set schema extensions;

-- search_path fijo en todas las funciones (evita secuestro de search_path)
alter function normaliza_texto(text)            set search_path = public, extensions;
alter function normaliza_nombre_columna(text)   set search_path = public, extensions;
alter function normaliza_rut(text)              set search_path = public;
alter function dv_rut(bigint)                   set search_path = public;
alter function valida_rut(text)                 set search_path = public;
alter function normaliza_telefono(text)         set search_path = public;
alter function normaliza_email(text)            set search_path = public;
alter function tramo_etario(int)                set search_path = public;
alter function tg_set_updated_at()              set search_path = public;
alter function tg_alias_normaliza()             set search_path = public;
alter function tg_plantilla_firma_hash()        set search_path = public;
alter function tg_cliente_normaliza()           set search_path = public;
alter function tg_cotizacion_normaliza()        set search_path = public;

-- Las funciones SECURITY DEFINER no deben ser invocables sin sesión
revoke execute on function current_tenant_id()          from anon, public;
revoke execute on function es_admin()                   from anon, public;
revoke execute on function campanas_visibles()          from anon, public;
revoke execute on function calcular_kpi_periodo(uuid)   from anon, public;

grant execute on function current_tenant_id()        to authenticated;
grant execute on function es_admin()                 to authenticated;
grant execute on function campanas_visibles()        to authenticated;
grant execute on function calcular_kpi_periodo(uuid) to authenticated;;
