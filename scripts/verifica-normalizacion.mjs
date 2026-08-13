/**
 * Contrato entre las dos implementaciones de normaliza_texto.
 *
 * Existe una en SQL (usada por el trigger que guarda los alias) y otra
 * en TypeScript (usada al buscarlos). Si divergen, la conciliación de
 * ejecutivos se rompe en silencio: eso ya pasó una vez —la de SQL no
 * recortaba los espacios de los extremos— y dejó ventas sin ejecutivo.
 *
 * Los resultados esperados están tomados de la base real. Para
 * re-verificar el lado SQL:
 *
 *   select entrada, normaliza_texto(entrada) from (values ...) t(entrada);
 *
 * Uso:  node scripts/verifica-normalizacion.mjs
 */

// Espejo exacto de normalizaTexto() en lib/perfilador.ts
function normalizaTexto(v) {
  const s = String(v ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return s === "" ? null : s;
}

// entrada -> lo que devuelve normaliza_texto() en Postgres
const CONTRATO = [
  ["Marisela Landeros ", "marisela landeros"],
  ["Francisca  Valenzuela", "francisca valenzuela"],
  ["José Zuñiga", "jose zuniga"],
  ["  Ana  María  ", "ana maria"],
  ["MARÍA JOSÉ", "maria jose"],
  ["", null],
  ["   ", null],
  ["  ", null],
  ["Ñuñoa", "nunoa"],
  ["Isabel\tTarifeño", "isabel tarifeno"],
  ["Rut_Beneficiario", "rut_beneficiario"],
];

let fallas = 0;
for (const [entrada, esperado] of CONTRATO) {
  const obtenido = normalizaTexto(entrada);
  const bien = obtenido === esperado;
  if (!bien) fallas++;
  console.log(
    `${bien ? "OK  " : "FALLA"} ${JSON.stringify(entrada).padEnd(26)} ` +
      `TS=${JSON.stringify(obtenido).padEnd(24)} SQL=${JSON.stringify(esperado)}`,
  );
}

console.log(
  fallas === 0
    ? `\n${CONTRATO.length}/${CONTRATO.length} — las dos implementaciones coinciden.`
    : `\n${fallas} divergencias: la conciliación de alias se va a romper.`,
);
process.exit(fallas === 0 ? 0 : 1);
