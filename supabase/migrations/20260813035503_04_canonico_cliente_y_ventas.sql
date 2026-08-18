create table cliente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  rut text not null,
  nombre text, email text, telefono text, telefono_alt text,
  fecha_nacimiento date, sexo text, region text, comuna text, prevision text,
  edad int,
  tramo_etario text generated always as (tramo_etario(edad)) stored,
  primera_gestion date, ultima_gestion date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cliente_rut_valido check (valida_rut(rut)),
  unique (tenant_id, rut)
);
create index on cliente (tenant_id);
create index on cliente (tenant_id, email) where email is not null;
create index on cliente (tenant_id, telefono) where telefono is not null;
create trigger t_cliente_updated before update on cliente for each row execute function tg_set_updated_at();

create or replace function tg_cliente_normaliza()
returns trigger language plpgsql as $$
begin
  new.rut := normaliza_rut(new.rut);
  new.email := normaliza_email(new.email);
  new.telefono := normaliza_telefono(new.telefono);
  new.telefono_alt := normaliza_telefono(new.telefono_alt);
  return new;
end;
$$;
create trigger t_cliente_normaliza before insert or update on cliente
  for each row execute function tg_cliente_normaliza();

create table tipificacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  categoria categoria_tipif not null,
  cuenta_como_contacto boolean not null default false,
  es_cierre boolean not null default false,
  orden smallint,
  activo boolean not null default true,
  unique (tenant_id, codigo)
);

create table gestion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  cliente_id uuid not null references cliente(id) on delete cascade,
  campana_id uuid references campana(id) on delete set null,
  ejecutivo_id uuid references ejecutivo(id) on delete set null,
  fecha timestamptz not null,
  canal text,
  tipificacion_id uuid references tipificacion(id) on delete set null,
  intentos smallint not null default 1,
  duracion_seg int,
  acw_seg int,
  id_externo text,
  carga_id uuid references carga(id) on delete set null,
  datos_extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on gestion (tenant_id, fecha desc);
create index on gestion (cliente_id, fecha desc);
create index on gestion (campana_id, fecha);
create index on gestion (ejecutivo_id, fecha);
create index on gestion (carga_id);
create unique index on gestion (tenant_id, id_externo) where id_externo is not null;

create table cotizacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  campana_id uuid references campana(id) on delete set null,
  ejecutivo_id uuid references ejecutivo(id) on delete set null,
  cliente_id uuid references cliente(id) on delete set null,
  producto_id uuid references producto(id) on delete set null,
  fecha timestamptz not null,
  nombre_cotizante text, email text, telefono text, sistema_salud text,
  precio_uf numeric(12,4), precio_clp numeric(14,2), valor_uf numeric(12,4),
  procedencia_lead text, id_externo text,
  carga_id uuid references carga(id) on delete set null,
  datos_extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on cotizacion (tenant_id, fecha desc);
create index on cotizacion (ejecutivo_id, fecha);
create index on cotizacion (tenant_id, email) where email is not null;
create index on cotizacion (tenant_id, telefono) where telefono is not null;
create index on cotizacion (carga_id);

create or replace function tg_cotizacion_normaliza()
returns trigger language plpgsql as $$
begin
  new.email := normaliza_email(new.email);
  new.telefono := normaliza_telefono(new.telefono);
  return new;
end;
$$;
create trigger t_cotizacion_normaliza before insert or update on cotizacion
  for each row execute function tg_cotizacion_normaliza();

