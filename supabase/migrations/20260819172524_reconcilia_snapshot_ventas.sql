-- Los exports de ventas son fotografias acumuladas del periodo: una solicitud
-- que desaparece del archivo nuevo (por anulacion o correccion de origen) ya no
-- debe seguir sumando. A la vez, Atlas admite cargas incrementales, por lo que
-- no es seguro reemplazar un rango solo porque un archivo trae fechas iguales.
--
-- La reconciliacion se activa unicamente cuando el archivo nuevo:
--   1. tiene al menos 10 solicitudes con llave;
--   2. ya existia al menos el 80% de sus solicitudes; y
--   3. representa al menos el 80% de la union del mismo rango.
-- Una carga parcial o incremental no cumple ambas coberturas y solo acumula.

create table carga_reconciliacion_venta (
  id bigserial primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  carga_nueva_id uuid not null references carga(id) on delete cascade,
  carga_anterior_id uuid references carga(id) on delete set null,
  venta_id_original uuid not null,
  nro_solicitud text not null,
  fecha_solicitud timestamptz not null,
  n_asegurados smallint not null,
  created_at timestamptz not null default now(),
  unique (carga_nueva_id, venta_id_original)
);

create index carga_reconciliacion_venta_carga_idx
  on carga_reconciliacion_venta (carga_nueva_id);

alter table carga_reconciliacion_venta enable row level security;
alter table carga_reconciliacion_venta force row level security;

revoke all on carga_reconciliacion_venta from anon, public;
revoke all on sequence carga_reconciliacion_venta_id_seq from anon, public;
grant select, insert on carga_reconciliacion_venta to authenticated;
grant usage, select on sequence carga_reconciliacion_venta_id_seq to authenticated;

create policy carga_reconciliacion_venta_visible
on carga_reconciliacion_venta
for select
to authenticated
using (
  tenant_id = current_tenant_id()
  and exists (
    select 1 from carga c
    where c.id = carga_reconciliacion_venta.carga_nueva_id
  )
);

create policy carga_reconciliacion_venta_inserta
on carga_reconciliacion_venta
for insert
to authenticated
with check (
  tenant_id = current_tenant_id()
  and exists (
    select 1 from carga c
    where c.id = carga_reconciliacion_venta.carga_nueva_id
  )
);

create or replace function reconciliar_ventas_carga(p_carga_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_carga carga%rowtype;
  v_desde date;
  v_hasta date;
  v_actuales int := 0;
  v_preexistentes int := 0;
  v_anteriores int := 0;
  v_retiradas int := 0;
  v_solapamiento numeric := 0;
  v_cobertura numeric := 0;
  v_modo text := 'acumulativa';
begin
  select c.*
    into v_carga
    from carga c
   where c.id = p_carga_id
     and c.tenant_id = current_tenant_id();

  if v_carga.id is null then
    raise exception 'Carga no encontrada o sin acceso.';
  end if;

  select min(v.fecha_solicitud)::date,
         max(v.fecha_solicitud)::date,
         count(*)::int,
         count(*) filter (where v.created_at < v_carga.created_at)::int
    into v_desde, v_hasta, v_actuales, v_preexistentes
    from venta v
   where v.carga_id = p_carga_id
     and v.tenant_id = v_carga.tenant_id
     and v.nro_solicitud is not null;

  if v_actuales = 0 or v_desde is null or v_hasta is null then
    return jsonb_build_object(
      'modo', 'sin_ventas_con_llave',
      'retiradas', 0
    );
  end if;

  select count(*)::int
    into v_anteriores
    from venta v
    join carga ca on ca.id = v.carga_id
   where v.tenant_id = v_carga.tenant_id
     and v.campana_id is not distinct from v_carga.campana_id
     and ca.dataset_id is not distinct from v_carga.dataset_id
     and v.carga_id is distinct from p_carga_id
     and v.nro_solicitud is not null
     and v.fecha_solicitud >= v_desde
     and v.fecha_solicitud < (v_hasta + 1);

  v_solapamiento := v_preexistentes::numeric / nullif(v_actuales, 0);
  v_cobertura := v_actuales::numeric / nullif(v_actuales + v_anteriores, 0);

  if v_actuales >= 10
     and v_solapamiento >= 0.80
     and v_cobertura >= 0.80 then
    v_modo := 'snapshot_reconciliado';

    with candidatas as (
      select v.*
        from venta v
        join carga ca on ca.id = v.carga_id
       where v.tenant_id = v_carga.tenant_id
         and v.campana_id is not distinct from v_carga.campana_id
         and ca.dataset_id is not distinct from v_carga.dataset_id
         and v.carga_id is distinct from p_carga_id
         and v.nro_solicitud is not null
         and v.fecha_solicitud >= v_desde
         and v.fecha_solicitud < (v_hasta + 1)
    ), registradas as (
      insert into carga_reconciliacion_venta (
        tenant_id, carga_nueva_id, carga_anterior_id, venta_id_original,
        nro_solicitud, fecha_solicitud, n_asegurados
      )
      select c.tenant_id, p_carga_id, c.carga_id, c.id,
             c.nro_solicitud, c.fecha_solicitud, c.n_asegurados
        from candidatas c
      on conflict (carga_nueva_id, venta_id_original) do nothing
      returning venta_id_original
    )
    delete from venta v
     using registradas r
     where v.id = r.venta_id_original;

    get diagnostics v_retiradas = row_count;
  end if;

  update carga
     set periodo_inicio = v_desde,
         periodo_fin = v_hasta,
         metadatos = coalesce(metadatos, '{}'::jsonb) || jsonb_build_object(
           'reconciliacion_ventas', jsonb_build_object(
             'modo', v_modo,
             'solicitudes_archivo', v_actuales,
             'solicitudes_preexistentes', v_preexistentes,
             'solicitudes_anteriores_en_rango', v_anteriores,
             'solapamiento', round(v_solapamiento, 4),
             'cobertura', round(v_cobertura, 4),
             'retiradas', v_retiradas,
             'desde', v_desde,
             'hasta', v_hasta
           )
         )
   where id = p_carga_id;

  return jsonb_build_object(
    'modo', v_modo,
    'retiradas', v_retiradas,
    'solapamiento', round(v_solapamiento, 4),
    'cobertura', round(v_cobertura, 4),
    'desde', v_desde,
    'hasta', v_hasta
  );
end;
$$;

revoke execute on function reconciliar_ventas_carga(uuid) from anon, public;
grant execute on function reconciliar_ventas_carga(uuid) to authenticated;

comment on function reconciliar_ventas_carga(uuid) is
  'Distingue una fotografia acumulada de una carga incremental por solapamiento y cobertura. Solo en una fotografia retira ventas ausentes del archivo nuevo dentro del rango cubierto.';
