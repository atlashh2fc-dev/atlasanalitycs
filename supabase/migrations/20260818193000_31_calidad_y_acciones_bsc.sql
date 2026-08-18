-- ---------------------------------------------------------------------
-- 31 · Calidad de datos y ciclo de acciones del BSC
-- ---------------------------------------------------------------------

create table if not exists accion_bsc (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id) on delete cascade,
  campana_id uuid references campana(id) on delete cascade,
  ejecutivo_id uuid references ejecutivo(id) on delete set null,
  titulo text not null,
  descripcion text,
  prioridad text not null default 'media'
    check (prioridad in ('critica', 'alta', 'media', 'baja')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'en curso', 'resuelta', 'descartada')),
  responsable text,
  vencimiento date,
  creado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accion_bsc_tenant_estado_idx
  on accion_bsc (tenant_id, estado, created_at desc);
create index if not exists accion_bsc_campana_idx
  on accion_bsc (campana_id, created_at desc);

drop trigger if exists accion_bsc_touch on accion_bsc;
create trigger accion_bsc_touch before update on accion_bsc
  for each row execute function tg_set_updated_at();

alter table accion_bsc enable row level security;

drop policy if exists accion_bsc_lectura on accion_bsc;
create policy accion_bsc_lectura on accion_bsc
  for select to authenticated
  using (
    tenant_id = current_tenant_id()
    and (campana_id is null or campana_id in (select campanas_visibles()))
  );

drop policy if exists accion_bsc_escritura on accion_bsc;
create policy accion_bsc_escritura on accion_bsc
  for all to authenticated
  using (
    tenant_id = current_tenant_id()
    and (campana_id is null or campana_id in (select campanas_visibles()))
  )
  with check (
    tenant_id = current_tenant_id()
    and (campana_id is null or campana_id in (select campanas_visibles()))
  );

-- Una fila por control de calidad. Cero puede ser un buen resultado;
-- null significa que la fuente todavía no permite medirlo.
create or replace function calidad_bsc(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  codigo text,
  indicador text,
  valor numeric,
  unidad text,
  estado text,
  detalle text,
  ultima_fecha date
)
language sql
stable
security invoker
set search_path = public
as $fn$
with
v as (
  select
    count(*)::numeric as total,
    count(*) filter (where ejecutivo_id is null)::numeric as sin_ejecutivo,
    max(fecha_solicitud::date) as ultima
  from venta
  where fecha_solicitud::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
g as (
  select
    count(*)::numeric as total,
    count(*) filter (where ejecutivo_id is null)::numeric as sin_ejecutivo,
    max(fecha::date) as ultima
  from gestion
  where fecha::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
),
descuadre as (
  select count(*)::numeric as n
  from (
    select ve.id
    from venta ve
    left join venta_asegurado va on va.venta_id = ve.id
    where ve.fecha_solicitud::date between p_desde and p_hasta
      and (p_campana is null or ve.campana_id = p_campana)
    group by ve.id, ve.n_asegurados
    having count(va.id) <> ve.n_asegurados
  ) x
),
sin_actividad as (
  select count(*)::numeric as n
  from ejecutivo e
  where e.activo
    and (p_campana is null or exists (
      select 1 from ejecutivo_campana ec
      where ec.ejecutivo_id = e.id and ec.campana_id = p_campana
    ))
    and not exists (
      select 1 from gestion ge
      where ge.ejecutivo_id = e.id
        and ge.fecha::date between p_desde and p_hasta
        and (p_campana is null or ge.campana_id = p_campana)
    )
    and not exists (
      select 1 from venta ve
      where ve.ejecutivo_id = e.id
        and ve.fecha_solicitud::date between p_desde and p_hasta
        and (p_campana is null or ve.campana_id = p_campana)
    )
)
select * from (values
  ('ventas_frescura', 'Última venta cargada',
    case when (select ultima from v) is null then null
         else (least(current_date, p_hasta) - (select ultima from v))::numeric end,
    'dias',
    case when (select ultima from v) is null then 'sin_datos'
         when least(current_date, p_hasta) - (select ultima from v) <= 1 then 'bien'
         when least(current_date, p_hasta) - (select ultima from v) <= 3 then 'advertencia'
         else 'critico' end,
    'Días desde la última venta incluida en el rango.', (select ultima from v)),
  ('gestion_frescura', 'Última gestión cargada',
    case when (select ultima from g) is null then null
         else (least(current_date, p_hasta) - (select ultima from g))::numeric end,
    'dias',
    case when (select ultima from g) is null then 'sin_datos'
         when least(current_date, p_hasta) - (select ultima from g) <= 1 then 'bien'
         when least(current_date, p_hasta) - (select ultima from g) <= 3 then 'advertencia'
         else 'critico' end,
    'Días desde la última gestión del discador incluida en el rango.', (select ultima from g)),
  ('ventas_sin_ejecutivo', 'Ventas sin ejecutivo', (select sin_ejecutivo from v), 'registros',
    case when (select sin_ejecutivo from v) = 0 then 'bien' else 'critico' end,
    'Contratos que no pueden atribuirse a una persona.', (select ultima from v)),
  ('gestiones_sin_ejecutivo', 'Gestiones sin ejecutivo', (select sin_ejecutivo from g), 'registros',
    case when (select sin_ejecutivo from g) = 0 then 'bien' else 'advertencia' end,
    'Intentos que no pueden atribuirse a una persona.', (select ultima from g)),
  ('asegurados_descuadrados', 'Ventas con asegurados descuadrados', (select n from descuadre), 'registros',
    case when (select n from descuadre) = 0 then 'bien' else 'critico' end,
    'El conteo declarado no coincide con titulares y cargas guardados.', (select ultima from v)),
  ('ejecutivos_sin_actividad', 'Ejecutivos activos sin actividad', (select n from sin_actividad), 'personas',
    case when (select n from sin_actividad) = 0 then 'bien' else 'advertencia' end,
    'Personas activas en el mantenedor sin gestión ni venta en el rango.', greatest((select ultima from v), (select ultima from g)))
) as q(codigo, indicador, valor, unidad, estado, detalle, ultima_fecha);
$fn$;

comment on function calidad_bsc is
  'Controles de frescura, atribución y consistencia que acompañan al BSC para no decidir sobre datos incompletos.';
