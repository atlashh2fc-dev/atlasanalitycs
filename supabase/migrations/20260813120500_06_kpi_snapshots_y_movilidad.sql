-- =====================================================================
-- Atlas Analytics — 06. Snapshots de KPI, cuartiles y movilidad
--   Esta es la estructura que permite tendencia histórica y análisis de
--   MOVILIDAD DE CUARTILES: quién sube, quién baja y quién se queda
--   estancado entre un periodo y el siguiente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Periodo: unidad de comparación
--   Se congela el cálculo por periodo para que el histórico no cambie
--   cuando llegan datos nuevos o correcciones.
-- ---------------------------------------------------------------------
create table periodo (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  tipo         tipo_periodo not null,
  fecha_inicio date not null,
  fecha_fin    date not null,
  etiqueta     text not null,
  cerrado      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (tenant_id, tipo, fecha_inicio),
  constraint periodo_rango_valido check (fecha_fin >= fecha_inicio)
);

create index on periodo (tenant_id, tipo, fecha_inicio desc);

-- ---------------------------------------------------------------------
-- KPI por ejecutivo y periodo
-- ---------------------------------------------------------------------
create table kpi_ejecutivo (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenant(id) on delete cascade,
  periodo_id         uuid not null references periodo(id) on delete cascade,
  ejecutivo_id       uuid not null references ejecutivo(id) on delete cascade,
  campana_id         uuid references campana(id) on delete set null,

  -- volumen y esfuerzo
  dg                 int     not null default 0,
  cotizaciones       int     not null default 0,
  gestiones          int     not null default 0,

  -- resultado
  contratos          int     not null default 0,
  asegurados         int     not null default 0,
  asegurados_anulados int    not null default 0,
  asegurados_netos   int     not null default 0,
  uf                 numeric(14,4) not null default 0,

  -- índices de productividad
  ip_d               numeric(10,4),   -- asegurados netos / día gestionado
  ip_c               numeric(10,4),   -- asegurados / cotización
  ip_v               numeric(10,4),   -- UF / día gestionado
  tasa_cierre        numeric(10,4),   -- contratos / cotizaciones
  profundidad        numeric(10,4),   -- asegurados / contratos
  uf_por_asegurado   numeric(10,4),
  indice_venta_sana  numeric(10,4),   -- netos / brutos

  -- posición relativa
  cuartil_ip_d       smallint,
  cuartil_ip_c       smallint,
  cuartil_ip_v       smallint,
  ranking            int,
  percentil          numeric(5,2),

  -- cumplimiento
  meta_prorrateada   numeric(12,2),
  cumplimiento       numeric(10,4),

  calculado_at       timestamptz not null default now(),
  unique (periodo_id, ejecutivo_id, campana_id)
);

create index on kpi_ejecutivo (tenant_id, periodo_id);
create index on kpi_ejecutivo (ejecutivo_id, periodo_id);
create index on kpi_ejecutivo (tenant_id, cuartil_ip_d);

comment on column kpi_ejecutivo.ip_c is
  'Efectividad de cierre. Es la métrica que destapa el caso real de un '
  'ejecutivo con 404 cotizaciones y 6 contratos frente a otro con 75 y 12.';

-- ---------------------------------------------------------------------
-- KPI agregado del equipo, por campaña y periodo
-- ---------------------------------------------------------------------
create table kpi_equipo (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenant(id) on delete cascade,
  periodo_id          uuid not null references periodo(id) on delete cascade,
  campana_id          uuid references campana(id) on delete set null,
  agrupacion_meta     text,

  ejecutivos_activos  int,
  dg_total            int,
  cotizaciones        int,
  contratos           int,
  asegurados          int,
  asegurados_netos    int,
  uf                  numeric(14,4),

  meta                numeric(12,2),
  cumplimiento        numeric(10,4),
  ritmo_requerido     numeric(10,4),
  proyeccion_cierre   numeric(12,2),

  -- distribución
  media_ip_d          numeric(10,4),
  mediana_ip_d        numeric(10,4),
  q1_ip_d             numeric(10,4),
  q3_ip_d             numeric(10,4),
  desviacion_ip_d     numeric(10,4),
  coef_variacion      numeric(10,4),
  pct_sobre_meta      numeric(5,2),
  brecha_oportunidad  numeric(12,2),

  calculado_at        timestamptz not null default now(),
  unique (periodo_id, campana_id, agrupacion_meta)
);

