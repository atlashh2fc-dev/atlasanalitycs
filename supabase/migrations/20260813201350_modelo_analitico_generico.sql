-- =====================================================================
-- Atlas Analytics — Modelo analítico genérico por dataset
--
-- fila_cruda sigue siendo la fuente de verdad. dataset_campo entrega
-- identidad semántica estable a las columnas aunque un archivo posterior
-- cambie el encabezado. Todas las consultas agregan dentro de Postgres.
-- =====================================================================

-- Estas columnas existen en producción, pero faltaban en el historial SQL
-- versionado. IF NOT EXISTS conserva compatibilidad en ambos escenarios.
alter table carga add column if not exists filas_procesadas int not null default 0;
alter table carga add column if not exists config jsonb not null default '{}'::jsonb;

alter table carga add constraint carga_filas_procesadas_no_negativas
  check (filas_procesadas >= 0) not valid;

create table dataset_campo (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  dataset_id  uuid not null references dataset(id) on delete cascade,
  clave       text not null,
  nombre      text not null,
  tipo        tipo_columna not null default 'desconocido',
  rol         text not null default 'dimension'
              check (rol in ('identificador', 'dimension', 'metrica', 'fecha', 'ignorado')),
  agregacion  text check (agregacion is null or agregacion in
              ('count', 'count_distinct', 'sum', 'avg', 'min', 'max')),
  unidad      text,
  activo      boolean not null default true,
  orden       smallint not null default 0,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (dataset_id, clave)
);

create index dataset_campo_tenant_dataset_idx
  on dataset_campo (tenant_id, dataset_id, activo, orden);

create trigger t_dataset_campo_updated before update on dataset_campo
  for each row execute function tg_set_updated_at();

alter table carga_columna
  add column dataset_campo_id uuid references dataset_campo(id) on delete set null;

create index carga_columna_dataset_campo_idx
  on carga_columna (dataset_campo_id, carga_id);

-- Impide asociar un campo a otro tenant, incluso si una escritura privilegiada
-- omite tenant_id o intenta enviar uno manipulado.
create or replace function tg_dataset_campo_tenant()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_tenant uuid;
begin
  select d.tenant_id into v_tenant
    from public.dataset d
   where d.id = new.dataset_id;

  if v_tenant is null then
    raise exception 'Dataset inexistente.';
  end if;

  if new.tenant_id is not null and new.tenant_id <> v_tenant then
    raise exception 'El campo y el dataset deben pertenecer a la misma organización.';
  end if;

  new.tenant_id := v_tenant;
  new.clave := public.normaliza_nombre_columna(new.clave);
  if new.clave is null or new.clave = '' then
    raise exception 'La clave del campo no puede estar vacía.';
  end if;
  return new;
end;
$$;

create trigger t_dataset_campo_tenant
  before insert or update of tenant_id, dataset_id, clave on dataset_campo
  for each row execute function tg_dataset_campo_tenant();

alter table dataset_campo enable row level security;
alter table dataset_campo force row level security;

create policy dataset_campo_lectura on dataset_campo
  for select to authenticated
  using (tenant_id = (select current_tenant_id()));

create policy dataset_campo_escritura on dataset_campo
  for all to authenticated
  using (tenant_id = (select current_tenant_id()) and (select es_admin()))
  with check (tenant_id = (select current_tenant_id()) and (select es_admin()));

grant select, insert, update, delete on dataset_campo to authenticated;

-- ---------------------------------------------------------------------
-- Conversión tolerante de valores de Excel almacenados como JSON.
-- Nunca lanza por un valor defectuoso: lo convierte en NULL para que el
-- dashboard siga disponible y la calidad de datos pueda reportarlo.
-- ---------------------------------------------------------------------
create or replace function atlas_numero(p_valor text)
returns numeric
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  v text;
  v_punto int;
  v_coma int;
begin
  if p_valor is null or btrim(p_valor) = '' then return null; end if;
  v := regexp_replace(btrim(p_valor), '[^0-9,.-]', '', 'g');
  if v = '' or v = '-' then return null; end if;
  v_punto := strpos(reverse(v), '.');
  v_coma := strpos(reverse(v), ',');

  if v_punto > 0 and v_coma > 0 then
    if v_punto < v_coma then
      v := replace(v, ',', '');
    else
      v := replace(replace(v, '.', ''), ',', '.');
    end if;
  elsif v_coma > 0 then
    v := replace(v, ',', '.');
  elsif v ~ '^-?[0-9]{1,3}(\.[0-9]{3})+$' then
    v := replace(v, '.', '');
  end if;

  return v::numeric;
