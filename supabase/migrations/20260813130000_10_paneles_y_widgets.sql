-- =====================================================================
-- Atlas Analytics — 10. Paneles armables por el usuario
--
--   El dashboard deja de estar cableado en código: cada usuario arma su
--   propio panel con las tarjetas que le sirven, las mueve, las
--   redimensiona y las borra. La disposición se guarda por panel.
-- =====================================================================

create type tipo_widget as enum (
  'kpi', 'barras', 'barras_horizontal', 'lineas', 'area',
  'dona', 'tabla', 'dispersion'
);

create table panel (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  campana_id  uuid references campana(id) on delete set null,
  perfil_id   uuid references perfil(id) on delete cascade,
  nombre      text not null default 'Mi panel',
  es_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on panel (tenant_id, perfil_id);
create trigger t_panel_updated before update on panel
  for each row execute function tg_set_updated_at();

comment on column panel.perfil_id is
  'Panel personal de un usuario. NULL = panel compartido del tenant.';

create table panel_widget (
  id        uuid primary key default gen_random_uuid(),
  panel_id  uuid not null references panel(id) on delete cascade,
  tipo      tipo_widget not null,
  titulo    text not null,
  -- Especificación de la consulta: fuente, métrica, dimensión, filtros.
  -- Va en jsonb porque el catálogo de campos depende de lo que el
  -- usuario haya cargado, no de un esquema fijo.
  config    jsonb not null default '{}'::jsonb,
  x         smallint not null default 0,
  y         smallint not null default 0,
  w         smallint not null default 4,
  h         smallint not null default 4,
  orden     smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on panel_widget (panel_id, orden);
create trigger t_panel_widget_updated before update on panel_widget
  for each row execute function tg_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table panel enable row level security;
alter table panel force row level security;
alter table panel_widget enable row level security;
alter table panel_widget force row level security;

create policy panel_visible on panel
  for select to authenticated
  using (
    tenant_id = current_tenant_id()
    and (perfil_id is null or perfil_id = auth.uid())
  );

create policy panel_escritura on panel
  for all to authenticated
  using (
    tenant_id = current_tenant_id()
    and (perfil_id = auth.uid() or (perfil_id is null and es_admin()))
  )
  with check (
    tenant_id = current_tenant_id()
    and (perfil_id = auth.uid() or (perfil_id is null and es_admin()))
  );

-- Los widgets heredan la visibilidad de su panel
create policy panel_widget_visible on panel_widget
  for all to authenticated
  using (exists (select 1 from panel p where p.id = panel_widget.panel_id))
  with check (exists (select 1 from panel p where p.id = panel_widget.panel_id));
