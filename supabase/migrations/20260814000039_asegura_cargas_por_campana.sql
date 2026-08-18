-- La campaña es el contenedor de negocio. `dataset` queda como detalle
-- técnico para conciliar campos entre cargas sucesivas de la misma campaña.

-- La reconciliación se resuelve por evidencia: campaña ya declarada en el
-- dataset o en alguna de sus cargas. Si hay más de una candidata se aborta;
-- nunca se adivina por el nombre ni se mueve un dataset entre campañas.
do $$
declare
  v_conflictos text;
begin
  select string_agg(d.nombre, ', ' order by d.nombre)
    into v_conflictos
    from public.dataset d
   where d.activo
     and (
       select count(distinct x.campana_id)
         from (
           select d.campana_id
           union all
           select ca.campana_id from public.carga ca where ca.dataset_id = d.id
         ) x
        where x.campana_id is not null
     ) > 1;

  if v_conflictos is not null then
    raise exception 'Datasets con campañas contradictorias: %', v_conflictos;
  end if;
end;
$$;

with evidencia as (
  select d.id as dataset_id, min(ca.campana_id::text)::uuid as campana_id
    from public.dataset d
    join public.carga ca on ca.dataset_id = d.id
   where d.activo and d.campana_id is null and ca.campana_id is not null
   group by d.id
)
update public.dataset d
   set campana_id = evidencia.campana_id
  from evidencia
 where d.id = evidencia.dataset_id;

-- Un dataset completamente huérfano sólo se adopta cuando su tenant tiene
-- exactamente una campaña activa. Con varias campañas el deploy falla antes
-- de esconder datos bajo una asociación inventada.
with unica as (
  select c.tenant_id, min(c.id::text)::uuid as id
    from public.campana c
   where c.activo
   group by c.tenant_id
  having count(*) = 1
)
update public.dataset d
   set campana_id = unica.id
  from unica
 where d.tenant_id = unica.tenant_id
   and d.activo and d.campana_id is null;

do $$
declare
  v_huerfanos text;
begin
  select string_agg(d.nombre, ', ' order by d.nombre)
    into v_huerfanos
    from public.dataset d
   where d.activo and d.campana_id is null;
  if v_huerfanos is not null then
    raise exception 'No se pudo determinar la campaña de estos datasets: %', v_huerfanos;
  end if;
end;
$$;

-- Si una campaña heredó varias bases, todas sus cargas se consolidan en el
-- contenedor con más historial. Se preservan filas, campos y paneles.
create temporary table atlas_dataset_canonico on commit drop as
select c.id as campana_id,
       coalesce(
         (
           select d.id
             from public.dataset d
            where d.campana_id = c.id and d.activo
            order by (select count(*) from public.carga ca where ca.dataset_id = d.id) desc,
                     d.created_at,
                     d.id
            limit 1
         ),
         gen_random_uuid()
       ) as dataset_id
  from public.campana c
 where c.activo;

insert into public.dataset (id, tenant_id, campana_id, nombre, descripcion)
select canon.dataset_id,
       c.tenant_id,
       c.id,
       case
         when exists (
           select 1 from public.dataset d
            where d.tenant_id = c.tenant_id and d.nombre = c.nombre
         ) then c.nombre || ' · campaña'
         else c.nombre
       end,
       'Contenedor de cargas de la campaña ' || c.nombre
  from atlas_dataset_canonico canon
  join public.campana c on c.id = canon.campana_id
 where not exists (
   select 1 from public.dataset d where d.id = canon.dataset_id
 );

update public.carga ca
   set dataset_id = canon.dataset_id
  from public.dataset anterior
  join atlas_dataset_canonico canon on canon.campana_id = anterior.campana_id
 where ca.dataset_id = anterior.id
   and anterior.id <> canon.dataset_id;

-- Fusiona el catálogo de campos antes de retirar los contenedores antiguos.
insert into public.dataset_campo
  (tenant_id, dataset_id, clave, nombre, tipo, rol, agregacion, unidad,
   activo, orden, config)
select dc.tenant_id,
       canon.dataset_id,
       dc.clave,
       dc.nombre,
       dc.tipo,
       dc.rol,
       dc.agregacion,
       dc.unidad,
       dc.activo,
       dc.orden,
       dc.config
  from public.dataset_campo dc
  join public.dataset anterior on anterior.id = dc.dataset_id
  join atlas_dataset_canonico canon on canon.campana_id = anterior.campana_id
 where dc.dataset_id <> canon.dataset_id
on conflict (dataset_id, clave) do nothing;

update public.carga_columna cc
   set dataset_campo_id = destino.id
  from public.dataset_campo origen
  join public.dataset anterior on anterior.id = origen.dataset_id
  join atlas_dataset_canonico canon on canon.campana_id = anterior.campana_id
  join public.dataset_campo destino
    on destino.dataset_id = canon.dataset_id and destino.clave = origen.clave
 where cc.dataset_campo_id = origen.id
   and origen.dataset_id <> canon.dataset_id;

-- Los widgets guardan también el UUID en JSON.
update public.panel_widget pw
   set config = jsonb_set(pw.config, '{datasetId}', to_jsonb(canon.dataset_id), true)
  from public.panel p
  join public.dataset anterior on anterior.id = p.dataset_id
  join atlas_dataset_canonico canon on canon.campana_id = anterior.campana_id
 where pw.panel_id = p.id
   and anterior.id <> canon.dataset_id;

