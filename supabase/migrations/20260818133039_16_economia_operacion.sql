-- ---------------------------------------------------------------------
-- 16 · Economía de la operación
-- ---------------------------------------------------------------------
-- Hasta acá Atlas medía producción: cuántos asegurados, cuánta UF. Esta
-- migración agrega la otra mitad del negocio —lo que entra, lo que
-- cuesta y lo que queda— para poder armar un cuadro de mando integral.
--
-- Tres tablas de parámetros, todas versionadas por vigencia: los precios
-- cambian y un margen recalculado con la tarifa de hoy sobre ventas de
-- hace tres meses es un número inventado.
-- ---------------------------------------------------------------------

create type criterio_tarifa as enum ('edad', 'cumplimiento');
create type alcance_tarifa  as enum ('titular', 'adicional', 'todos');
create type base_costo      as enum ('mensual', 'por_posicion', 'por_gestion', 'por_hora');

-- ---------------------------------------------------------------------
-- Tarifa: lo que el mandante paga al contact center por cada venta
-- ---------------------------------------------------------------------
-- Un solo modelo cubre las dos lógicas del contrato:
--
--   Complementario + Catastrófico · criterio 'edad'
--     el titular de la póliza se paga según su tramo etario y cada
--     adicional a valor único.
--
--   Oncológico · criterio 'cumplimiento'
--     todos los beneficiarios se pagan igual, pero la tarifa sube por
--     tramo de cumplimiento de la meta. Ojo: sube para TODOS los
--     beneficiarios del periodo, no sólo para los que exceden la meta,
--     así que no se puede liquidar venta a venta hasta cerrar el mes.
-- ---------------------------------------------------------------------
create table tarifa (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  campana_id      uuid not null references campana(id) on delete cascade,
  agrupacion_meta text not null,
  criterio        criterio_tarifa not null,
  alcance         alcance_tarifa not null default 'todos',
  desde           numeric(8,4) not null default 0,
  hasta           numeric(8,4),
  valor_uf        numeric(10,4) not null,
  vigencia_desde  date not null default date_trunc('month', now())::date,
  vigencia_hasta  date,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tarifa_tramo_valido check (hasta is null or hasta >= desde),
  constraint tarifa_valor_positivo check (valor_uf >= 0)
);

create index tarifa_busqueda on tarifa (tenant_id, campana_id, agrupacion_meta, criterio, vigencia_desde);

-- ---------------------------------------------------------------------
-- Remuneración: lo que cuesta cada ejecutivo
-- ---------------------------------------------------------------------
create table remuneracion (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenant(id) on delete cascade,
  ejecutivo_id          uuid not null references ejecutivo(id) on delete cascade,
  sueldo_base_clp       numeric(14,2) not null default 0,
  comision_asegurado_clp numeric(14,2) not null default 0,
  -- Costo empresa sobre el bruto: imposiciones, mutual, provisión de
  -- finiquito y vacaciones. 1.0 = sin carga.
  factor_leyes          numeric(6,4) not null default 1.2000,
  vigencia_desde        date not null default date_trunc('month', now())::date,
  vigencia_hasta        date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, ejecutivo_id, vigencia_desde),
  constraint remuneracion_montos_no_negativos
    check (sueldo_base_clp >= 0 and comision_asegurado_clp >= 0 and factor_leyes >= 1)
);

-- ---------------------------------------------------------------------
-- Costos de operación distintos de la remuneración
-- ---------------------------------------------------------------------
-- La base dice cómo se prorratea: un arriendo es mensual, un puesto de
-- trabajo va por posición ocupada y el dialer suele ir por gestión
-- realizada. Sin esa distinción, comparar meses con dotación distinta
-- da un margen falso.
-- ---------------------------------------------------------------------
create table costo_operacion (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenant(id) on delete cascade,
  campana_id     uuid not null references campana(id) on delete cascade,
  concepto       text not null,
  base           base_costo not null default 'mensual',
  monto_clp      numeric(14,2) not null,
  vigencia_desde date not null default date_trunc('month', now())::date,
  vigencia_hasta date,
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint costo_monto_no_negativo check (monto_clp >= 0)
);

create index costo_operacion_busqueda on costo_operacion (tenant_id, campana_id, vigencia_desde);

-- ---------------------------------------------------------------------
-- Valor de la UF
-- ---------------------------------------------------------------------
-- Opcional: si no hay filas, el cálculo usa el valor que trae cada
-- venta en su propio archivo, que es el que efectivamente se aplicó.
-- ---------------------------------------------------------------------
create table valor_uf (
  tenant_id  uuid not null references tenant(id) on delete cascade,
  fecha      date not null,
  valor_clp  numeric(12,2) not null,
  primary key (tenant_id, fecha),
  constraint valor_uf_positivo check (valor_clp > 0)
);

-- ---------------------------------------------------------------------
-- Disparadores de updated_at
-- ---------------------------------------------------------------------
create trigger tarifa_touch before update on tarifa
  for each row execute function tg_set_updated_at();
create trigger remuneracion_touch before update on remuneracion
  for each row execute function tg_set_updated_at();
create trigger costo_operacion_touch before update on costo_operacion
  for each row execute function tg_set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table tarifa           enable row level security;
alter table remuneracion     enable row level security;
alter table costo_operacion  enable row level security;
alter table valor_uf         enable row level security;

alter table tarifa           force row level security;
alter table remuneracion     force row level security;
alter table costo_operacion  force row level security;
alter table valor_uf         force row level security;

-- La remuneración y los costos los ve y edita sólo administración: un
-- supervisor no tiene por qué ver el sueldo de su equipo ni el margen
-- del contrato.
create policy remuneracion_admin on remuneracion for all to authenticated
  using (tenant_id = current_tenant_id() and es_admin())
  with check (tenant_id = current_tenant_id() and es_admin());

create policy costo_admin on costo_operacion for all to authenticated
  using (tenant_id = current_tenant_id() and es_admin())
  with check (tenant_id = current_tenant_id() and es_admin());

-- La tarifa la lee cualquiera del tenant —es lo que explica cuánto vale
-- una venta— pero sólo administración la cambia.
create policy tarifa_lectura on tarifa for select to authenticated
  using (tenant_id = current_tenant_id());
create policy tarifa_admin on tarifa for all to authenticated
  using (tenant_id = current_tenant_id() and es_admin())
  with check (tenant_id = current_tenant_id() and es_admin());

create policy valor_uf_lectura on valor_uf for select to authenticated
  using (tenant_id = current_tenant_id());
create policy valor_uf_admin on valor_uf for all to authenticated
  using (tenant_id = current_tenant_id() and es_admin())
  with check (tenant_id = current_tenant_id() and es_admin());;
