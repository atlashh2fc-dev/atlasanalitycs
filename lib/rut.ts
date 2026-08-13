/**
 * RUT chileno: normalización y validación módulo 11.
 *
 * Es la pieza que permite al perfilador identificar una columna de RUT
 * por su CONTENIDO, sin depender de cómo se llame. En los archivos
 * reales aparecieron columnas llamadas `dede` con datos útiles y
 * columnas de RUT con cinco nombres distintos.
 */

export function normalizaRut(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;

  const limpio = String(valor)
    .toUpperCase()
    .replace(/[^0-9K]/g, "");

  if (limpio.length < 2) return null;

  const cuerpo = limpio.slice(0, -1).replace(/^0+/, "");
  const dv = limpio.slice(-1);

  if (!/^\d+$/.test(cuerpo) || cuerpo.length === 0) return null;

  return `${cuerpo}-${dv}`;
}

export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

export function validaRut(valor: unknown): boolean {
  const norm = normalizaRut(valor);
  if (!norm) return false;

  const [cuerpo, dv] = norm.split("-");
  if (cuerpo.length > 9) return false;

  return dv === digitoVerificador(cuerpo);
}

export function formateaRut(rut: string | null): string {
  if (!rut) return "";
  const [cuerpo, dv] = rut.split("-");
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

/** Enmascara el cuerpo dejando visibles los últimos 3 dígitos y el DV. */
export function enmascaraRut(rut: string | null): string {
  if (!rut) return "";
  const [cuerpo, dv] = rut.split("-");
  if (cuerpo.length <= 3) return `${cuerpo}-${dv}`;
  return `${"•".repeat(cuerpo.length - 3)}${cuerpo.slice(-3)}-${dv}`;
}