-- Si el usuario ya tenía un panel para el contenedor canónico, se conserva
-- ese panel y se retira sólo el duplicado técnico antes de mover el resto.
delete from public.panel p
 using public.dataset anterior, atlas_dataset_canonico canon
 where p.dataset_id = anterior.id
   and canon.campana_id = anterior.campana_id
   and anterior.id <> canon.dataset_id
   and exists (
     select 1 from public.panel otro
      where otro.perfil_id = p.perfil_id and otro.dataset_id = canon.dataset_id
   );

update public.panel p
   set dataset_id = canon.dataset_id
  from public.dataset anterior
  join atlas_dataset_canonico canon on canon.campana_id = anterior.campana_id
 where p.dataset_id = anterior.id
   and anterior.id <> canon.dataset_id;

delete from public.dataset d
 using atlas_dataset_canonico canon
 where d.campana_id = canon.campana_id
   and d.id <> canon.dataset_id;

update public.dataset d
   set nombre = c.nombre,
       descripcion = coalesce(
         d.descripcion,
         'Contenedor de cargas de la campaña ' || c.nombre
       )
  from atlas_dataset_canonico canon
  join public.campana c on c.id = canon.campana_id
 where d.id = canon.dataset_id;

create unique index if not exists dataset_campana_unica
  on public.dataset (campana_id)
  where campana_id is not null and activo;

-- Corrige cargas históricas cuyo dataset ya estaba asociado, pero cuya
-- campaña se guardó vacía o distinta.
update public.carga ca
   set campana_id = d.campana_id,
       config = jsonb_set(
         coalesce(ca.config, '{}'::jsonb),
         '{campanaId}',
         to_jsonb(d.campana_id),
         true
       )
  from public.dataset d
 where d.id = ca.dataset_id
   and d.campana_id is not null
   and ca.campana_id is distinct from d.campana_id;

update public.gestion g set campana_id = ca.campana_id
  from public.carga ca
 where ca.id = g.carga_id and g.campana_id is distinct from ca.campana_id;
update public.cotizacion x set campana_id = ca.campana_id
  from public.carga ca
 where ca.id = x.carga_id and x.campana_id is distinct from ca.campana_id;
update public.venta v set campana_id = ca.campana_id
  from public.carga ca
 where ca.id = v.carga_id and v.campana_id is distinct from ca.campana_id;
update public.agendamiento a set campana_id = ca.campana_id
  from public.carga ca
 where ca.id = a.carga_id and a.campana_id is distinct from ca.campana_id;
update public.asistencia a set campana_id = ca.campana_id
  from public.carga ca
 where ca.id = a.carga_id and a.campana_id is distinct from ca.campana_id;
update public.plantilla_mapeo p set campana_id = d.campana_id
  from public.dataset d
 where d.id = p.dataset_id and p.campana_id is distinct from d.campana_id;

create or replace function public.tg_carga_hereda_campana_dataset()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_tenant uuid;
  v_campana uuid;
begin
  if new.dataset_id is null then
    return new;
  end if;

  select d.tenant_id, d.campana_id
    into v_tenant, v_campana
    from public.dataset d
   where d.id = new.dataset_id;

  if not found then
    raise exception 'El contenedor de datos no existe.';
  end if;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'La carga y la campaña deben pertenecer al mismo espacio.';
  end if;

  new.campana_id := v_campana;
  new.config := jsonb_set(
    coalesce(new.config, '{}'::jsonb),
    '{campanaId}',
    coalesce(to_jsonb(v_campana), 'null'::jsonb),
    true
  );
  return new;
end;
$$;

revoke execute on function public.tg_carga_hereda_campana_dataset()
  from public, anon, authenticated;

drop trigger if exists t_carga_00_hereda_campana_dataset on public.carga;
create trigger t_carga_00_hereda_campana_dataset
  before insert or update of tenant_id, dataset_id, campana_id on public.carga
  for each row execute function public.tg_carga_hereda_campana_dataset();

comment on function public.tg_carga_hereda_campana_dataset() is
  'Deriva siempre la campaña desde el contenedor técnico de la carga para impedir asociaciones divergentes.';

-- El contenedor técnico y sus campos deben respetar exactamente los mismos
-- accesos por campaña. Antes, cualquier supervisor del tenant podía leer la
-- ficha de un dataset de otra campaña aunque no pudiera ver sus cargas.
drop policy if exists dataset_tenant_lectura on public.dataset;
create policy dataset_campana_lectura on public.dataset
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      (select public.es_admin())
      or campana_id in (select public.campanas_visibles())
    )
  );

drop policy if exists dataset_campo_lectura on public.dataset_campo;
create policy dataset_campo_campana_lectura on public.dataset_campo
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1
        from public.dataset d
       where d.id = dataset_campo.dataset_id
    )
  );

drop policy if exists carga_campana_visible on public.carga;
create policy carga_campana_visible on public.carga
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      (select public.es_admin())
      or campana_id in (select public.campanas_visibles())
    )
  );

drop policy if exists carga_campana_escritura on public.carga;
create policy carga_campana_escritura on public.carga
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      (select public.es_admin())
      or campana_id in (select public.campanas_visibles())
    )
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (
      (select public.es_admin())
      or campana_id in (select public.campanas_visibles())
    )
  );

-- Retira el flujo anterior que permitía reagrupar cargas en "bases" nuevas.
-- Las cargas ya quedan listas para análisis dentro de su campaña desde el
-- momento en que se registran.
revoke execute on function public.usar_cargas_en_dataset(uuid[], uuid, text)
  from authenticated;

revoke execute on function public.asignar_campana_dataset(uuid, uuid)
  from authenticated;
