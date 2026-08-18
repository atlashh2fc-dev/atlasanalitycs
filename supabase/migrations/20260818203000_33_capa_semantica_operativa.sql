-- ---------------------------------------------------------------------
-- 33 · Capa semántica operativa para paneles personales
-- ---------------------------------------------------------------------
-- Una fila por día, campaña y ejecutivo. Permite que el constructor de
-- tarjetas correlacione discador, cotizaciones y ventas sin sumar datos
-- en el navegador ni perder los paneles guardados existentes.

create or replace view v_operacion_diaria
with (security_invoker = true)
as
with
g as (
  select ge.tenant_id, ge.fecha::date as fecha, ge.campana_id, ge.ejecutivo_id,
         count(*)::numeric as gestiones,
         count(*) filter (where ti.cuenta_como_contacto)::numeric as contactos
  from gestion ge
  left join tipificacion ti on ti.id = ge.tipificacion_id
  group by 1,2,3,4
),
c as (
  select tenant_id, fecha::date as fecha, campana_id, ejecutivo_id,
         count(*)::numeric as cotizaciones
  from cotizacion
  group by 1,2,3,4
),
v as (
  select tenant_id, fecha_solicitud::date as fecha, campana_id, ejecutivo_id,
         count(*)::numeric as contratos,
         coalesce(sum(n_asegurados), 0)::numeric as asegurados
  from venta
  group by 1,2,3,4
),
llaves as (
  select tenant_id, fecha, campana_id, ejecutivo_id from g
  union
  select tenant_id, fecha, campana_id, ejecutivo_id from c
  union
  select tenant_id, fecha, campana_id, ejecutivo_id from v
)
select l.tenant_id, l.fecha, l.campana_id, l.ejecutivo_id,
       coalesce(g.gestiones, 0) as gestiones,
       coalesce(g.contactos, 0) as contactos,
       coalesce(c.cotizaciones, 0) as cotizaciones,
       coalesce(v.contratos, 0) as contratos,
       coalesce(v.asegurados, 0) as asegurados
from llaves l
left join g on g.tenant_id = l.tenant_id and g.fecha = l.fecha
  and g.campana_id is not distinct from l.campana_id
  and g.ejecutivo_id is not distinct from l.ejecutivo_id
left join c on c.tenant_id = l.tenant_id and c.fecha = l.fecha
  and c.campana_id is not distinct from l.campana_id
  and c.ejecutivo_id is not distinct from l.ejecutivo_id
left join v on v.tenant_id = l.tenant_id and v.fecha = l.fecha
  and v.campana_id is not distinct from l.campana_id
  and v.ejecutivo_id is not distinct from l.ejecutivo_id;

create or replace function consulta_widget_operacion(
  p_metrica text,
  p_dimension text default null,
  p_granularidad text default 'dia',
  p_desde date default null,
  p_hasta date default null,
  p_campana uuid default null,
  p_limite int default 50,
  p_orden text default 'desc'
)
returns jsonb
language plpgsql stable security invoker set search_path = public
as $fn$
declare
  v_met text;
  v_unidad text;
  v_dim text;
  v_trunc text;
  v_where text := ' where true ';
  v_sql text;
  v_filas jsonb;
  v_total numeric;
  v_registros bigint;
