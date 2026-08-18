create or replace function cobertura_datos_campanas()
returns table (
  campana_id uuid,
  fuente text,
  ultima_fecha date,
  fecha_esperada date,
  dias_atraso integer
)
language sql stable security invoker set search_path = public
as $fn$
with esperado as (
  select max(d::date) as fecha
  from generate_series(current_date - 14, current_date, interval '1 day') d
  where extract(isodow from d) between 1 and 5
    and not exists (select 1 from feriado f where f.fecha = d::date)
),
fuentes(fuente) as (values ('ventas'), ('gestiones'), ('cotizaciones'), ('asistencia')),
ultimas as (
  select v.campana_id, 'ventas'::text fuente, max(v.fecha_solicitud)::date ultima_fecha
  from venta v where v.campana_id is not null group by v.campana_id
  union all
  select g.campana_id, 'gestiones', max(g.fecha)::date
  from gestion g where g.campana_id is not null group by g.campana_id
  union all
  select co.campana_id, 'cotizaciones', max(co.fecha)::date
  from cotizacion co where co.campana_id is not null group by co.campana_id
  union all
  select a.campana_id, 'asistencia', max(a.fecha)::date
  from asistencia a where a.campana_id is not null group by a.campana_id
)
select c.id, f.fuente, u.ultima_fecha, e.fecha,
  case
    when u.ultima_fecha is null then null
    else (
      select count(*)::integer
      from generate_series(u.ultima_fecha + 1, e.fecha, interval '1 day') d
      where extract(isodow from d) between 1 and 5
        and not exists (select 1 from feriado h where h.fecha = d::date)
    )
  end as dias_atraso
from campana c
cross join fuentes f
cross join esperado e
left join ultimas u on u.campana_id = c.id and u.fuente = f.fuente
where c.activo
order by c.nombre, array_position(array['ventas','gestiones','cotizaciones','asistencia'], f.fuente);
$fn$;

comment on function cobertura_datos_campanas is
  'Cobertura diaria por fuente y campaña contra el último día hábil esperado, excluyendo feriados configurados.';
