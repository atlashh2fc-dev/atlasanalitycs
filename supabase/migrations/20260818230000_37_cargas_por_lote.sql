-- Permite que PostgREST haga UPSERT masivo de agendas. El índice parcial
-- original no podía inferirse con ON CONFLICT; una restricción normal conserva
-- la misma semántica para NULL (los NULL siguen siendo distintos) y habilita
-- cargas de miles de filas en una sola operación por lote.

drop index if exists public.agendamiento_tenant_id_cliente_id_fecha_agenda_especialidad_idx;

alter table public.agendamiento
  add constraint agendamiento_clave_carga_unica
  unique (tenant_id, cliente_id, fecha_agenda, especialidad);

-- El importador también lo usan supervisores. Esta función permite actualizar
-- los snapshots que cambió la carga sin darles escritura general sobre periodo.
create or replace function public.recalcular_periodos_carga(p_meses date[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := current_tenant_id();
  v_mes date;
  v_periodo uuid;
  v_total integer := 0;
begin
  if v_tenant is null then
    raise exception 'La sesión no tiene un tenant asignado';
  end if;

  foreach v_mes in array coalesce(p_meses, array[]::date[]) loop
    v_mes := date_trunc('month', v_mes)::date;
    insert into public.periodo (tenant_id, tipo, fecha_inicio, fecha_fin, etiqueta)
    values (
      v_tenant,
      'mes',
      v_mes,
      (v_mes + interval '1 month - 1 day')::date,
      (array['Enero','Febrero','Marzo','Abril','Mayo','Junio',
             'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])
        [extract(month from v_mes)::integer] || ' ' || extract(year from v_mes)::integer
    )
    on conflict (tenant_id, tipo, fecha_inicio) do update
      set fecha_fin = excluded.fecha_fin,
          etiqueta = excluded.etiqueta
    returning id into v_periodo;

    perform public.calcular_kpi_periodo(v_periodo);
    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.recalcular_periodos_carga(date[]) from public, anon;
grant execute on function public.recalcular_periodos_carga(date[]) to authenticated;