exception when invalid_text_representation or numeric_value_out_of_range then
  return null;
end;
$$;

create or replace function atlas_fecha(p_valor text)
returns timestamptz
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  v text := nullif(btrim(p_valor), '');
  m text[];
begin
  if v is null then return null; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}' then return v::timestamptz; end if;
  m := regexp_match(v, '^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?');
  if m is not null then
    return make_timestamptz(m[3]::int, m[2]::int, m[1]::int,
      coalesce(m[4], '0')::int, coalesce(m[5], '0')::int,
      coalesce(m[6], '0')::double precision, 'UTC');
  end if;
  return v::timestamptz;
exception when others then
  return null;
end;
$$;

-- Crea/actualiza el catálogo estable a partir del perfil de una carga y
-- enlaza cada encabezado concreto con su dataset_campo.
create or replace function sincronizar_campos_dataset(p_carga uuid)
returns int
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_dataset uuid;
  v_tenant uuid;
  v_total int;
begin
  select c.dataset_id, c.tenant_id into v_dataset, v_tenant
    from public.carga c
   where c.id = p_carga;

  if v_dataset is null then
    raise exception 'La carga no tiene un dataset asociado.';
  end if;

  insert into public.dataset_campo
    (tenant_id, dataset_id, clave, nombre, tipo, rol, agregacion, orden)
  select v_tenant,
         v_dataset,
         coalesce(nullif(cc.nombre_normalizado, ''), 'columna_' || cc.posicion),
         coalesce(nullif(cc.nombre_original, ''), 'Columna ' || cc.posicion),
         cc.tipo_detectado,
         case
           when cc.descartada then 'ignorado'
           when cc.rol_semantico = 'metrica' then 'metrica'
           when cc.rol_semantico = 'dimension' then 'dimension'
           when cc.tipo_detectado = 'fecha' then 'fecha'
           when cc.tipo_detectado in ('entero', 'decimal', 'monto', 'uf', 'duracion') then 'metrica'
           when cc.tipo_detectado in ('rut', 'email', 'telefono') then 'identificador'
           else 'dimension'
         end,
         case
           when cc.descartada then null
           when cc.rol_semantico = 'metrica'
             or cc.tipo_detectado in ('entero', 'decimal', 'monto', 'uf') then 'sum'
           when cc.tipo_detectado = 'duracion' then 'avg'
           when cc.tipo_detectado in ('rut', 'email', 'telefono') then 'count_distinct'
           else null
         end,
         cc.posicion
    from public.carga_columna cc
   where cc.carga_id = p_carga
  on conflict (dataset_id, clave) do update
    set nombre = excluded.nombre,
        tipo = case when dataset_campo.tipo = 'desconocido' then excluded.tipo else dataset_campo.tipo end,
        updated_at = now();

  update public.carga_columna cc
     set dataset_campo_id = dc.id
    from public.dataset_campo dc
   where cc.carga_id = p_carga
     and dc.dataset_id = v_dataset
     and dc.clave = coalesce(nullif(cc.nombre_normalizado, ''), 'columna_' || cc.posicion);

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function sincronizar_campos_dataset(uuid) from public, anon;
grant execute on function sincronizar_campos_dataset(uuid) to authenticated;

-- Catálogo que consume la UI. El conteo se ejecuta en Postgres y no está
-- sujeto al límite de 1.000 filas de PostgREST.
create or replace function catalogo_dataset(p_dataset uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with d as (
    select id, nombre, descripcion
      from public.dataset
     where id = p_dataset
       and tenant_id = (select public.current_tenant_id())
  ), campos as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', dc.id, 'clave', dc.clave, 'nombre', dc.nombre, 'tipo', dc.tipo,
      'rol', dc.rol, 'agregacion', dc.agregacion, 'unidad', dc.unidad,
      'activo', dc.activo, 'config', dc.config
    ) order by dc.orden, dc.nombre), '[]'::jsonb) valor
      from public.dataset_campo dc
     where dc.dataset_id = p_dataset and dc.activo
  ), resumen as (
    select count(fr.id) as filas,
           count(distinct c.id) as cargas,
           min(c.periodo_inicio) as desde,
           max(c.periodo_fin) as hasta,
           max(c.created_at) as ultima_carga
      from public.carga c
      left join public.fila_cruda fr on fr.carga_id = c.id
     where c.dataset_id = p_dataset
       and c.estado = 'procesada'
  )
  select case when not exists (select 1 from d) then null else jsonb_build_object(
    'dataset', (select to_jsonb(d) from d),
    'resumen', (select to_jsonb(resumen) from resumen),
    'campos', (select valor from campos),
    'metricas', (select coalesce(jsonb_agg(to_jsonb(dc) order by dc.orden), '[]'::jsonb)
                   from public.dataset_campo dc where dc.dataset_id = p_dataset and dc.activo
                    and dc.rol in ('metrica', 'identificador')),
    'dimensiones', (select coalesce(jsonb_agg(to_jsonb(dc) order by dc.orden), '[]'::jsonb)
                      from public.dataset_campo dc where dc.dataset_id = p_dataset and dc.activo
                       and dc.rol in ('dimension', 'fecha'))
  ) end;
