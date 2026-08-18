create or replace function economia_ejecutivo(
  p_desde date,
  p_hasta date,
  p_campana uuid default null
)
returns table (
  ejecutivo_id      uuid,
  ejecutivo         text,
  contratos         int,
  asegurados        int,
  gestiones         int,
  uf_vendida        numeric,
  ingreso_uf        numeric,
  ingreso_clp       numeric,
  renta_bruta_clp   numeric,
  costo_empresa_clp numeric,
  margen_clp        numeric,
  margen_pct        numeric
)
language sql
stable
security invoker
set search_path = public
as $fn$
with fraccion as (select fraccion_de_mes(p_desde, p_hasta) as f),
uf as (select uf_del_periodo(p_desde, p_hasta) as v),
-- La tarifa del oncologico depende del cumplimiento de toda la campana,
-- asi que se resuelve una vez y se aplica a cada ejecutivo.
tarifas_onco as (
  select agrupacion_meta, tarifa_uf
  from ingreso_periodo(p_desde, p_hasta, p_campana)
  where tarifa_uf is not null
),
ventas as (
  select v.id, v.ejecutivo_id, v.precio_uf, pr.agrupacion_meta
  from venta v
  join producto pr on pr.id = v.producto_id
  where v.fecha_solicitud::date between p_desde and p_hasta
    and (p_campana is null or v.campana_id = p_campana)
),
personas as (
  select ve.ejecutivo_id, ve.id venta_id, ve.agrupacion_meta, va.parentesco, va.edad
  from ventas ve
  join venta_asegurado va on va.venta_id = ve.id
),
ingreso as (
  select
    p.ejecutivo_id,
    sum(
      coalesce(
        (select t.tarifa_uf from tarifas_onco t where t.agrupacion_meta = p.agrupacion_meta),
        (select t.valor_uf from tarifa t
          where t.agrupacion_meta = p.agrupacion_meta
            and t.criterio = 'edad'
            and (p_campana is null or t.campana_id = p_campana)
            and t.vigencia_desde <= p_hasta
            and (t.vigencia_hasta is null or t.vigencia_hasta >= p_desde)
            and (
              (t.alcance = 'titular' and p.parentesco = 'titular'
                 and p.edad is not null
                 and p.edad >= t.desde and p.edad <= coalesce(t.hasta, 999))
              or (t.alcance = 'adicional' and p.parentesco = 'carga')
            )
          limit 1),
        0
      )
    ) as ingreso_uf,
    count(*)::int as asegurados,
    count(distinct p.venta_id)::int as contratos
  from personas p
  group by 1
),
gest as (
  select ejecutivo_id, count(*)::int n
  from gestion
  where fecha::date between p_desde and p_hasta
    and (p_campana is null or campana_id = p_campana)
  group by 1
),
uf_vend as (
  select ejecutivo_id, sum(precio_uf) uf from ventas group by 1
),
costo as (
  select
    r.ejecutivo_id,
    r.sueldo_base_clp * (select f from fraccion) as base,
    r.comision_asegurado_clp as comision_unitaria,
    r.factor_leyes
  from remuneracion r
  where r.vigencia_desde <= p_hasta
    and (r.vigencia_hasta is null or r.vigencia_hasta >= p_desde)
),
armado as (
  select
    e.id as ejecutivo_id,
    e.nombre_canonico as ejecutivo,
    coalesce(i.contratos, 0) as contratos,
    coalesce(i.asegurados, 0) as asegurados,
    coalesce(g.n, 0) as gestiones,
    round(coalesce(u.uf, 0), 2) as uf_vendida,
    round(coalesce(i.ingreso_uf, 0), 4) as ingreso_uf,
    round(coalesce(i.ingreso_uf, 0) * (select v from uf), 0) as ingreso_clp,
    round(coalesce(c.base, 0) + coalesce(i.asegurados, 0) * coalesce(c.comision_unitaria, 0), 0) as renta_bruta_clp,
    round((coalesce(c.base, 0) + coalesce(i.asegurados, 0) * coalesce(c.comision_unitaria, 0))
          * coalesce(c.factor_leyes, 1), 0) as costo_empresa_clp
  from ejecutivo e
  left join ingreso i on i.ejecutivo_id = e.id
  left join gest    g on g.ejecutivo_id = e.id
  left join uf_vend u on u.ejecutivo_id = e.id
  left join costo   c on c.ejecutivo_id = e.id
  where e.activo
    and (i.asegurados is not null or g.n is not null or c.ejecutivo_id is not null)
)
select
  a.ejecutivo_id, a.ejecutivo, a.contratos, a.asegurados, a.gestiones,
  a.uf_vendida, a.ingreso_uf, a.ingreso_clp, a.renta_bruta_clp, a.costo_empresa_clp,
  a.ingreso_clp - a.costo_empresa_clp as margen_clp,
  case when a.ingreso_clp = 0 then null
       else round((a.ingreso_clp - a.costo_empresa_clp) / a.ingreso_clp * 100, 1)
  end as margen_pct
from armado a
order by a.ingreso_clp desc nulls last;
$fn$;

comment on function economia_ejecutivo is
  'Produccion, ingreso generado y costo empresa por ejecutivo. Sin
   remuneracion cargada el costo queda en cero y el margen es igual al
   ingreso: hay que llenar el mantenedor para que el numero sirva.';
