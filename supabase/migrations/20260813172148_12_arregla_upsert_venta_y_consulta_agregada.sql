-- ---------------------------------------------------------------------
-- 1. El upsert de venta fallaba en silencio
--
--    El índice único era PARCIAL (where nro_solicitud is not null) y
--    Postgres no infiere índices parciales en ON CONFLICT: cada venta
--    reventaba mientras el cliente sí se creaba. Resultado: 73 clientes
--    y 0 ventas. Se reemplaza por una restricción única normal — los
--    NULL siguen siendo distintos entre sí, así que una venta sin número
--    de solicitud no bloquea a otra.
-- ---------------------------------------------------------------------
drop index if exists venta_tenant_id_nro_solicitud_idx;

alter table venta
  add constraint venta_tenant_nro_solicitud_unico
  unique (tenant_id, nro_solicitud);

-- ---------------------------------------------------------------------
-- 2. Agregación en la base
--
--    La API REST corta en 1.000 filas (max-rows), así que agregar en el
--    navegador daba totales truncados: 2.064 cotizaciones se mostraban
--    como 1.000. Acá se agrupa en Postgres y viaja sólo el resultado.
--
--    SECURITY INVOKER a propósito: el RLS del usuario sigue aplicando,
--    un supervisor sólo agrega sobre sus campañas.
-- ---------------------------------------------------------------------
create or replace function consulta_widget(
  p_fuente       text,
  p_metrica      text,
  p_dimension    text default null,
  p_granularidad text default 'dia',
  p_desde        date default null,
  p_hasta        date default null,
  p_campana      uuid default null,
  p_limite       int  default 50,
  p_orden        text default 'desc'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_from     text;
  v_fecha    text;
  v_campana  text;
  v_dim      text;
  v_met      text;
  v_unidad   text;
  v_where    text := ' where true ';
  v_sql      text;
  v_filas    jsonb;
  v_total    numeric;
  v_registros bigint;
  v_trunc    text;
begin
  -- Origen de datos. Todos los nombres salen de este CASE: nada de lo
  -- que manda el cliente entra crudo al SQL.
  case p_fuente
    when 'venta' then
      v_from := 'venta v left join ejecutivo e on e.id = v.ejecutivo_id '
             || 'left join producto p on p.id = v.producto_id';
      v_fecha := 'v.fecha_solicitud'; v_campana := 'v.campana_id';
    when 'cotizacion' then
      v_from := 'cotizacion v left join ejecutivo e on e.id = v.ejecutivo_id '
             || 'left join producto p on p.id = v.producto_id';
      v_fecha := 'v.fecha'; v_campana := 'v.campana_id';
    when 'agendamiento' then
      v_from := 'agendamiento v';
      v_fecha := 'v.fecha_agenda'; v_campana := 'v.campana_id';
    when 'asistencia' then
      v_from := 'asistencia v left join ejecutivo e on e.id = v.ejecutivo_id';
      v_fecha := 'v.fecha'; v_campana := 'v.campana_id';
    when 'cliente' then
      v_from := 'cliente v';
      v_fecha := 'v.created_at'; v_campana := null;
    else
      raise exception 'Fuente desconocida: %', p_fuente;
  end case;

  -- Métrica
  case p_fuente || '.' || p_metrica
    when 'venta.asegurados'   then v_met := 'coalesce(sum(v.n_asegurados),0)'; v_unidad := 'entero';
    when 'venta.contratos'    then v_met := 'count(*)'; v_unidad := 'entero';
    when 'venta.uf'           then v_met := 'coalesce(sum(v.precio_uf),0)'; v_unidad := 'uf';
    when 'venta.monto'        then v_met := 'coalesce(sum(v.precio_clp),0)'; v_unidad := 'clp';
    when 'venta.ticket'       then v_met := 'coalesce(avg(v.precio_uf),0)'; v_unidad := 'uf';
    when 'venta.profundidad'  then v_met := 'coalesce(avg(v.n_asegurados),0)'; v_unidad := 'decimal';
    when 'cotizacion.cotizaciones' then v_met := 'count(*)'; v_unidad := 'entero';
    when 'cotizacion.uf'      then v_met := 'coalesce(sum(v.precio_uf),0)'; v_unidad := 'uf';
    when 'cotizacion.ticket'  then v_met := 'coalesce(avg(v.precio_uf),0)'; v_unidad := 'uf';
    when 'agendamiento.registros' then v_met := 'count(*)'; v_unidad := 'entero';
    when 'agendamiento.presentados' then
      v_met := 'count(*) filter (where v.presentado)'; v_unidad := 'entero';
    when 'agendamiento.tasa_presentacion' then
      v_met := 'coalesce(count(*) filter (where v.presentado)::numeric / nullif(count(*),0), 0)';
      v_unidad := 'porcentaje';
    when 'asistencia.dias_gestionados' then
      v_met := 'count(*) filter (where v.marca = ''P'')'; v_unidad := 'entero';
    when 'asistencia.dias_registrados' then v_met := 'count(*)'; v_unidad := 'entero';
    when 'asistencia.adherencia' then
      v_met := 'coalesce(count(*) filter (where v.marca = ''P'')::numeric / nullif(count(*),0), 0)';
      v_unidad := 'porcentaje';
    when 'asistencia.jornada' then v_met := 'coalesce(avg(v.jornada_horas),0)'; v_unidad := 'decimal';
    when 'cliente.clientes'   then v_met := 'count(*)'; v_unidad := 'entero';
    when 'cliente.edad'       then v_met := 'coalesce(avg(v.edad),0)'; v_unidad := 'decimal';
    else raise exception 'Métrica desconocida: %.%', p_fuente, p_metrica;
  end case;

  -- Dimensión
  if p_dimension is not null then
    v_trunc := case p_granularidad
                 when 'mes' then 'month'
                 when 'semana' then 'week'
                 else 'day'
               end;

    case p_fuente || '.' || p_dimension
      when 'venta.ejecutivo'    then v_dim := 'e.nombre_canonico';
      when 'venta.producto'     then v_dim := 'p.nombre';
      when 'venta.linea'        then v_dim := 'p.linea';
      when 'venta.agrupacion'   then v_dim := 'p.agrupacion_meta';
      when 'venta.cobertura'    then v_dim := 'v.cobertura';
      when 'venta.medio_pago'   then v_dim := 'v.medio_pago';
      when 'venta.canal'        then v_dim := 'v.canal';
      when 'venta.fecha'        then v_dim := format('to_char(date_trunc(%L, v.fecha_solicitud), %L)', v_trunc, 'YYYY-MM-DD');
      when 'cotizacion.ejecutivo'     then v_dim := 'e.nombre_canonico';
      when 'cotizacion.producto'      then v_dim := 'p.nombre';
      when 'cotizacion.sistema_salud' then v_dim := 'v.sistema_salud';
      when 'cotizacion.procedencia'   then v_dim := 'v.procedencia_lead';
      when 'cotizacion.fecha'   then v_dim := format('to_char(date_trunc(%L, v.fecha), %L)', v_trunc, 'YYYY-MM-DD');
      when 'agendamiento.centro'       then v_dim := 'v.centro';
      when 'agendamiento.area'         then v_dim := 'v.area';
      when 'agendamiento.especialidad' then v_dim := 'v.especialidad';
      when 'agendamiento.prevision'    then v_dim := 'v.prevision';
      when 'agendamiento.equipo'       then v_dim := 'v.equipo';
      when 'agendamiento.linea'        then v_dim := 'v.linea';
      when 'agendamiento.cluster'      then v_dim := 'v.cluster';
      when 'agendamiento.fecha' then v_dim := format('to_char(date_trunc(%L, v.fecha_agenda), %L)', v_trunc, 'YYYY-MM-DD');
      when 'asistencia.ejecutivo' then v_dim := 'e.nombre_canonico';
      when 'asistencia.marca'     then v_dim := 'v.marca::text';
      when 'asistencia.fecha'     then v_dim := format('to_char(date_trunc(%L, v.fecha), %L)', v_trunc, 'YYYY-MM-DD');
      when 'cliente.region'    then v_dim := 'v.region';
      when 'cliente.prevision' then v_dim := 'v.prevision';
      when 'cliente.sexo'      then v_dim := 'v.sexo';
      when 'cliente.tramo'     then v_dim := 'v.tramo_etario';
      else raise exception 'Dimensión desconocida: %.%', p_fuente, p_dimension;
    end case;
  end if;

  if p_desde is not null then
    v_where := v_where || format(' and %s >= %L', v_fecha, p_desde);
  end if;
  if p_hasta is not null then
    v_where := v_where || format(' and %s < (%L::date + 1)', v_fecha, p_hasta);
  end if;
  if p_campana is not null and v_campana is not null then
    v_where := v_where || format(' and %s = %L', v_campana, p_campana);
  end if;

  -- Total del periodo y cantidad de registros
  execute format('select %s, count(*) from %s %s', v_met, v_from, v_where)
    into v_total, v_registros;

  if p_dimension is null then
    return jsonb_build_object(
      'filas', '[]'::jsonb, 'total', coalesce(v_total, 0),
      'unidad', v_unidad, 'registros', v_registros);
  end if;

  v_sql := format(
    'select coalesce(jsonb_agg(jsonb_build_object(''clave'', clave, ''valor'', round(valor, 4)) order by %s), ''[]''::jsonb)
       from (select coalesce(nullif(trim(%s::text), ''''), ''Sin dato'') as clave, %s::numeric as valor
               from %s %s
              group by 1
              order by %s
              limit %s) t',
    case when p_dimension = 'fecha' then 'clave asc'
         when p_orden = 'asc' then 'valor asc' else 'valor desc' end,
    v_dim, v_met, v_from, v_where,
    case when p_dimension = 'fecha' then '1 asc'
         when p_orden = 'asc' then '2 asc' else '2 desc' end,
    greatest(coalesce(p_limite, 50), 1)
  );

  execute v_sql into v_filas;

  return jsonb_build_object(
    'filas', v_filas, 'total', coalesce(v_total, 0),
    'unidad', v_unidad, 'registros', v_registros);
end;
$$;

revoke execute on function consulta_widget from anon, public;
grant  execute on function consulta_widget to authenticated;

comment on function consulta_widget is
  'Agrega en la base para no chocar con el tope de 1.000 filas de la API REST. SECURITY INVOKER: el RLS del usuario sigue aplicando.';;