create index on kpi_equipo (tenant_id, periodo_id);

comment on column kpi_equipo.brecha_oportunidad is
  'Asegurados adicionales si los ejecutivos bajo la mediana alcanzaran '
  'la mediana. Convierte el análisis en gestión: no dice quién va mal, '
  'dice cuánto hay disponible y dónde.';

-- ---------------------------------------------------------------------
-- Cálculo de KPI de un periodo
-- ---------------------------------------------------------------------
create or replace function calcular_kpi_periodo(p_periodo_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_inicio  date;
  v_fin     date;
  v_filas   int;
begin
  select tenant_id, fecha_inicio, fecha_fin
    into v_tenant, v_inicio, v_fin
    from periodo
   where id = p_periodo_id;

  if v_tenant is null then
    raise exception 'Periodo % no existe', p_periodo_id;
  end if;

  with base as (
    select e.id as ejecutivo_id, ec.campana_id
      from ejecutivo e
      left join ejecutivo_campana ec on ec.ejecutivo_id = e.id
     where e.tenant_id = v_tenant
  ),
  dias as (
    select ejecutivo_id, campana_id, sum(dg)::int as dg
      from v_dias_gestionados
     where tenant_id = v_tenant
       and mes between date_trunc('month', v_inicio)::date
                   and date_trunc('month', v_fin)::date
     group by 1, 2
  ),
  cot as (
    select ejecutivo_id, campana_id, count(*)::int as cotizaciones
      from cotizacion
     where tenant_id = v_tenant
       and fecha::date between v_inicio and v_fin
     group by 1, 2
  ),
  ges as (
    select ejecutivo_id, campana_id, count(*)::int as gestiones
      from gestion
     where tenant_id = v_tenant
       and fecha::date between v_inicio and v_fin
     group by 1, 2
  ),
  ven as (
    select ejecutivo_id,
           campana_id,
           count(*)::int                as contratos,
           sum(n_asegurados)::int       as asegurados,
           sum(coalesce(precio_uf, 0))  as uf
      from venta
     where tenant_id = v_tenant
       and fecha_solicitud::date between v_inicio and v_fin
     group by 1, 2
  ),
  anu as (
    -- la anulación descuenta en el periodo en que se levanta
    select v.ejecutivo_id,
           v.campana_id,
           sum(coalesce(a.n_asegurados, v.n_asegurados))::int as anulados
      from anulacion a
      join venta v on v.id = a.venta_id
     where a.tenant_id = v_tenant
       and a.periodo_descuento between v_inicio and v_fin
     group by 1, 2
  ),
  consolidado as (
    select b.ejecutivo_id,
           b.campana_id,
           coalesce(d.dg, 0)           as dg,
           coalesce(c.cotizaciones, 0) as cotizaciones,
           coalesce(g.gestiones, 0)    as gestiones,
           coalesce(v.contratos, 0)    as contratos,
           coalesce(v.asegurados, 0)   as asegurados,
           coalesce(an.anulados, 0)    as anulados,
           coalesce(v.uf, 0)           as uf
      from base b
      left join dias d  on d.ejecutivo_id = b.ejecutivo_id
                       and d.campana_id is not distinct from b.campana_id
      left join cot  c  on c.ejecutivo_id = b.ejecutivo_id
                       and c.campana_id is not distinct from b.campana_id
      left join ges  g  on g.ejecutivo_id = b.ejecutivo_id
                       and g.campana_id is not distinct from b.campana_id
      left join ven  v  on v.ejecutivo_id = b.ejecutivo_id
                       and v.campana_id is not distinct from b.campana_id
      left join anu  an on an.ejecutivo_id = b.ejecutivo_id
                       and an.campana_id is not distinct from b.campana_id
  ),
  calculado as (
    select c.*,
           (c.asegurados - c.anulados)                                as netos,
           nullif(c.dg, 0)                                            as dg_nz,
           nullif(c.cotizaciones, 0)                                  as cot_nz,
           nullif(c.contratos, 0)                                     as con_nz,
           nullif(c.asegurados, 0)                                    as ase_nz
      from consolidado c
  ),
  con_indices as (
    select k.*,
           round((k.netos::numeric   / k.dg_nz),  4) as ip_d,
           round((k.asegurados::numeric / k.cot_nz), 4) as ip_c,
           round((k.uf               / k.dg_nz),  4) as ip_v,
           round((k.contratos::numeric  / k.cot_nz), 4) as tasa_cierre,
           round((k.asegurados::numeric / k.con_nz), 4) as profundidad,
           round((k.uf               / k.ase_nz), 4) as uf_x_aseg,
           round((k.netos::numeric   / k.ase_nz), 4) as venta_sana
      from calculado k
  ),
  con_cuartiles as (
    -- sólo entran al ranking quienes tuvieron actividad real:
    -- evita que un ingreso nuevo distorsione los cuartiles
    select ci.*,
           case when ci.dg > 0
                then ntile(4) over (partition by ci.campana_id order by ci.ip_d nulls first)
           end as q_ip_d,
           case when ci.cotizaciones > 0
                then ntile(4) over (partition by ci.campana_id order by ci.ip_c nulls first)
           end as q_ip_c,
           case when ci.dg > 0
                then ntile(4) over (partition by ci.campana_id order by ci.ip_v nulls first)
           end as q_ip_v,
           case when ci.dg > 0
                then rank() over (partition by ci.campana_id order by ci.ip_d desc nulls last)
           end as rk,
           case when ci.dg > 0
                then round((percent_rank() over (partition by ci.campana_id order by ci.ip_d nulls first) * 100)::numeric, 2)
           end as pct
      from con_indices ci
  )
  insert into kpi_ejecutivo (
    tenant_id, periodo_id, ejecutivo_id, campana_id,
    dg, cotizaciones, gestiones, contratos, asegurados,
    asegurados_anulados, asegurados_netos, uf,
    ip_d, ip_c, ip_v, tasa_cierre, profundidad, uf_por_asegurado,
    indice_venta_sana, cuartil_ip_d, cuartil_ip_c, cuartil_ip_v,
    ranking, percentil
  )
  select v_tenant, p_periodo_id, ejecutivo_id, campana_id,
         dg, cotizaciones, gestiones, contratos, asegurados,
         anulados, netos, uf,
         ip_d, ip_c, ip_v, tasa_cierre, profundidad, uf_x_aseg,
         venta_sana, q_ip_d, q_ip_c, q_ip_v, rk, pct
    from con_cuartiles
  on conflict (periodo_id, ejecutivo_id, campana_id) do update set
    dg                  = excluded.dg,
    cotizaciones        = excluded.cotizaciones,
    gestiones           = excluded.gestiones,
    contratos           = excluded.contratos,
    asegurados          = excluded.asegurados,
    asegurados_anulados = excluded.asegurados_anulados,
    asegurados_netos    = excluded.asegurados_netos,
    uf                  = excluded.uf,
    ip_d                = excluded.ip_d,
    ip_c                = excluded.ip_c,
    ip_v                = excluded.ip_v,
    tasa_cierre         = excluded.tasa_cierre,
    profundidad         = excluded.profundidad,
    uf_por_asegurado    = excluded.uf_por_asegurado,
    indice_venta_sana   = excluded.indice_venta_sana,
    cuartil_ip_d        = excluded.cuartil_ip_d,
    cuartil_ip_c        = excluded.cuartil_ip_c,
    cuartil_ip_v        = excluded.cuartil_ip_v,
    ranking             = excluded.ranking,
    percentil           = excluded.percentil,
    calculado_at        = now();

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

-- ---------------------------------------------------------------------
-- MOVILIDAD DE CUARTILES
--   Compara cada ejecutivo con su propio cuartil del periodo anterior.
--   'movimiento':
--     sube        -> mejoró de cuartil
--     baja        -> retrocedió
--     estable_alto / estable_medio / estable_bajo -> se mantuvo
--   El estancamiento en el cuartil inferior es la señal de intervención.
-- ---------------------------------------------------------------------
create view v_movilidad_cuartil as
with serie as (
  select k.tenant_id,
         k.ejecutivo_id,
         k.campana_id,
         p.id           as periodo_id,
         p.tipo,
         p.etiqueta,
         p.fecha_inicio,
         k.ip_d,
         k.cuartil_ip_d,
         lag(k.cuartil_ip_d) over w as cuartil_anterior,
         lag(k.ip_d)         over w as ip_d_anterior,
         lag(p.etiqueta)     over w as periodo_anterior
    from kpi_ejecutivo k
    join periodo p on p.id = k.periodo_id
   window w as (partition by k.ejecutivo_id, k.campana_id, p.tipo
                order by p.fecha_inicio)
)
select s.*,
       (s.cuartil_ip_d - s.cuartil_anterior)          as delta_cuartil,
       round(s.ip_d - s.ip_d_anterior, 4)             as delta_ip_d,
       case
         when s.cuartil_anterior is null              then 'sin_historia'
         when s.cuartil_ip_d > s.cuartil_anterior     then 'sube'
         when s.cuartil_ip_d < s.cuartil_anterior     then 'baja'
         when s.cuartil_ip_d = 4                      then 'estable_alto'
         when s.cuartil_ip_d = 1                      then 'estable_bajo'
         else 'estable_medio'
       end                                            as movimiento
  from serie s;

comment on view v_movilidad_cuartil is
  'ntile(4) ordena ascendente: cuartil 4 = mejor desempeño, 1 = peor. '
  'Un ejecutivo estable_bajo en tres periodos seguidos es la alerta de '
  'intervención más accionable del sistema.';

-- ---------------------------------------------------------------------
-- Matriz de transición entre cuartiles
--   Cuántos ejecutivos pasaron del cuartil X al Y. Sirve para responder
--   "¿el coaching está moviendo la aguja o el equipo está congelado?"
-- ---------------------------------------------------------------------
create view v_matriz_transicion as
select tenant_id,
       campana_id,
       tipo,
       periodo_anterior,
       etiqueta        as periodo_actual,
       cuartil_anterior,
       cuartil_ip_d    as cuartil_actual,
       count(*)::int   as ejecutivos
  from v_movilidad_cuartil
 where cuartil_anterior is not null
 group by 1, 2, 3, 4, 5, 6, 7;

-- ---------------------------------------------------------------------
-- Tendencia del equipo
-- ---------------------------------------------------------------------
create view v_tendencia_equipo as
select e.tenant_id,
       e.campana_id,
       e.agrupacion_meta,
       p.tipo,
       p.etiqueta,
       p.fecha_inicio,
       e.asegurados_netos,
       e.meta,
       e.cumplimiento,
       e.coef_variacion,
       e.brecha_oportunidad,
       e.asegurados_netos - lag(e.asegurados_netos)
         over (partition by e.campana_id, e.agrupacion_meta, p.tipo
               order by p.fecha_inicio) as delta_periodo_anterior
  from kpi_equipo e
  join periodo p on p.id = e.periodo_id;
