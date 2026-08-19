import { extraeMatriz } from "@/lib/perfilador";

export const FUENTES_COBERTURA = [
  ["ventas", "Ventas"],
  ["gestiones", "Gestiones"],
  ["cotizaciones", "Cotizaciones"],
  ["asistencia", "Asistencia"],
] as const;

export type FuenteCobertura = (typeof FUENTES_COBERTURA)[number][0];

export const ETIQUETA_FUENTE: Record<FuenteCobertura, string> = Object.fromEntries(
  FUENTES_COBERTURA,
) as Record<FuenteCobertura, string>;

const ROL_FECHA: Record<Exclude<FuenteCobertura, "asistencia">, string> = {
  ventas: "fecha_venta",
  gestiones: "fecha_gestion",
  cotizaciones: "fecha_cotizacion",
};

export function esFuenteCobertura(valor: unknown): valor is FuenteCobertura {
  return FUENTES_COBERTURA.some(([clave]) => clave === valor);
}

export function fuenteDesdeRoles(
  modo: "tabular" | "matriz",
  roles: Iterable<string>,
): FuenteCobertura | null {
  if (modo === "matriz") return "asistencia";

  const disponibles = new Set(roles);
  if (
    disponibles.has("fecha_gestion") &&
    disponibles.has("tipificacion") &&
    disponibles.has("rut_cliente")
  ) {
    return "gestiones";
  }
  if (disponibles.has("fecha_venta") && disponibles.has("rut_cliente")) {
    return "ventas";
  }
  if (disponibles.has("fecha_cotizacion")) return "cotizaciones";
  return null;
}

function fechaISO(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  const texto = String(valor ?? "").trim();
  const ymd = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  const dmy = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return null;
}

export function validaArchivoContextual(
  matriz: unknown[][],
  config: {
    modo: "tabular" | "matriz";
    filaEncabezado: number;
    mapeo: Record<string, string>;
    fuenteEsperada: FuenteCobertura;
    fechaEsperada: string;
  },
): void {
  const fuenteDetectada = fuenteDesdeRoles(config.modo, Object.values(config.mapeo));
  if (fuenteDetectada !== config.fuenteEsperada) {
    if (!fuenteDetectada) {
      throw new Error(
        `No pudimos reconocer este archivo como ${ETIQUETA_FUENTE[config.fuenteEsperada]}. Revisa que sea el export correcto.`,
      );
    }
    throw new Error(
      `Este archivo corresponde a ${ETIQUETA_FUENTE[fuenteDetectada]}, no a ${ETIQUETA_FUENTE[config.fuenteEsperada]}.`,
    );
  }

  if (config.modo === "matriz") {
    const fechas = extraeMatriz(matriz, config.filaEncabezado).filas;
    if (!fechas.some((fila) => fila.fecha === config.fechaEsperada)) {
      throw new Error(
        `La planilla de asistencia no contiene el día ${config.fechaEsperada}.`,
      );
    }
    return;
  }

  const rolFecha = ROL_FECHA[config.fuenteEsperada as Exclude<FuenteCobertura, "asistencia">];
  const columna = Object.entries(config.mapeo).find(([, rol]) => rol === rolFecha)?.[0];
  const encabezado = matriz[config.filaEncabezado] ?? [];
  const posicion = encabezado.findIndex((valor) => String(valor ?? "").trim() === columna);
  const contieneFecha = posicion >= 0 && matriz
    .slice(config.filaEncabezado + 1)
    .some((fila) => fechaISO(fila?.[posicion]) === config.fechaEsperada);

  if (!contieneFecha) {
    throw new Error(
      `El archivo de ${ETIQUETA_FUENTE[config.fuenteEsperada]} no contiene el día ${config.fechaEsperada}.`,
    );
  }
}
