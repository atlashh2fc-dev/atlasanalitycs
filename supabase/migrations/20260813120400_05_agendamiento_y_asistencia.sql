-- =====================================================================
-- Atlas Analytics — 05. Agendamiento salud (UCC) y asistencia
-- =====================================================================

-- ---------------------------------------------------------------------
-- Agendamiento salud
--   Segundo negocio con la misma dotación: outbound de confirmación y
--   recuperación de horas médicas. La métrica dura es la tasa de
--   presentación.
-- ---------------------------------------------------------------------
create table agendamiento (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  campana_id     uuid references campana(id) on delete set null,
  cliente_id     uuid not null references cliente(id) on delete cascade,
  ejecutivo_id   uuid references ejecutivo(id) on delete set null,
  linea          text,
  fecha_agenda   date,
  ultima_agenda  date,
  fecha_enviado  date,
  presentado     boolean,
  consentimiento boolean,
  centro         text,
  area           text,
  especialidad   text,
  prevision      text,
  equipo         text,
  cluster        text,
  cluster_2      text,
  carga_id       uuid references carga(id) on delete set null,
  datos_extra    jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on agendamiento (tenant_id, fecha_agenda);
create index on agendamiento (cliente_id);
create index on agendamiento (tenant_id, linea, presentado);
create index on agendamiento (tenant_id, centro);
create index on agendamiento (tenant_id, especialidad);
create index on agendamiento (carga_id);
-- Un cliente puede tener varias agendas; una misma agenda no se duplica
create unique index on agendamiento (tenant_id, cliente_id, fecha_agenda, especialidad)
  where fecha_agenda is not null;

create trigger t_agendamiento_updated before update on agendamiento
  for each row execute function tg_set_updated_at();

comment on table agendamiento is
  'Base UCC. En los archivos de muestra: 59.000 filas, tasa de '
  'presentación de 52,3% en CM agosto.';

-- ---------------------------------------------------------------------
-- Asistencia de la dotación
--   Resultado del unpivot de las hojas matriz (P11): las planillas de
--   Asistencia traen ejecutivos en filas y días en columnas; acá viven
--   ya en formato largo.
-- ---------------------------------------------------------------------
create table asistencia (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  ejecutivo_id  uuid not null references ejecutivo(id) on delete cascade,
  campana_id    uuid references campana(id) on delete set null,
  fecha         date not null,
  marca         marca_asistencia not null,
  jornada_horas numeric(5,2),
  horas_conectado numeric(6,2),
  observacion   text,
  carga_id      uuid references carga(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (ejecutivo_id, fecha)
);

create index on asistencia (tenant_id, fecha);
create index on asistencia (fecha, marca);
create index on asistencia (carga_id);

comment on column asistencia.marca is
  'P presente, A ausente, V vacaciones, L licencia, B baja, F feriado, '
  'S sábado. Sólo P cuenta como día gestionado.';

-- ---------------------------------------------------------------------
-- Días gestionados por ejecutivo y mes
--   Base del prorrateo de metas: un ejecutivo con vacaciones no debe
--   aparecer bajo meta.
-- ---------------------------------------------------------------------
create view v_dias_gestionados as
select
  a.tenant_id,
  a.ejecutivo_id,
  a.campana_id,
  date_trunc('month', a.fecha)::date            as mes,
  count(*) filter (where a.marca = 'P')         as dg,
  count(*) filter (where a.marca = 'A')         as ausencias,
  count(*) filter (where a.marca in ('V','L','B')) as dias_no_habiles,
  count(*)                                      as dias_registrados
from asistencia a
group by 1, 2, 3, 4;

-- ---------------------------------------------------------------------
-- Feriados (para separar días hábiles de días gestionados)
-- ---------------------------------------------------------------------
create table feriado (
  fecha       date primary key,
  nombre      text not null,
  irrenunciable boolean not null default false
);
