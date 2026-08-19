-- Equipo debe ser una proyeccion de los hechos cargados, no una lista de
-- snapshots duplicables. NULLS NOT DISTINCT hace idempotente el caso de datos
-- sin campana y el recalculo reemplaza por completo el periodo afectado.

delete from public.kpi_ejecutivo a
using public.kpi_ejecutivo b
where a.periodo_id = b.periodo_id
  and a.ejecutivo_id = b.ejecutivo_id
  and a.campana_id is not distinct from b.campana_id
  and (a.calculado_at, a.id) < (b.calculado_at, b.id);

alter table public.kpi_ejecutivo
  drop constraint if exists kpi_ejecutivo_periodo_id_ejecutivo_id_campana_id_key;

create unique index if not exists kpi_ejecutivo_periodo_ejecutivo_campana_unq
  on public.kpi_ejecutivo (periodo_id, ejecutivo_id, campana_id) nulls not distinct;

create or replace function public.calcular_kpi_periodo(p_periodo_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_inicio date; v_fin date; v_filas int;
begin
  select tenant_id, fecha_inicio, fecha_fin into v_tenant, v_inicio, v_fin
    from public.periodo where id = p_periodo_id;
  if v_tenant is null then
    raise exception 'Periodo % no existe', p_periodo_id;
  end if;

  -- El snapshot es derivado: al recalcular se eliminan filas obsoletas y se
  -- reconstruye una sola fila por ejecutivo/campana.
  delete from public.kpi_ejecutivo where periodo_id = p_periodo_id;

  with base as (
    -- Dotacion asignada durante el periodo, incluso si produjo cero.
    select distinct e.id as ejecutivo_id, ec.campana_id
      from public.ejecutivo e
      join public.ejecutivo_campana ec on ec.ejecutivo_id = e.id
       and ec.desde <= v_fin
       and (ec.hasta is null or ec.hasta >= v_inicio)
     where e.tenant_id = v_tenant
       and (e.fecha_ingreso is null or e.fecha_ingreso <= v_fin)
       and (e.fecha_egreso is null or e.fecha_egreso >= v_inicio)
    union
    -- Los hechos mandan: incluye ejecutivos aunque falte su asignacion maestra.
    select ejecutivo_id, campana_id from public.venta
     where tenant_id = v_tenant and ejecutivo_id is not null
       and fecha_solicitud::date between v_inicio and v_fin
    union
    select ejecutivo_id, campana_id from public.cotizacion
     where tenant_id = v_tenant and ejecutivo_id is not null
       and fecha::date between v_inicio and v_fin
    union
    select ejecutivo_id, campana_id from public.gestion
     where tenant_id = v_tenant and ejecutivo_id is not null
       and fecha::date between v_inicio and v_fin
    union
    select ejecutivo_id, campana_id from public.asistencia
     where tenant_id = v_tenant
       and fecha between v_inicio and v_fin
  ),
  dias as (
    select ejecutivo_id, campana_id, sum(dg)::int as dg
      from public.v_dias_gestionados
     where tenant_id = v_tenant
       and mes between date_trunc('month', v_inicio)::date and date_trunc('month', v_fin)::date
     group by 1,2
  ),
  cot as (
    select ejecutivo_id, campana_id, count(*)::int as cotizaciones
      from public.cotizacion
     where tenant_id = v_tenant and fecha::date between v_inicio and v_fin
     group by 1,2
  ),
  ges as (
    select ejecutivo_id, campana_id, count(*)::int as gestiones
      from public.gestion
     where tenant_id = v_tenant and fecha::date between v_inicio and v_fin
     group by 1,2
  ),
  ven as (
    select ejecutivo_id, campana_id, count(*)::int as contratos,
           sum(n_asegurados)::int as asegurados, sum(coalesce(precio_uf,0)) as uf
      from public.venta
     where tenant_id = v_tenant and fecha_solicitud::date between v_inicio and v_fin
     group by 1,2
  ),
  anu as (
    select v.ejecutivo_id, v.campana_id,
           sum(coalesce(a.n_asegurados, v.n_asegurados))::int as anulados
      from public.anulacion a join public.venta v on v.id = a.venta_id
     where a.tenant_id = v_tenant and a.periodo_descuento between v_inicio and v_fin
     group by 1,2
  ),
  consolidado as (
    select b.ejecutivo_id, b.campana_id,
           coalesce(
             nullif(d.dg, 0),
             public.dias_habiles(v_inicio, least(v_fin, current_date))
           ) as dg,
           coalesce(c.cotizaciones,0) as cotizaciones,
           coalesce(g.gestiones,0) as gestiones, coalesce(v.contratos,0) as contratos,
           coalesce(v.asegurados,0) as asegurados, coalesce(an.anulados,0) as anulados,
           coalesce(v.uf,0) as uf
      from base b
      left join dias d on d.ejecutivo_id = b.ejecutivo_id and d.campana_id is not distinct from b.campana_id
      left join cot c on c.ejecutivo_id = b.ejecutivo_id and c.campana_id is not distinct from b.campana_id
      left join ges g on g.ejecutivo_id = b.ejecutivo_id and g.campana_id is not distinct from b.campana_id
      left join ven v on v.ejecutivo_id = b.ejecutivo_id and v.campana_id is not distinct from b.campana_id
      left join anu an on an.ejecutivo_id = b.ejecutivo_id and an.campana_id is not distinct from b.campana_id
  ),
  calculado as (
    select c.*, (c.asegurados - c.anulados) as netos,
           nullif(c.dg,0) as dg_nz, nullif(c.cotizaciones,0) as cot_nz,
           nullif(c.contratos,0) as con_nz, nullif(c.asegurados,0) as ase_nz
      from consolidado c
  ),
  con_indices as (
    select k.*,
           round((k.netos::numeric / k.dg_nz),4) as ip_d,
           round((k.asegurados::numeric / k.cot_nz),4) as ip_c,
           round((k.uf / k.dg_nz),4) as ip_v,
           round((k.contratos::numeric / k.cot_nz),4) as tasa_cierre,
           round((k.asegurados::numeric / k.con_nz),4) as profundidad,
           round((k.uf / k.ase_nz),4) as uf_x_aseg,
           round((k.netos::numeric / k.ase_nz),4) as venta_sana
      from calculado k
  ),
  con_cuartiles as (
    select ci.*,
           case when ci.dg > 0 then ntile(4) over (partition by ci.campana_id order by ci.ip_d nulls first) end as q_ip_d,
           case when ci.cotizaciones > 0 then ntile(4) over (partition by ci.campana_id order by ci.ip_c nulls first) end as q_ip_c,
           case when ci.dg > 0 then ntile(4) over (partition by ci.campana_id order by ci.ip_v nulls first) end as q_ip_v,
           case when ci.dg > 0 then rank() over (partition by ci.campana_id order by ci.ip_d desc nulls last) end as rk,
           case when ci.dg > 0 then round((percent_rank() over (partition by ci.campana_id order by ci.ip_d nulls first) * 100)::numeric, 2) end as pct
      from con_indices ci
  )
  insert into public.kpi_ejecutivo (
    tenant_id, periodo_id, ejecutivo_id, campana_id,
    dg, cotizaciones, gestiones, contratos, asegurados,
    asegurados_anulados, asegurados_netos, uf,
    ip_d, ip_c, ip_v, tasa_cierre, profundidad, uf_por_asegurado,
    indice_venta_sana, cuartil_ip_d, cuartil_ip_c, cuartil_ip_v, ranking, percentil)
  select v_tenant, p_periodo_id, ejecutivo_id, campana_id,
         dg, cotizaciones, gestiones, contratos, asegurados,
         anulados, netos, uf, ip_d, ip_c, ip_v, tasa_cierre, profundidad,
         uf_x_aseg, venta_sana, q_ip_d, q_ip_c, q_ip_v, rk, pct
    from con_cuartiles;

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

revoke execute on function public.calcular_kpi_periodo(uuid) from public, anon;
grant execute on function public.calcular_kpi_periodo(uuid) to authenticated;

-- Backfill de los meses ya cargados para que Equipo tenga historia desde el
-- primer despliegue de esta correccion, sin exigir clics manuales.
do $$
declare
  r record;
  v_periodo uuid;
begin
  for r in
    select tenant_id, mes
      from (
        select tenant_id, date_trunc('month', fecha_solicitud)::date as mes from public.venta
        union
        select tenant_id, date_trunc('month', fecha)::date from public.cotizacion
        union
        select tenant_id, date_trunc('month', fecha)::date from public.gestion
        union
        select tenant_id, date_trunc('month', fecha)::date from public.asistencia
      ) meses
     where mes is not null
     order by tenant_id, mes
  loop
    insert into public.periodo (tenant_id, tipo, fecha_inicio, fecha_fin, etiqueta)
    values (
      r.tenant_id, 'mes', r.mes, (r.mes + interval '1 month - 1 day')::date,
      (array['Enero','Febrero','Marzo','Abril','Mayo','Junio',
             'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])
        [extract(month from r.mes)::integer] || ' ' || extract(year from r.mes)::integer
    )
    on conflict (tenant_id, tipo, fecha_inicio) do update
      set fecha_fin = excluded.fecha_fin, etiqueta = excluded.etiqueta
    returning id into v_periodo;

    perform public.calcular_kpi_periodo(v_periodo);
  end loop;
end;
$$;