create table venta (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  campana_id uuid references campana(id) on delete set null,
  ejecutivo_id uuid references ejecutivo(id) on delete set null,
  cliente_id uuid not null references cliente(id) on delete cascade,
  producto_id uuid references producto(id) on delete set null,
  nro_solicitud text, codigo_contrato text,
  fecha_solicitud timestamptz not null,
  fecha_pago timestamptz, fecha_vigencia date, fecha_fin_vigencia date,
  precio_uf numeric(12,4), precio_clp numeric(14,2), valor_uf numeric(12,4),
  cobertura text, medio_pago text, canal text,
  n_asegurados smallint not null default 1,
  estado text,
  carga_id uuid references carga(id) on delete set null,
  datos_extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venta_n_asegurados_positivo check (n_asegurados >= 1)
);
create unique index on venta (tenant_id, nro_solicitud) where nro_solicitud is not null;
create index on venta (tenant_id, fecha_solicitud desc);
create index on venta (ejecutivo_id, fecha_solicitud);
create index on venta (campana_id, fecha_solicitud);
create index on venta (carga_id);
create trigger t_venta_updated before update on venta for each row execute function tg_set_updated_at();
comment on column venta.n_asegurados is
  'Titular + cargas. Es la UNIDAD DE LA META (250 CM+CAT / 60 Onco). Validado: 83 contratos = 104 asegurados.';

create table venta_asegurado (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  venta_id uuid not null references venta(id) on delete cascade,
  orden smallint not null,
  parentesco parentesco not null,
  rut text, nombre text, fecha_nacimiento date, edad int,
  tramo_etario text generated always as (tramo_etario(edad)) stored,
  created_at timestamptz not null default now(),
  unique (venta_id, orden)
);
create index on venta_asegurado (venta_id);
create index on venta_asegurado (tenant_id, rut) where rut is not null;

create table ges_categoria (
  id smallint primary key,
  nombre text not null unique,
  orden smallint not null
);
insert into ges_categoria (id, nombre, orden) values
  (1,'Cáncer',1),
  (2,'Salud cardiovascular y renal',2),
  (3,'Salud mental y adicciones',3),
  (4,'Neurología y neurocirugía',4),
  (5,'Enfermedades respiratorias',5),
  (6,'Salud sensorial',6),
  (7,'Salud musculoesquelética',7),
  (8,'Salud digestiva y metabólica',8),
  (9,'Salud oral',9),
  (10,'Salud materno-infantil y urgencias',10),
  (99,'No clasificado en GES',99);

create table ges_problema (
  id smallint primary key,
  categoria_id smallint not null references ges_categoria(id),
  nombre text not null
);
create index on ges_problema (categoria_id);

create table catalogo_dps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenant(id) on delete cascade,
  texto text not null,
  texto_norm text generated always as (normaliza_texto(texto)) stored,
  ges_problema_id smallint references ges_problema(id) on delete set null,
  ges_categoria_id smallint references ges_categoria(id) on delete set null,
  cie10_capitulo text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index on catalogo_dps
  (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), texto_norm);

create table venta_preexistencia (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  venta_asegurado_id uuid not null references venta_asegurado(id) on delete cascade,
  texto_declarado text not null,
  catalogo_dps_id uuid references catalogo_dps(id) on delete set null,
  ges_categoria_id smallint references ges_categoria(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on venta_preexistencia (venta_asegurado_id);
create index on venta_preexistencia (tenant_id, ges_categoria_id);

create table anulacion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  venta_id uuid not null references venta(id) on delete cascade,
  fecha_anulacion date not null,
  periodo_descuento date not null,
  tipo text, motivo text,
  n_asegurados smallint, monto_uf numeric(12,4), origen text,
  carga_id uuid references carga(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (venta_id, fecha_anulacion)
);
create index on anulacion (tenant_id, periodo_descuento);
create index on anulacion (venta_id);
comment on column anulacion.periodo_descuento is
  'Primer día del mes en que se descuenta. Por defecto = mes de fecha_anulacion, según decisión de negocio.';

create table enlace_cotizacion_venta (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  cotizacion_id uuid not null references cotizacion(id) on delete cascade,
  venta_id uuid not null references venta(id) on delete cascade,
  score numeric(4,3) not null,
  metodo metodo_enlace not null,
  confirmado boolean not null default false,
  confirmado_por uuid references perfil(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cotizacion_id, venta_id),
  constraint enlace_score_valido check (score >= 0 and score <= 1)
);
create index on enlace_cotizacion_venta (venta_id);
create index on enlace_cotizacion_venta (tenant_id, confirmado);;
