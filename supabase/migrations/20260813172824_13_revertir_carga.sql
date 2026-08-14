-- Revertir hacía seis borrados por API REST, uno por tabla. Con decenas
-- de miles de filas crudas eso se pasaba del tiempo límite de la función
-- y la respuesta volvía como HTML de error: el spinner quedaba girando
-- para siempre. Acá es una sola transacción en la base.
create or replace function revertir_carga(p_carga_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant   uuid := current_tenant_id();
  v_carga    record;
  v_borradas int := 0;
  n          int;
begin
  if not es_admin() then
    raise exception 'Sólo un administrador puede revertir una carga.';
  end if;

  select * into v_carga from carga where id = p_carga_id and tenant_id = v_tenant;
  if v_carga is null then
    raise exception 'Carga no encontrada.';
  end if;

  delete from venta        where carga_id = p_carga_id; get diagnostics n = row_count; v_borradas := v_borradas + n;
  delete from cotizacion   where carga_id = p_carga_id; get diagnostics n = row_count; v_borradas := v_borradas + n;
  delete from asistencia   where carga_id = p_carga_id; get diagnostics n = row_count; v_borradas := v_borradas + n;
  delete from agendamiento where carga_id = p_carga_id; get diagnostics n = row_count; v_borradas := v_borradas + n;
  delete from gestion      where carga_id = p_carga_id; get diagnostics n = row_count; v_borradas := v_borradas + n;
  delete from fila_cruda   where carga_id = p_carga_id;

  -- Los clientes que quedaron sin ninguna venta ni gestión tras el
  -- borrado son huérfanos de esta carga: se limpian. Los que siguen
  -- teniendo historial de otras cargas NO se tocan.
  delete from cliente c
   where c.tenant_id = v_tenant
     and not exists (select 1 from venta v where v.cliente_id = c.id)
     and not exists (select 1 from gestion g where g.cliente_id = c.id)
     and not exists (select 1 from agendamiento a where a.cliente_id = c.id);

  insert into carga_reversion (carga_id, motivo, filas_afectadas, revertido_por)
  values (p_carga_id, coalesce(p_motivo, 'Revertida desde el mantenedor'), v_borradas, auth.uid());

  update carga
     set estado = 'revertida', filas_procesadas = 0
   where id = p_carga_id;

  return jsonb_build_object('ok', true, 'borradas', v_borradas);
end;
$$;

revoke execute on function revertir_carga from anon, public;
grant  execute on function revertir_carga to authenticated;;
