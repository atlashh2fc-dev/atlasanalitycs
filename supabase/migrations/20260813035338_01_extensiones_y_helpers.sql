create extension if not exists "pgcrypto";
create extension if not exists "unaccent";
create extension if not exists "pg_trgm";

create type rol_usuario        as enum ('admin', 'supervisor');
create type tipo_campana       as enum ('inbound', 'outbound', 'venta', 'mixta');
create type estado_carga       as enum ('recibida', 'perfilada', 'mapeada', 'procesada', 'error', 'revertida');
create type modo_lectura       as enum ('tabular', 'matriz');
create type tipo_columna       as enum (
  'rut', 'fecha', 'hora', 'duracion', 'monto', 'uf', 'telefono', 'email',
  'entero', 'decimal', 'booleano', 'categoria', 'texto', 'desconocido');
create type unidad_meta        as enum ('asegurados', 'contratos', 'uf', 'gestiones', 'dias');
create type parentesco         as enum ('titular', 'carga');
create type categoria_tipif    as enum (
  'contacto_efectivo', 'contacto_no_efectivo', 'no_contacto',
  'cierre', 'rechazo', 'pendiente');
create type marca_asistencia   as enum ('P', 'A', 'V', 'L', 'B', 'F', 'S');
create type metodo_enlace      as enum ('email', 'telefono', 'nombre', 'compuesto', 'manual');
create type tipo_periodo       as enum ('dia', 'semana', 'mes', 'movil_30', 'movil_90');
create type accion_auditoria   as enum ('insert', 'update', 'delete', 'revert');

create or replace function normaliza_texto(p text)
returns text language sql immutable parallel safe as $$
  select nullif(regexp_replace(lower(unaccent(coalesce(p, ''))), '\s+', ' ', 'g'), '')::text;
$$;

comment on function normaliza_texto is
  'Minúsculas, sin tildes, espacios colapsados. Base de toda conciliación.';

create or replace function normaliza_nombre_columna(p text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    regexp_replace(lower(unaccent(coalesce(p, ''))), '[^a-z0-9]+', '_', 'g'),
    '^_+|_+$', '', 'g'));
$$;

comment on function normaliza_nombre_columna is
  'RUT_BENEFICIARIO / Rut_Beneficiario / Última agenda -> rut_beneficiario / ultima_agenda.';

create or replace function normaliza_rut(p text)
returns text language plpgsql immutable parallel safe as $$
declare limpio text; cuerpo text; dv text;
begin
  if p is null then return null; end if;
  limpio := upper(regexp_replace(p, '[^0-9kK]', '', 'g'));
  if length(limpio) < 2 then return null; end if;
  cuerpo := left(limpio, length(limpio) - 1);
  dv     := right(limpio, 1);
  if cuerpo !~ '^[0-9]+$' then return null; end if;
  return ltrim(cuerpo, '0') || '-' || dv;
end;
$$;

create or replace function dv_rut(p_cuerpo bigint)
returns text language plpgsql immutable parallel safe as $$
declare suma int := 0; factor int := 2; resto int; n bigint := p_cuerpo;
begin
  while n > 0 loop
    suma   := suma + (n % 10)::int * factor;
    n      := n / 10;
    factor := case when factor = 7 then 2 else factor + 1 end;
  end loop;
  resto := 11 - (suma % 11);
  return case resto when 11 then '0' when 10 then 'K' else resto::text end;
end;
$$;

create or replace function valida_rut(p text)
returns boolean language plpgsql immutable parallel safe as $$
declare norm text; cuerpo text; dv text;
begin
  norm := normaliza_rut(p);
  if norm is null then return false; end if;
  cuerpo := split_part(norm, '-', 1);
  dv     := split_part(norm, '-', 2);
  if cuerpo = '' or length(cuerpo) > 9 then return false; end if;
  return dv = dv_rut(cuerpo::bigint);
end;
$$;

comment on function valida_rut is
  'Validación módulo 11. El perfilador la usa sobre una muestra: si >90% valida, la columna es RUT sin importar su nombre.';

create or replace function normaliza_telefono(p text)
returns text language sql immutable parallel safe as $$
  select case
           when d is null or length(d) < 8 then null
           when length(d) = 8  then '569' || d
           when length(d) = 9  then '56'  || d
           when length(d) = 11 then d
           else right(d, 11)
         end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) s;
$$;

create or replace function normaliza_email(p text)
returns text language sql immutable parallel safe as $$
  select nullif(lower(btrim(coalesce(p, ''))), '');
$$;

create or replace function tramo_etario(p_edad int)
returns text language sql immutable parallel safe as $$
  select case
           when p_edad is null then null
           when p_edad < 18 then 'MDE'
           when p_edad < 25 then '18-24'
           when p_edad < 50 then '25-49'
           when p_edad < 60 then '50-59'
           when p_edad < 70 then '60-69'
           when p_edad < 75 then '70-74'
           else '75+'
         end;
$$;

create or replace function tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;;