begin
  case p_metrica
    when 'gestiones' then v_met := 'coalesce(sum(v.gestiones),0)'; v_unidad := 'entero';
    when 'contactos' then v_met := 'coalesce(sum(v.contactos),0)'; v_unidad := 'entero';
    when 'cotizaciones' then v_met := 'coalesce(sum(v.cotizaciones),0)'; v_unidad := 'entero';
    when 'contratos' then v_met := 'coalesce(sum(v.contratos),0)'; v_unidad := 'entero';
    when 'asegurados' then v_met := 'coalesce(sum(v.asegurados),0)'; v_unidad := 'entero';
    when 'contactabilidad' then
      v_met := 'coalesce(sum(v.contactos)::numeric / nullif(sum(v.gestiones),0),0)'; v_unidad := 'porcentaje';
    when 'conversion_contacto' then
      v_met := 'coalesce(sum(v.contratos)::numeric / nullif(sum(v.contactos),0),0)'; v_unidad := 'porcentaje';
    when 'conversion_cotizacion' then
      v_met := 'coalesce(sum(v.contratos)::numeric / nullif(sum(v.cotizaciones),0),0)'; v_unidad := 'porcentaje';
    when 'profundidad' then
      v_met := 'coalesce(sum(v.asegurados)::numeric / nullif(sum(v.contratos),0),0)'; v_unidad := 'decimal';
    else raise exception 'Métrica operativa desconocida: %', p_metrica;
  end case;

  if p_dimension is not null then
    v_trunc := case p_granularidad when 'mes' then 'month' when 'semana' then 'week' else 'day' end;
    case p_dimension
      when 'ejecutivo' then v_dim := 'e.nombre_canonico';
      when 'fecha' then v_dim := format('to_char(date_trunc(%L, v.fecha), %L)', v_trunc, 'YYYY-MM-DD');
      else raise exception 'Dimensión operativa desconocida: %', p_dimension;
    end case;
  end if;

  if p_desde is not null then v_where := v_where || format(' and v.fecha >= %L', p_desde); end if;
  if p_hasta is not null then v_where := v_where || format(' and v.fecha <= %L', p_hasta); end if;
  if p_campana is not null then v_where := v_where || format(' and v.campana_id = %L', p_campana); end if;

  execute format(
    'select %s, count(*) from v_operacion_diaria v left join ejecutivo e on e.id=v.ejecutivo_id %s',
    v_met, v_where
  ) into v_total, v_registros;

  if p_dimension is null then
    return jsonb_build_object('filas','[]'::jsonb,'total',coalesce(v_total,0),'unidad',v_unidad,'registros',v_registros);
  end if;

  v_sql := format(
    'select coalesce(jsonb_agg(jsonb_build_object(''clave'',clave,''valor'',round(valor,4)) order by %s),''[]''::jsonb)
       from (select coalesce(nullif(trim(%s::text),''''),''Sin dato'') clave, %s::numeric valor
               from v_operacion_diaria v left join ejecutivo e on e.id=v.ejecutivo_id %s
              group by 1 order by %s limit %s) t',
    case when p_dimension='fecha' then 'clave asc' when p_orden='asc' then 'valor asc' else 'valor desc' end,
    v_dim, v_met, v_where,
    case when p_dimension='fecha' then '1 asc' when p_orden='asc' then '2 asc' else '2 desc' end,
    greatest(coalesce(p_limite,50),1)
  );
  execute v_sql into v_filas;
  return jsonb_build_object('filas',v_filas,'total',coalesce(v_total,0),'unidad',v_unidad,'registros',v_registros);
end;
$fn$;

alter function consulta_widget(text,text,text,text,date,date,uuid,int,text)
  rename to consulta_widget_base;

create function consulta_widget(
  p_fuente text,
  p_metrica text,
  p_dimension text default null,
  p_granularidad text default 'dia',
  p_desde date default null,
  p_hasta date default null,
  p_campana uuid default null,
  p_limite int default 50,
  p_orden text default 'desc'
)
returns jsonb
language plpgsql stable security invoker set search_path = public
as $fn$
begin
  if p_fuente = 'operacion' then
    return consulta_widget_operacion(p_metrica,p_dimension,p_granularidad,p_desde,p_hasta,p_campana,p_limite,p_orden);
  end if;
  return consulta_widget_base(p_fuente,p_metrica,p_dimension,p_granularidad,p_desde,p_hasta,p_campana,p_limite,p_orden);
end;
$fn$;

revoke execute on function consulta_widget from anon, public;
grant execute on function consulta_widget to authenticated;
revoke execute on function consulta_widget_operacion from anon, public;
grant execute on function consulta_widget_operacion to authenticated;
