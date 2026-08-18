-- Una tarjeta de cifra necesita tres cosas: el total, la serie para el
-- sparkline y el mismo total del periodo anterior para el delta. Pedirlas
-- por separado son tres viajes; acá van en uno.
--
-- El periodo anterior es el bloque inmediatamente previo de la misma
-- duración: comparar agosto parcial contra julio completo daría un delta
-- falso y desmoralizante.
create or replace function consulta_kpi(
  p_fuente   text,
  p_metrica  text,
  p_desde    date,
  p_hasta    date,
  p_campana  uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_dias     int;
  v_actual   jsonb;
  v_anterior jsonb;
  v_serie    jsonb;
  v_gran     text;
begin
  v_dias := greatest((p_hasta - p_desde) + 1, 1);

  -- Con rangos largos el sparkline diario se vuelve ruido ilegible
  v_gran := case
              when v_dias > 180 then 'mes'
              when v_dias > 45  then 'semana'
              else 'dia'
            end;

  v_actual := consulta_widget(p_fuente, p_metrica, null, 'dia',
                              p_desde, p_hasta, p_campana);

  v_anterior := consulta_widget(p_fuente, p_metrica, null, 'dia',
                                p_desde - v_dias, p_desde - 1, p_campana);

  v_serie := consulta_widget(p_fuente, p_metrica, 'fecha', v_gran,
                             p_desde, p_hasta, p_campana, 400);

  return jsonb_build_object(
    'total',     v_actual->'total',
    'unidad',    v_actual->'unidad',
    'registros', v_actual->'registros',
    'anterior',  v_anterior->'total',
    'serie',     coalesce(v_serie->'filas', '[]'::jsonb),
    'granularidad', v_gran
  );
end;
$$;

revoke execute on function consulta_kpi from anon, public;
grant  execute on function consulta_kpi to authenticated;

comment on function consulta_kpi is
  'Total, serie para sparkline y total del periodo anterior de la misma duración, en un solo viaje.';;
