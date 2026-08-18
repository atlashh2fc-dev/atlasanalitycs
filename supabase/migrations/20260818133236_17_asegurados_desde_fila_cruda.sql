-- ---------------------------------------------------------------------
-- 17 · Poblar venta_asegurado desde la fila original
-- ---------------------------------------------------------------------
-- El archivo de ventas trae a cada persona cubierta en columnas
-- "Datos Titular" y "Datos Beneficiario 1..8", con este formato:
--
--   id | rut | nombre | dd-mm-aaaa | preexistencias declaradas
--
-- Hasta ahora sólo se guardaba el conteo (n_asegurados). Sin las
-- personas no se puede calcular ni la tarifa por tramo etario ni el
-- catálogo de preexistencias, que son justamente lo que el mandante
-- paga y lo que hay que mostrarle.
--
-- El parseo vive sólo acá, en SQL, y la aplicación lo invoca. Tener dos
-- implementaciones de la misma lectura ya nos costó caro una vez.
-- ---------------------------------------------------------------------

create or replace function edad_a_fecha(p_nacimiento date, p_referencia date)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when p_nacimiento is null or p_referencia is null then null
    else extract(year from age(p_referencia, p_nacimiento))::int
  end;
$$;

comment on function edad_a_fecha is
  'Edad cumplida a una fecha de referencia. Se calcula a la fecha de la
   solicitud, no a hoy: la tarifa que se cobró depende de la edad que
   tenía la persona cuando se vendió.';

-- ---------------------------------------------------------------------
create or replace function poblar_asegurados_de_carga(p_carga_id uuid)
returns table (ventas_tocadas int, asegurados int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ventas int := 0;
  v_aseg   int := 0;
begin
  with cruda as (
    select
      f.datos,
      nullif(btrim(f.datos->>'Nro. Solicitud'), '') as nro_solicitud
    from fila_cruda f
    where f.carga_id = p_carga_id
      and f.datos ? 'Datos Titular'
  ),
  -- Una fila por persona: el titular en la posición 0 y cada
  -- beneficiario en la suya.
  personas as (
    select
      c.nro_solicitud,
      p.orden,
      btrim(p.crudo) as crudo
    from cruda c
    cross join lateral (
      values
        (0, c.datos->>'Datos Titular'),
        (1, c.datos->>'Datos Beneficiario 1'),
        (2, c.datos->>'Datos Beneficiario 2'),
        (3, c.datos->>'Datos Beneficiario 3'),
        (4, c.datos->>'Datos Beneficiario 4'),
        (5, c.datos->>'Datos Beneficiario 5'),
        (6, c.datos->>'Datos Beneficiario 6'),
        (7, c.datos->>'Datos Beneficiario 7'),
        (8, c.datos->>'Datos Beneficiario 8')
    ) as p(orden, crudo)
    where nullif(btrim(p.crudo), '') is not null
  ),
  partido as (
    select
      pe.nro_solicitud,
      pe.orden,
      normaliza_rut(split_part(pe.crudo, '|', 2))        as rut,
      btrim(split_part(pe.crudo, '|', 3))                as nombre,
      btrim(split_part(pe.crudo, '|', 4))                as fecha_texto,
      -- Lo que viene después del cuarto separador es la declaración de
      -- salud, que puede traer más separadores adentro.
      btrim(
        substring(
          pe.crudo
          from (length(split_part(pe.crudo, '|', 1)) +
                length(split_part(pe.crudo, '|', 2)) +
                length(split_part(pe.crudo, '|', 3)) +
                length(split_part(pe.crudo, '|', 4)) + 5)
        )
      ) as preexistencias
    from personas pe
  ),
  listo as (
    select
      v.tenant_id,
      v.id as venta_id,
      pa.orden,
      case when pa.orden = 0 then 'titular' else 'carga' end::parentesco as parentesco,
      nullif(pa.rut, '')    as rut,
      nullif(pa.nombre, '') as nombre,
      case
        when pa.fecha_texto ~ '^\d{1,2}-\d{1,2}-\d{4}$'
          then to_date(pa.fecha_texto, 'DD-MM-YYYY')
        else null
      end as fecha_nacimiento,
      nullif(pa.preexistencias, '') as preexistencias
    from partido pa
    join venta v
      on v.nro_solicitud = pa.nro_solicitud
  ),
  guardado as (
    insert into venta_asegurado
      (tenant_id, venta_id, orden, parentesco, rut, nombre, fecha_nacimiento, edad)
    select
      l.tenant_id, l.venta_id, l.orden, l.parentesco, l.rut, l.nombre,
      l.fecha_nacimiento,
      edad_a_fecha(l.fecha_nacimiento, v.fecha_solicitud::date)
    from listo l
    join venta v on v.id = l.venta_id
    on conflict (venta_id, orden) do update set
      parentesco       = excluded.parentesco,
      rut              = excluded.rut,
      nombre           = excluded.nombre,
      fecha_nacimiento = excluded.fecha_nacimiento,
      edad             = excluded.edad
    returning venta_id
  )
  select count(*)::int, count(distinct venta_id)::int
    into v_aseg, v_ventas
  from guardado;

  return query select v_ventas, v_aseg;
end;
$$;

comment on function poblar_asegurados_de_carga is
  'Lee las columnas de titular y beneficiarios de una carga de ventas y
   deja una fila por persona en venta_asegurado, con su edad calculada a
   la fecha de la solicitud.';;
