-- ---------------------------------------------------------------------
-- 24 · Comisiones escalonadas y bonos
-- ---------------------------------------------------------------------
-- La comisión del ejecutivo no es un valor plano: sube por tramo de
-- producción, y encima hay bonos que dependen de una unidad distinta.
--
--   Oncológico · comisión por BENEFICIARIO
--     1 a 19    $ 9.000 cada uno
--     20 a 29   $11.000 cada uno
--     30 o más  $13.000 cada uno
--
--   Oncológico · bonos por VENTA, acumulables
--     25 ventas o más   $ 75.000
--     30 ventas o más   $120.000
--
-- Dos decisiones de modelo que vale la pena dejar escritas:
--
-- 1. Los tramos se resuelven por su piso, igual que la tarifa. Así no
--    hay huecos posibles y la columna 'hasta' queda como documentación
--    de lo que dice el contrato.
--
-- 2. Los bonos acumulables se suman: a las 30 ventas aplican tanto el
--    de 25 como el de 30, y dan los $195.000 sin ninguna regla
--    especial. Que "se ganan los dos bonos" salga solo del modelo es
--    mejor que codificarlo como excepción.
-- ---------------------------------------------------------------------

create type base_comision as enum ('beneficiario', 'contrato');
create type tipo_comision as enum ('escalonada', 'bono');

create table comision (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  campana_id      uuid not null references campana(id) on delete cascade,
  agrupacion_meta text not null,
  tipo            tipo_comision not null,
  base            base_comision not null,
  desde           numeric(10,2) not null default 0,
  hasta           numeric(10,2),
  monto_clp       numeric(14,2) not null,
  -- Sólo para los bonos: si es acumulable, se suma a los bonos de
  -- tramos inferiores que también se alcanzaron.
  acumulable      boolean not null default false,
  vigencia_desde  date not null default date_trunc('month', now())::date,
  vigencia_hasta  date,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint comision_tramo_valido check (hasta is null or hasta >= desde),
  constraint comision_monto_no_negativo check (monto_clp >= 0)
);

create index comision_busqueda
  on comision (tenant_id, campana_id, agrupacion_meta, tipo, desde);

create trigger comision_touch before update on comision
  for each row execute function tg_set_updated_at();

alter table comision enable row level security;
alter table comision force row level security;

-- Es parte de la remuneración: sólo administración.
create policy comision_admin on comision for all to authenticated
  using (tenant_id = current_tenant_id() and es_admin())
  with check (tenant_id = current_tenant_id() and es_admin());

-- ---------------------------------------------------------------------
-- Comisión ganada por ejecutivo en el periodo
-- ---------------------------------------------------------------------
create or replace function comision_ejecutivo(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  ejecutivo_id     uuid,
  ejecutivo        text,
  agrupacion_meta  text,
  contratos        int,
  beneficiarios    int,
  tramo_clp        numeric,
  comision_clp     numeric,
  bonos_clp        numeric,
  total_clp        numeric
)
language sql
stable
security invoker
set search_path = public
as $$
with produccion as (
  select
    v.ejecutivo_id,
    pr.agrupacion_meta,
    count(distinct v.id)::int   as contratos,
    count(va.id)::int           as beneficiarios
  from venta v
  join producto pr on pr.id = v.producto_id
  join venta_asegurado va on va.venta_id = v.id
  where v.fecha_solicitud::date between p_desde and p_hasta
    and v.ejecutivo_id is not null
    and (p_campana is null or v.campana_id = p_campana)
  group by 1, 2
),
calculado as (
  select
    p.ejecutivo_id,
    p.agrupacion_meta,
    p.contratos,
    p.beneficiarios,
    -- Tramo escalonado: el piso más alto alcanzado, aplicado a toda la
    -- producción del ejecutivo en esa línea.
    (select c.monto_clp from comision c
      where c.agrupacion_meta = p.agrupacion_meta
        and c.tipo = 'escalonada'
        and (p_campana is null or c.campana_id = p_campana)
        and c.vigencia_desde <= p_hasta
        and (c.vigencia_hasta is null or c.vigencia_hasta >= p_desde)
        and c.desde <= case c.base
                         when 'beneficiario' then p.beneficiarios
                         else p.contratos
                       end
      order by c.desde desc limit 1) as tramo_clp,
    -- Bonos: se suman todos los alcanzados que sean acumulables, más el
    -- mayor de los no acumulables.
    coalesce((
      select sum(c.monto_clp) from comision c
      where c.agrupacion_meta = p.agrupacion_meta
        and c.tipo = 'bono'
        and c.acumulable
        and (p_campana is null or c.campana_id = p_campana)
        and c.vigencia_desde <= p_hasta
        and (c.vigencia_hasta is null or c.vigencia_hasta >= p_desde)
        and c.desde <= case c.base
                         when 'beneficiario' then p.beneficiarios
                         else p.contratos
                       end
    ), 0)
    + coalesce((
      select c.monto_clp from comision c
      where c.agrupacion_meta = p.agrupacion_meta
        and c.tipo = 'bono'
        and not c.acumulable
        and (p_campana is null or c.campana_id = p_campana)
        and c.vigencia_desde <= p_hasta
        and (c.vigencia_hasta is null or c.vigencia_hasta >= p_desde)
        and c.desde <= case c.base
                         when 'beneficiario' then p.beneficiarios
                         else p.contratos
                       end
      order by c.desde desc limit 1
    ), 0) as bonos_clp
  from produccion p
)
select
  c.ejecutivo_id,
  e.nombre_canonico,
  c.agrupacion_meta,
  c.contratos,
  c.beneficiarios,
  c.tramo_clp,
  round(coalesce(c.tramo_clp, 0) * c.beneficiarios, 0) as comision_clp,
  round(c.bonos_clp, 0) as bonos_clp,
  round(coalesce(c.tramo_clp, 0) * c.beneficiarios + c.bonos_clp, 0) as total_clp
from calculado c
join ejecutivo e on e.id = c.ejecutivo_id
order by 9 desc;
$$;

comment on function comision_ejecutivo is
  'Comisión y bonos ganados por ejecutivo y línea en el periodo. El
   tramo escalonado se aplica a toda la producción, no sólo al
   excedente; los bonos acumulables se suman entre sí.';;
