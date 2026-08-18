-- Una planilla puede contener encabezados distintos que convergen a la misma
-- clave normalizada. PostgreSQL no permite que un mismo INSERT ... ON CONFLICT
-- actualice dos veces la misma fila, así que elegimos un representante estable
-- antes del upsert y luego enlazamos todas las columnas equivalentes.
create or replace function public.sincronizar_campos_dataset(p_carga uuid)
returns int
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_dataset uuid;
  v_tenant uuid;
  v_total int;
begin
  select c.dataset_id, c.tenant_id into v_dataset, v_tenant
    from public.carga c
   where c.id = p_carga;

  if v_dataset is null then
    raise exception 'La carga no tiene un dataset asociado.';
  end if;

  with perfil as (
    select
      cc.*,
      coalesce(nullif(cc.nombre_normalizado, ''), 'columna_' || cc.posicion) as clave_dataset,
      row_number() over (
        partition by coalesce(nullif(cc.nombre_normalizado, ''), 'columna_' || cc.posicion)
        order by cc.descartada asc, cc.confianza desc nulls last, cc.posicion asc
      ) as preferencia
    from public.carga_columna cc
    where cc.carga_id = p_carga
  )
  insert into public.dataset_campo
    (tenant_id, dataset_id, clave, nombre, tipo, rol, agregacion, orden)
  select v_tenant,
         v_dataset,
         p.clave_dataset,
         coalesce(nullif(p.nombre_original, ''), 'Columna ' || p.posicion),
         p.tipo_detectado,
         case
           when p.descartada then 'ignorado'
           when p.rol_semantico = 'metrica' then 'metrica'
           when p.rol_semantico = 'dimension' then 'dimension'
           when p.tipo_detectado = 'fecha' then 'fecha'
           when p.tipo_detectado in ('entero', 'decimal', 'monto', 'uf', 'duracion') then 'metrica'
           when p.tipo_detectado in ('rut', 'email', 'telefono') then 'identificador'
           else 'dimension'
         end,
         case
           when p.descartada then null
           when p.rol_semantico = 'metrica'
             or p.tipo_detectado in ('entero', 'decimal', 'monto', 'uf') then 'sum'
           when p.tipo_detectado = 'duracion' then 'avg'
           when p.tipo_detectado in ('rut', 'email', 'telefono') then 'count_distinct'
           else null
         end,
         p.posicion
    from perfil p
   where p.preferencia = 1
  on conflict (dataset_id, clave) do update
    set nombre = excluded.nombre,
        tipo = case
          when dataset_campo.tipo = 'desconocido' then excluded.tipo
          else dataset_campo.tipo
        end,
        updated_at = now();

  update public.carga_columna cc
     set dataset_campo_id = dc.id
    from public.dataset_campo dc
   where cc.carga_id = p_carga
     and dc.dataset_id = v_dataset
     and dc.clave = coalesce(
       nullif(cc.nombre_normalizado, ''),
       'columna_' || cc.posicion
     );

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function public.sincronizar_campos_dataset(uuid)
  from public, anon;
grant execute on function public.sincronizar_campos_dataset(uuid)
  to authenticated;
;