$$;

revoke execute on function catalogo_dataset(uuid) from public, anon;
grant execute on function catalogo_dataset(uuid) to authenticated;

-- Consulta universal. p_metrica NULL representa "cantidad de registros".
-- La extracción usa carga_columna para admitir encabezados diferentes entre
-- cargas del mismo dataset. El LIMIT se aplica después del GROUP BY.
create or replace function consulta_dataset(
  p_dataset uuid,
  p_metrica uuid default null,
  p_dimension uuid default null,
  p_agregacion text default null,
  p_granularidad text default 'dia',
  p_desde date default null,
  p_hasta date default null,
  p_limite int default 50,
  p_orden text default 'desc'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_agregacion text;
  v_dim_tipo public.tipo_columna;
  v_fecha uuid;
  v_series jsonb;
  v_total numeric;
  v_filas bigint;
begin
  if not exists (
    select 1 from public.dataset d
     where d.id = p_dataset and d.tenant_id = public.current_tenant_id()
  ) then raise exception 'Dataset inexistente o no autorizado.'; end if;

  if p_metrica is not null and not exists (
    select 1 from public.dataset_campo dc
     where dc.id = p_metrica and dc.dataset_id = p_dataset and dc.activo
       and dc.rol in ('metrica', 'identificador')
  ) then raise exception 'Métrica inválida para el dataset.'; end if;

  if p_dimension is not null then
    select dc.tipo into v_dim_tipo from public.dataset_campo dc
     where dc.id = p_dimension and dc.dataset_id = p_dataset and dc.activo
       and dc.rol in ('dimension', 'fecha');
    if not found then raise exception 'Dimensión inválida para el dataset.'; end if;
  end if;

  select coalesce(p_agregacion, dc.agregacion, case when p_metrica is null then 'count' else 'sum' end)
    into v_agregacion
    from (select 1) x
    left join public.dataset_campo dc on dc.id = p_metrica;
  if v_agregacion not in ('count','count_distinct','sum','avg','min','max') then
    raise exception 'Agregación no permitida.';
  end if;
  if p_granularidad not in ('dia','semana','mes','trimestre','ano') then
    raise exception 'Granularidad no permitida.';
  end if;

  v_fecha := case when v_dim_tipo = 'fecha' then p_dimension else null end;
  if v_fecha is null then
    select dc.id into v_fecha from public.dataset_campo dc
     where dc.dataset_id = p_dataset and dc.activo and dc.rol = 'fecha'
     order by dc.orden, dc.created_at limit 1;
  end if;

  with base as (
    select fr.id,
           case when p_metrica is null then null else fr.datos ->> cm.nombre_original end valor_metrica,
           case when p_dimension is null then null else fr.datos ->> cd.nombre_original end valor_dimension,
           public.atlas_fecha(fr.datos ->> cf.nombre_original) valor_fecha
      from public.carga c
      join public.fila_cruda fr on fr.carga_id = c.id
      left join lateral (select x.nombre_original from public.carga_columna x
        where x.carga_id = c.id and x.dataset_campo_id = p_metrica order by x.posicion limit 1) cm on true
      left join lateral (select x.nombre_original from public.carga_columna x
        where x.carga_id = c.id and x.dataset_campo_id = p_dimension order by x.posicion limit 1) cd on true
      left join lateral (select x.nombre_original from public.carga_columna x
        where x.carga_id = c.id and x.dataset_campo_id = v_fecha order by x.posicion limit 1) cf on true
     where c.dataset_id = p_dataset
       and c.estado = 'procesada'
  ), filtrada as (
    select *, case
      when p_dimension is null then 'Total'
      when v_dim_tipo = 'fecha' then coalesce(to_char(
        date_trunc(case p_granularidad when 'ano' then 'year' when 'trimestre' then 'quarter'
                    when 'mes' then 'month' when 'semana' then 'week' else 'day' end,
                   public.atlas_fecha(valor_dimension)), 'YYYY-MM-DD'), '(Sin dato)')
      else coalesce(nullif(valor_dimension, ''), '(Sin dato)') end clave
      from base
     where (p_desde is null or valor_fecha::date >= p_desde)
       and (p_hasta is null or valor_fecha::date <= p_hasta)
  ), agrupada as (
    select clave,
      case v_agregacion
        when 'count' then case when p_metrica is null then count(*)::numeric else count(valor_metrica)::numeric end
        when 'count_distinct' then count(distinct valor_metrica)::numeric
        when 'sum' then sum(public.atlas_numero(valor_metrica))
        when 'avg' then avg(public.atlas_numero(valor_metrica))
        when 'min' then min(public.atlas_numero(valor_metrica))
        when 'max' then max(public.atlas_numero(valor_metrica))
      end valor
      from filtrada group by clave
  ), limitada as (
    select * from agrupada
     order by
       case when p_orden = 'asc' then valor end asc nulls last,
       case when p_orden <> 'asc' then valor end desc nulls last,
       clave
     limit greatest(1, least(coalesce(p_limite, 50), 500))
  )
  select coalesce(jsonb_agg(jsonb_build_object('clave', clave, 'valor', valor)), '[]'::jsonb)
    into v_series from limitada;

  with base as (
    select fr.id, case when p_metrica is null then null else fr.datos ->> cm.nombre_original end valor_metrica,
           public.atlas_fecha(fr.datos ->> cf.nombre_original) valor_fecha
      from public.carga c join public.fila_cruda fr on fr.carga_id = c.id
      left join lateral (select x.nombre_original from public.carga_columna x
        where x.carga_id = c.id and x.dataset_campo_id = p_metrica order by x.posicion limit 1) cm on true
      left join lateral (select x.nombre_original from public.carga_columna x
        where x.carga_id = c.id and x.dataset_campo_id = v_fecha order by x.posicion limit 1) cf on true
     where c.dataset_id = p_dataset and c.estado = 'procesada'
       and (p_desde is null or public.atlas_fecha(fr.datos ->> cf.nombre_original)::date >= p_desde)
       and (p_hasta is null or public.atlas_fecha(fr.datos ->> cf.nombre_original)::date <= p_hasta)
  )
  select count(*), case v_agregacion
    when 'count' then case when p_metrica is null then count(*)::numeric else count(valor_metrica)::numeric end
    when 'count_distinct' then count(distinct valor_metrica)::numeric
    when 'sum' then sum(public.atlas_numero(valor_metrica))
    when 'avg' then avg(public.atlas_numero(valor_metrica))
    when 'min' then min(public.atlas_numero(valor_metrica))
    when 'max' then max(public.atlas_numero(valor_metrica)) end
    into v_filas, v_total from base;

  return jsonb_build_object(
    'series', v_series, 'total', coalesce(v_total, 0),
    'metadatos', jsonb_build_object('filas', v_filas, 'agregacion', v_agregacion,
      'granularidad', p_granularidad, 'datasetId', p_dataset)
  );
end;
$$;

revoke execute on function consulta_dataset(uuid,uuid,uuid,text,text,date,date,int,text) from public, anon;
grant execute on function consulta_dataset(uuid,uuid,uuid,text,text,date,date,int,text) to authenticated;

-- Onboarding neutral: el negocio nace de los datos, no de una campaña de
-- seguros precargada. SECURITY DEFINER es necesario sólo para crear el primer
-- perfil, antes de que exista contexto RLS.
create or replace function inicializar_tenant(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_slug text;
  v_tenant uuid;
begin
  if v_user is null then raise exception 'Sin sesión activa.'; end if;
  if exists (select 1 from public.perfil where id = v_user) then
    raise exception 'Este usuario ya pertenece a una organización.';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;
  v_slug := regexp_replace(lower(unaccent(coalesce(nullif(btrim(p_nombre), ''), 'atlas'))), '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  if v_slug = '' then v_slug := 'atlas'; end if;
  if exists (select 1 from public.tenant where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(v_user::text, '-', ''), 1, 6);
  end if;

  insert into public.tenant (nombre, slug)
  values (coalesce(nullif(btrim(p_nombre), ''), 'Atlas'), v_slug)
  returning id into v_tenant;

  insert into public.perfil (id, tenant_id, nombre, email, rol)
  values (v_user, v_tenant, coalesce(nullif(v_email, ''), 'Administrador'), coalesce(v_email, ''), 'admin');
  return v_tenant;
end;
$$;

revoke execute on function inicializar_tenant(text) from public, anon;
grant execute on function inicializar_tenant(text) to authenticated;

comment on function inicializar_tenant(text) is
  'Arranque neutral: crea únicamente organización y perfil administrador.';
