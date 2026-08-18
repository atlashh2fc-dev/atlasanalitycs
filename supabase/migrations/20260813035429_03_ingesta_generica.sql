create table dataset (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  campana_id uuid references campana(id) on delete set null,
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);
create trigger t_dataset_updated before update on dataset for each row execute function tg_set_updated_at();

create table carga (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  dataset_id uuid references dataset(id) on delete set null,
  campana_id uuid references campana(id) on delete set null,
  archivo_nombre text not null,
  hoja text,
  storage_path text,
  hash_sha256 text,
  modo modo_lectura not null default 'tabular',
  fila_encabezado smallint not null default 1,
  filas_totales int,
  filas_validas int,
  filas_rechazadas int,
  periodo_inicio date,
  periodo_fin date,
  estado estado_carga not null default 'recibida',
  error_detalle text,
  metadatos jsonb not null default '{}'::jsonb,
  cargado_por uuid references perfil(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on carga (tenant_id, dataset_id, created_at desc);
create index on carga (tenant_id, estado);
create index on carga (tenant_id, hash_sha256);
create trigger t_carga_updated before update on carga for each row execute function tg_set_updated_at();

create table carga_columna (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references carga(id) on delete cascade,
  posicion smallint not null,
  nombre_original text,
  nombre_normalizado text,
  tipo_detectado tipo_columna not null default 'desconocido',
  confianza numeric(4,3) not null default 0,
  rol_semantico text,
  cardinalidad int,
  nulos int,
  filas int,
  varianza_cero boolean not null default false,
  descartada boolean not null default false,
  motivo_descarte text,
  muestra jsonb,
  created_at timestamptz not null default now(),
  unique (carga_id, posicion)
);
create index on carga_columna (carga_id, descartada);
create index on carga_columna (nombre_normalizado);
comment on column carga_columna.varianza_cero is
  'Un solo valor distinto en toda la columna. Se descarta automáticamente.';

create table fila_cruda (
  id bigserial primary key,
  carga_id uuid not null references carga(id) on delete cascade,
  nro_fila int not null,
  datos jsonb not null,
  llave text,
  procesada boolean not null default false,
  error text
);
create index on fila_cruda (carga_id, nro_fila);
create index on fila_cruda (carga_id) where not procesada;
create index on fila_cruda using gin (datos jsonb_path_ops);
create index on fila_cruda (llave) where llave is not null;

create table plantilla_mapeo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  dataset_id uuid references dataset(id) on delete cascade,
  campana_id uuid references campana(id) on delete set null,
  nombre text not null,
  modo modo_lectura not null default 'tabular',
  firma text[] not null,
  firma_hash text,
  mapeo jsonb not null,
  config_matriz jsonb,
  veces_usada int not null default 0,
  ultima_vez timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);

create or replace function tg_plantilla_firma_hash()
returns trigger language plpgsql as $$
begin
  new.firma_hash := md5(array_to_string(new.firma, '|'));
  return new;
end;
$$;
create trigger t_plantilla_firma before insert or update on plantilla_mapeo
  for each row execute function tg_plantilla_firma_hash();
create index on plantilla_mapeo (tenant_id, firma_hash);
create trigger t_plantilla_updated before update on plantilla_mapeo for each row execute function tg_set_updated_at();

comment on column plantilla_mapeo.config_matriz is
  'Modo matriz: fila de fechas, columna de entidad, columna de jornada, mapa de marcas. El motor hace unpivot con esto.';

create table sinonimo_columna (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenant(id) on delete cascade,
  nombre_normalizado text not null,
  rol_semantico text not null,
  tipo_esperado tipo_columna,
  confirmaciones int not null default 1,
  rechazos int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index on sinonimo_columna
  (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), nombre_normalizado, rol_semantico);
create trigger t_sinonimo_updated before update on sinonimo_columna for each row execute function tg_set_updated_at();

insert into sinonimo_columna (nombre_normalizado, rol_semantico, tipo_esperado, confirmaciones) values
  ('rut_beneficiario','rut_cliente','rut',10),
  ('rut_contratante','rut_cliente','rut',10),
  ('rut_pagador','rut_pagador','rut',5),
  ('rut','rut_cliente','rut',10),
  ('paciente','nombre_cliente','texto',5),
  ('nombre_contratante','nombre_cliente','texto',5),
  ('nombre_cotizante','nombre_cliente','texto',5),
  ('e_mail_paciente','email_cliente','email',5),
  ('email_contratante','email_cliente','email',5),
  ('email_cotizante','email_cliente','email',5),
  ('tel_principal_paciente','telefono_cliente','telefono',5),
  ('telefono_contratante','telefono_cliente','telefono',5),
  ('telefono_cotizante','telefono_cliente','telefono',5),
  ('ultima_agenda','fecha_agenda','fecha',5),
  ('agenda','fecha_agenda','fecha',3),
  ('fecha_solicitud','fecha_venta','fecha',5),
  ('fecha_cotizacion','fecha_cotizacion','fecha',5),
  ('ejecutivo_venta','ejecutivo','texto',5),
  ('usuario','ejecutivo','texto',3),
  ('especialidad','especialidad','categoria',5),
  ('centro','centro','categoria',5),
  ('area','area','categoria',5),
  ('area_1','area','categoria',5),
  ('prevision','prevision','categoria',5),
  ('sistema_salud','prevision','categoria',3),
  ('presentado','presentado','booleano',5),
  ('edad_beneficiario','edad','entero',5),
  ('numero_beneficiarios','n_asegurados','entero',5),
  ('precio_uf','monto_uf','uf',5),
  ('precio','monto_clp','monto',3),
  ('plan','producto','categoria',5),
  ('producto_cotizado','producto','categoria',5),
  ('cluster','cluster','categoria',3),
  ('cluster_2','cluster_2','categoria',3),
  ('equipo','equipo','categoria',3);

create table carga_reversion (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid not null references carga(id) on delete cascade,
  motivo text,
  filas_afectadas int,
  revertido_por uuid references perfil(id) on delete set null,
  revertido_at timestamptz not null default now()
);;
