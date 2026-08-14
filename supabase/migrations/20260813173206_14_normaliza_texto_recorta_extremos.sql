-- CAUSA RAÍZ de la conciliación de alias rota.
--
-- normaliza_texto colapsaba los espacios internos con regexp_replace
-- pero NO recortaba los de los extremos, mientras la implementación en
-- TypeScript sí hacía trim. "Marisela Landeros " se guardaba como alias
-- 'marisela landeros ' y se buscaba como 'marisela landeros': nunca
-- calzaban, así que cada carga creaba un ejecutivo nuevo y las ventas
-- quedaban repartidas entre duplicados.
--
-- Las dos implementaciones tienen que dar exactamente lo mismo.
create or replace function normaliza_texto(p text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select nullif(
    btrim(regexp_replace(lower(unaccent(coalesce(p, ''))), '\s+', ' ', 'g')),
  '')::text;
$$;

comment on function normaliza_texto is
  'Minúsculas, sin tildes, espacios colapsados Y RECORTADOS. Debe coincidir exactamente con normalizaTexto() de lib/perfilador.ts.';

-- Re-normaliza los alias ya guardados con la versión defectuosa
update ejecutivo_alias
   set alias_normalizado = normaliza_texto(alias_original)
 where alias_normalizado is distinct from normaliza_texto(alias_original);;
