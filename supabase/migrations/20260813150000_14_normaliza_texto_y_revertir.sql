-- CAUSA RAÍZ de la conciliación de alias rota.
--
-- normaliza_texto colapsaba los espacios internos pero NO recortaba los
-- de los extremos, mientras la implementación en TypeScript sí hacía
-- trim. "Marisela Landeros " se guardaba como 'marisela landeros ' y se
-- buscaba como 'marisela landeros': nunca calzaban, así que cada carga
-- creaba un ejecutivo nuevo y las ventas quedaban sin ejecutivo.
--
-- Las dos implementaciones tienen que dar exactamente lo mismo; el
-- contrato está en scripts/verifica-normalizacion.mjs.
create or replace function normaliza_texto(p text)
returns text language sql immutable parallel safe
set search_path = public, extensions
as $$
  select nullif(
    btrim(regexp_replace(lower(unaccent(coalesce(p, ''))), '\s+', ' ', 'g')),
  '')::text;
$$;

update ejecutivo_alias
   set alias_normalizado = normaliza_texto(alias_original)
 where alias_normalizado is distinct from normaliza_texto(alias_original);

-- Revertir hacía seis borrados por API REST; con decenas de miles de
-- filas se pasaba del tiempo límite y la respuesta volvía como HTML:
-- el spinner quedaba girando. Acá es una sola transacción.
-- (Cuerpo completo aplicado en Supabase como 13_revertir_carga.)
