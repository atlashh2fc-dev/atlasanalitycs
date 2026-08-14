create table tenant (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  rut_empresa text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_tenant_updated before update on tenant for each row execute function tg_set_updated_at();

create table perfil (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenant(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol rol_usuario not null default 'supervisor',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on perfil (tenant_id);
create trigger t_perfil_updated before update on perfil for each row execute function tg_set_updated_at();

create or replace function current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from perfil where id = auth.uid();
$$;

create or replace function es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from perfil where id = auth.uid()), false);
$$;

create table campana (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  nombre text not null,
  tipo tipo_campana not null default 'venta',
  descripcion text,
  fecha_inicio date,
  fecha_fin date,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);
create index on campana (tenant_id, activo);
create trigger t_campana_updated before update on campana for each row execute function tg_set_updated_at();

create table perfil_campana (
  perfil_id uuid not null references perfil(id) on delete cascade,
  campana_id uuid not null references campana(id) on delete cascade,
  primary key (perfil_id, campana_id)
);

create or replace function campanas_visibles()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from campana c
   where c.tenant_id = current_tenant_id()
     and (es_admin() or exists (select 1 from perfil_campana pc
                                 where pc.campana_id = c.id and pc.perfil_id = auth.uid()));
$$;

create table ejecutivo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  rut text,
  nombre_canonico text not null,
  email text,
  fecha_ingreso date,
  fecha_egreso date,
  jornada_horas numeric(5,2) default 42,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ejecutivo_rut_valido check (rut is null or valida_rut(rut))
);
create unique index on ejecutivo (tenant_id, rut) where rut is not null;
create index on ejecutivo (tenant_id, activo);
create trigger t_ejecutivo_updated before update on ejecutivo for each row execute function tg_set_updated_at();

create table ejecutivo_alias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  ejecutivo_id uuid not null references ejecutivo(id) on delete cascade,
  alias_original text not null,
  alias_normalizado text not null,
  origen text,
  confirmado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, alias_normalizado)
);
create index on ejecutivo_alias (ejecutivo_id);
create index on ejecutivo_alias using gin (alias_normalizado gin_trgm_ops);

create or replace function tg_alias_normaliza()
returns trigger language plpgsql as $$
begin
  new.alias_normalizado := normaliza_texto(new.alias_original);
  return new;
end;
$$;
create trigger t_alias_normaliza before insert or update on ejecutivo_alias
  for each row execute function tg_alias_normaliza();

create table ejecutivo_campana (
  ejecutivo_id uuid not null references ejecutivo(id) on delete cascade,
  campana_id uuid not null references campana(id) on delete cascade,
  desde date not null default current_date,
  hasta date,
  primary key (ejecutivo_id, campana_id, desde)
);

create table producto (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  nombre text not null,
  linea text,
  agrupacion_meta text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);
create index on producto (tenant_id, agrupacion_meta);

create table meta (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  campana_id uuid not null references campana(id) on delete cascade,
  agrupacion_meta text,
  producto_id uuid references producto(id) on delete set null,
  ejecutivo_id uuid references ejecutivo(id) on delete cascade,
  unidad unidad_meta not null default 'asegurados',
  valor numeric(12,2) not null,
  dg_esperados int not null default 22,
  periodo_inicio date not null,
  periodo_fin date not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_periodo_valido check (periodo_fin >= periodo_inicio),
  constraint meta_valor_positivo check (valor > 0)
);
create index on meta (tenant_id, campana_id, periodo_inicio, periodo_fin);
create trigger t_meta_updated before update on meta for each row execute function tg_set_updated_at();

create table metrica_def (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenant(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  familia text not null,
  descripcion text,
  formula text,
  unidad text,
  decimales smallint not null default 2,
  objetivo numeric(12,4),
  umbral_verde numeric(12,4),
  umbral_amarillo numeric(12,4),
  mayor_es_mejor boolean not null default true,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index on metrica_def (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);
create trigger t_metrica_def_updated before update on metrica_def for each row execute function tg_set_updated_at();

create table auditoria (
  id bigserial primary key,
  tenant_id uuid,
  tabla text not null,
  registro_id text,
  accion accion_auditoria not null,
  campo text,
  valor_anterior text,
  valor_nuevo text,
  carga_id uuid,
  usuario_id uuid,
  ocurrido_at timestamptz not null default now()
);
create index on auditoria (tenant_id, tabla, ocurrido_at desc);
create index on auditoria (carga_id);;
