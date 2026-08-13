/**
 * Perfilador de columnas.
 *
 * Regla de diseño: se clasifica por CONTENIDO, no por nombre de columna.
 * Los archivos reales tenían columnas llamadas `dede`, `deded` y `DEDED`
 * que contenían el tramo etario, y la columna de RUT aparecía con cinco
 * nombres distintos entre hojas. Un perfilador que confíe en el
 * encabezado bota datos útiles y se cae cada mes.
 *
 * El nombre sólo se usa DESPUÉS, como desempate, vía el diccionario de
 * sinónimos que aprende de cada mapeo confirmado.
 */

import { validaRut } from "./rut";

export type TipoColumna =
  | "rut"
  | "fecha"
  | "hora"
  | "duracion"
  | "monto"
  | "uf"
  | "telefono"
  | "email"
  | "entero"
  | "decimal"
  | "booleano"
  | "categoria"
  | "texto"
  | "desconocido";

export interface PerfilColumna {
  posicion: number;
  nombreOriginal: string;
  nombreNormalizado: string;
  tipo: TipoColumna;
  confianza: number;
  rolSugerido: string | null;
  filas: number;
  nulos: number;
  cardinalidad: number;
  varianzaCero: boolean;
  descartada: boolean;
  motivoDescarte: string | null;
  muestra: string[];
}

export interface PerfilHoja {
  hoja: string;
  filaEncabezado: number;
  modo: "tabular" | "matriz";
  filas: number;
  columnas: PerfilColumna[];
  puntaje: number;
  metadatos: Record<string, string | number>;
}

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

export function normalizaTexto(v: unknown): string {
  return String(v ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizaNombreColumna(v: unknown): string {
  return normalizaTexto(v)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/* ------------------------------------------------------------------ */
/* Detectores por contenido                                            */
/* ------------------------------------------------------------------ */

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_FECHA = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/;
const RE_HORA = /^\d{1,2}:\d{2}(:\d{2})?$/;
const RE_SOLO_DIGITOS = /^\d+$/;

const VERDADEROS = new Set(["si", "sí", "true", "1", "verdadero", "x"]);
const FALSOS = new Set(["no", "false", "0", "falso"]);

function esFecha(v: unknown): boolean {
  if (v instanceof Date) return !isNaN(v.getTime());
  const s = String(v).trim();
  return RE_FECHA.test(s);
}

function esTelefono(v: unknown): boolean {
  const d = String(v).replace(/[^0-9]/g, "");
  if (!RE_SOLO_DIGITOS.test(String(v).replace(/[\s+()-]/g, ""))) return false;
  // Chile: 8 (fijo sin código), 9 (móvil), 11 (56 + móvil)
  return d.length === 8 || d.length === 9 || d.length === 11;
}

function esNumero(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  return s !== "" && !isNaN(Number(s));
}

function aNumero(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(String(v).trim().replace(/\./g, "").replace(",", "."));
}

/** Proporción de valores no nulos que cumplen el predicado. */
function tasa(valores: unknown[], pred: (v: unknown) => boolean): number {
  if (valores.length === 0) return 0;
  return valores.filter(pred).length / valores.length;
}

const UMBRAL = 0.9;

export function detectaTipo(valores: unknown[]): {
  tipo: TipoColumna;
  confianza: number;
} {
  const v = valores.filter((x) => x !== null && x !== undefined && String(x).trim() !== "");
  if (v.length === 0) return { tipo: "desconocido", confianza: 0 };

  // RUT primero: es el detector más específico y define la llave maestra
  const tRut = tasa(v, validaRut);
  if (tRut >= UMBRAL) return { tipo: "rut", confianza: tRut };

  const tEmail = tasa(v, (x) => RE_EMAIL.test(String(x).trim()));
  if (tEmail >= UMBRAL) return { tipo: "email", confianza: tEmail };

  const tFecha = tasa(v, esFecha);
  if (tFecha >= UMBRAL) return { tipo: "fecha", confianza: tFecha };

  const tHora = tasa(v, (x) => RE_HORA.test(String(x).trim()));
  if (tHora >= UMBRAL) return { tipo: "hora", confianza: tHora };

  const tTel = tasa(v, esTelefono);
  if (tTel >= UMBRAL) return { tipo: "telefono", confianza: tTel };

  const bool = tasa(v, (x) => {
    const s = normalizaTexto(x);
    return VERDADEROS.has(s) || FALSOS.has(s);
  });
  if (bool >= UMBRAL) return { tipo: "booleano", confianza: bool };

  const tNum = tasa(v, esNumero);
  if (tNum >= UMBRAL) {
    const nums = v.filter(esNumero).map(aNumero);
    const todosEnteros = nums.every((n) => Number.isInteger(n));
    if (todosEnteros) {
      const max = Math.max(...nums.map(Math.abs));
      // montos en pesos: enteros grandes
      if (max > 100000) return { tipo: "monto", confianza: tNum };
      return { tipo: "entero", confianza: tNum };
    }
    const max = Math.max(...nums.map(Math.abs));
    // UF: decimales pequeños; monto: decimales grandes
    if (max < 5000) return { tipo: "uf", confianza: tNum * 0.85 };
    return { tipo: "monto", confianza: tNum };
  }

  const unicos = new Set(v.map((x) => normalizaTexto(x)));
  const ratio = unicos.size / v.length;
  if (unicos.size <= 50 && ratio < 0.5) {
    return { tipo: "categoria", confianza: 1 - ratio };
  }

  return { tipo: "texto", confianza: 0.5 };
}

/* ------------------------------------------------------------------ */
/* Roles semánticos                                                    */
/* ------------------------------------------------------------------ */

/**
 * Diccionario base. Se complementa en runtime con la tabla
 * `sinonimo_columna`, que aprende de cada mapeo que un humano confirma.
 */
const SINONIMOS: Record<string, string> = {
  rut_beneficiario: "rut_cliente",
  rut_contratante: "rut_cliente",
  rut: "rut_cliente",
  rut_pagador: "rut_pagador",
  paciente: "nombre_cliente",
  nombre_contratante: "nombre_cliente",
  nombre_cotizante: "nombre_cliente",
  e_mail_paciente: "email_cliente",
  email_contratante: "email_cliente",
  email_cotizante: "email_cliente",
  tel_principal_paciente: "telefono_cliente",
  telefono_contratante: "telefono_cliente",
  telefono_cotizante: "telefono_cliente",
  fecha_solicitud: "fecha_venta",
  fecha_cotizacion: "fecha_cotizacion",
  ultima_agenda: "fecha_agenda",
  agenda: "fecha_agenda",
  ejecutivo_venta: "ejecutivo",
  usuario: "ejecutivo",
  plan: "producto",
  producto_cotizado: "producto",
  numero_beneficiarios: "n_asegurados",
  precio_uf: "monto_uf",
  precio: "monto_clp",
  presentado: "presentado",
  especialidad: "especialidad",
  centro: "centro",
  area: "area",
  area_1: "area",
  prevision: "prevision",
  sistema_salud: "prevision",
  sistema_salud_cotizante: "prevision",
  edad_beneficiario: "edad",
  cluster: "cluster",
  equipo: "equipo",
};

/** Roles que se pueden inferir sólo del tipo, sin mirar el nombre. */
const ROL_POR_TIPO: Partial<Record<TipoColumna, string>> = {
  rut: "rut_cliente",
  email: "email_cliente",
  telefono: "telefono_cliente",
};

function sugiereRol(
  nombreNorm: string,
  tipo: TipoColumna,
  valores: unknown[],
  extra: Record<string, string> = {},
): string | null {
  const dicc = { ...SINONIMOS, ...extra };
  if (dicc[nombreNorm]) return dicc[nombreNorm];

  // Contenido de tramo etario, sin importar el nombre de la columna.
  // Caso real: columnas 'dede' / 'deded' / 'DEDED'.
  if (tipo === "categoria") {
    const muestra = new Set(valores.slice(0, 200).map(normalizaTexto));
    const patronTramo = /^(\d{2}[-_]\d{2}|mde|\d{2}\+)$/;
    const coinciden = [...muestra].filter((s) => patronTramo.test(s)).length;
    if (muestra.size > 0 && coinciden / muestra.size > 0.6) return "tramo_etario";
  }

  return ROL_POR_TIPO[tipo] ?? null;
}

/* ------------------------------------------------------------------ */
/* Perfilado de una hoja                                               */
/* ------------------------------------------------------------------ */

/**
 * Busca la fila de encabezado: la primera con al menos 3 celdas de texto
 * no vacías y sin repetidos. Las planillas reales traían el encabezado
 * en la fila 3, con títulos y celdas combinadas encima.
 */
export function detectaFilaEncabezado(matriz: unknown[][]): number {
  const limite = Math.min(10, matriz.length);
  let mejor = 0;
  let mejorPuntaje = -1;

  for (let i = 0; i < limite; i++) {
    const fila = matriz[i] ?? [];
    const textos = fila.filter(
      (c) => typeof c === "string" && c.trim() !== "" && !/^unnamed/i.test(c),
    );
    const unicos = new Set(textos.map(normalizaTexto));
    const puntaje = unicos.size === textos.length ? textos.length : textos.length - 2;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = i;
    }
  }

  return mejor;
}

/**
 * Detecta el formato matriz (entidades en filas, fechas en columnas).
 *
 * Encontrar varias fechas en una fila NO basta: la primera fila de datos
 * de una tabla de ventas trae fecha de solicitud, de nacimiento, de pago
 * y de vigencia, y eso la haría pasar por encabezado de planilla. Ese
 * falso positivo corrompe el parseo entero, porque se toma una fila de
 * datos como encabezado.
 *
 * Se exigen tres condiciones juntas:
 *   1. Las fechas dominan la fila (más de la mitad de las celdas con
 *      contenido).
 *   2. Las MISMAS columnas, en las filas de abajo, no son fechas. Si lo
 *      son, es una columna de fechas de una tabla normal.
 *   3. Las fechas avanzan en el tiempo de izquierda a derecha, en saltos
 *      de días. Una fecha de nacimiento de 1984 junto a uno de 2026 no
 *      es una cabecera de calendario.
 */
export function detectaMatriz(matriz: unknown[][]): {
  esMatriz: boolean;
  filaFechas: number;
} {
  const limite = Math.min(8, matriz.length);

  for (let i = 0; i < limite; i++) {
    const fila = matriz[i] ?? [];

    const columnasFecha: number[] = [];
    fila.forEach((c, j) => {
      if (c instanceof Date || esFecha(c)) columnasFecha.push(j);
    });
    if (columnasFecha.length < 4) continue;

    // 1. las fechas tienen que dominar la fila
    const conContenido = fila.filter(
      (c) => c !== null && c !== undefined && String(c).trim() !== "",
    ).length;
    if (conContenido === 0) continue;
    if (columnasFecha.length / conContenido < 0.5) continue;

    // 2. abajo de una cabecera de calendario van marcas, no más fechas
    const siguientes = matriz.slice(i + 1, i + 4);
    if (siguientes.length > 0) {
      let celdas = 0;
      let fechasAbajo = 0;
      for (const f of siguientes) {
        for (const j of columnasFecha) {
          const v = f?.[j];
          if (v === null || v === undefined || String(v).trim() === "") continue;
          celdas++;
          if (v instanceof Date || esFecha(v)) fechasAbajo++;
        }
      }
      if (celdas > 0 && fechasAbajo / celdas > 0.3) continue;
    }

    // 3. calendario: creciente y en saltos de días, no de años
    const fechas = columnasFecha
      .map((j) => {
        const v = fila[j];
        return v instanceof Date ? v : new Date(String(v));
      })
      .filter((d) => !isNaN(d.getTime()));

    if (fechas.length < 4) continue;

    const DIA = 86_400_000;
    let calendario = true;
    for (let k = 1; k < fechas.length; k++) {
      const delta = (fechas[k].getTime() - fechas[k - 1].getTime()) / DIA;
      if (delta <= 0 || delta > 7) {
        calendario = false;
        break;
      }
    }
    if (!calendario) continue;

    return { esMatriz: true, filaFechas: i };
  }

  return { esMatriz: false, filaFechas: -1 };
}

export function perfilaHoja(
  hoja: string,
  matriz: unknown[][],
  sinonimosExtra: Record<string, string> = {},
  forzar?: { modo?: "tabular" | "matriz"; filaEncabezado?: number },
): PerfilHoja {
  const deteccion = detectaMatriz(matriz);
  const esMatriz = forzar?.modo ? forzar.modo === "matriz" : deteccion.esMatriz;

  const filaEncabezado =
    forzar?.filaEncabezado !== undefined
      ? forzar.filaEncabezado
      : esMatriz && deteccion.filaFechas >= 0
        ? deteccion.filaFechas
        : detectaFilaEncabezado(matriz);

  const encabezado = (matriz[filaEncabezado] ?? []).map((c, i) =>
    typeof c === "string" && c.trim() !== "" ? c.trim() : `columna_${i + 1}`,
  );
  const cuerpo = matriz.slice(filaEncabezado + 1).filter((f) => f.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));

  const columnas: PerfilColumna[] = encabezado.map((nombre, i) => {
    const valores = cuerpo.map((f) => f[i]);
    const noNulos = valores.filter(
      (x) => x !== null && x !== undefined && String(x).trim() !== "",
    );
    const unicos = new Set(noNulos.map((x) => normalizaTexto(x)));
    const { tipo, confianza } = detectaTipo(valores);
    const nombreNormalizado = normalizaNombreColumna(nombre);

    const varianzaCero = noNulos.length > 0 && unicos.size === 1;
    const vacia = noNulos.length === 0;

    return {
      posicion: i,
      nombreOriginal: String(nombre),
      nombreNormalizado,
      tipo,
      confianza: Number(confianza.toFixed(3)),
      rolSugerido: sugiereRol(nombreNormalizado, tipo, noNulos, sinonimosExtra),
      filas: valores.length,
      nulos: valores.length - noNulos.length,
      cardinalidad: unicos.size,
      varianzaCero,
      descartada: vacia || varianzaCero,
      motivoDescarte: vacia
        ? "columna vacía"
        : varianzaCero
          ? "un solo valor distinto en toda la columna"
          : null,
      muestra: [...unicos].slice(0, 5).map((s) => s.slice(0, 40)),
    };
  });

  const utiles = columnas.filter((c) => !c.descartada).length;

  return {
    hoja,
    filaEncabezado,
    modo: esMatriz ? "matriz" : "tabular",
    filas: cuerpo.length,
    columnas,
    // Puntaje para ordenar hojas: las residuales (Hoja3, Hoja4) quedan al final
    puntaje: cuerpo.length > 0 ? utiles * Math.log10(cuerpo.length + 10) : 0,
    metadatos: metadatosDesdeNombre(hoja),
  };
}

/**
 * Los nombres de hoja cargan información: "CM 5" y "Onco 13" codifican
 * línea de negocio y día de carga. Se captura como metadato en vez de
 * perderse.
 */
export function metadatosDesdeNombre(nombre: string): Record<string, string | number> {
  const meta: Record<string, string | number> = {};
  const n = normalizaTexto(nombre);

  const linea = n.match(/\b(cm|onco|oncologico|complementario|catastrofico)\b/);
  if (linea) meta.linea = linea[1].toUpperCase();

  const numero = n.match(/\b(\d{1,2})\b/);
  if (numero) meta.dia = Number(numero[1]);

  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const mes = meses.findIndex((m) => n.includes(m));
  if (mes >= 0) meta.mes = mes + 1;

  return meta;
}

/* ------------------------------------------------------------------ */
/* Unpivot de planillas                                                */
/* ------------------------------------------------------------------ */

export interface FilaMatriz {
  entidad: string;
  fecha: string;
  marca: string;
  jornada: number | null;
}

/**
 * Marcas de asistencia. Las planillas reales usaban dos convenciones en
 * el mismo archivo: letras en las hojas mensuales (P presente, A
 * ausente, V vacaciones, L licencia, B baja) y números en la hoja de
 * ranking (1 = trabajó, a = ausente). Se aceptan las dos.
 */
const MARCAS: Record<string, string> = {
  p: "P", presente: "P", "1": "P", si: "P", x: "P",
  a: "A", ausente: "A", falta: "A", "0": "A",
  v: "V", vacaciones: "V",
  l: "L", licencia: "L",
  b: "B", baja: "B",
  f: "F", feriado: "F",
  s: "S", sabado: "S",
};

export function normalizaMarca(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = normalizaTexto(v);
  if (s === "") return null;
  return MARCAS[s] ?? null;
}

/**
 * Convierte una hoja en formato planilla a formato largo.
 *
 * La cabecera trae las fechas en columnas y cada fila es una persona.
 * Se devuelve un registro por par (persona, fecha), que es lo que la
 * base necesita para calcular días gestionados.
 */
export function extraeMatriz(
  matriz: unknown[][],
  filaFechas: number,
  columnaEntidadForzada?: number,
): {
  columnaEntidad: number;
  columnaJornada: number | null;
  columnasFecha: number[];
  filas: FilaMatriz[];
  marcasDesconocidas: string[];
} {
  const cabecera = matriz[filaFechas] ?? [];

  const columnasFecha: number[] = [];
  cabecera.forEach((c, j) => {
    if (c instanceof Date) columnasFecha.push(j);
    else if (typeof c === "string" && esFecha(c)) columnasFecha.push(j);
  });

  const cuerpo = matriz.slice(filaFechas + 1);
  const primeraFecha = columnasFecha.length > 0 ? Math.min(...columnasFecha) : cabecera.length;

  // La columna de la persona es, entre las que están a la izquierda de
  // las fechas, la que trae más texto largo: la otra suele ser la
  // jornada ("42 hrs") o un número de orden.
  let columnaEntidad = columnaEntidadForzada ?? 0;
  if (columnaEntidadForzada === undefined) {
    let mejor = -1;
    for (let j = 0; j < primeraFecha; j++) {
      const puntaje = cuerpo.filter((f) => {
        const v = f?.[j];
        return typeof v === "string" && v.trim().length > 4 && !/hrs?\b/i.test(v);
      }).length;
      if (puntaje > mejor) {
        mejor = puntaje;
        columnaEntidad = j;
      }
    }
  }

  let columnaJornada: number | null = null;
  for (let j = 0; j < primeraFecha; j++) {
    const tiene = cuerpo.some(
      (f) => typeof f?.[j] === "string" && /\d+\s*hrs?\b/i.test(String(f[j])),
    );
    if (tiene) {
      columnaJornada = j;
      break;
    }
  }

  // Un mismo par persona+fecha puede venir dos veces si la planilla
  // repite el bloque más abajo. Gana el último.
  const porClave = new Map<string, FilaMatriz>();
  const desconocidas = new Set<string>();

  for (const f of cuerpo) {
    const entidad = f?.[columnaEntidad];
    if (typeof entidad !== "string" || entidad.trim() === "") continue;

    let jornada: number | null = null;
    if (columnaJornada !== null) {
      const m = String(f[columnaJornada] ?? "").match(/(\d+(?:[.,]\d+)?)\s*hrs?\b/i);
      if (m) jornada = Number(m[1].replace(",", "."));
    }

    for (const j of columnasFecha) {
      const bruta = f?.[j];
      if (bruta === null || bruta === undefined || String(bruta).trim() === "") continue;

      // Las planillas repiten el bloque de cabecera más abajo. Esas
      // celdas son fechas, no marcas mal escritas: se saltan calladas.
      if (bruta instanceof Date || esFecha(bruta)) continue;

      const marca = normalizaMarca(bruta);
      if (!marca) {
        desconocidas.add(String(bruta).slice(0, 12));
        continue;
      }

      const celda = cabecera[j];
      const fecha = celda instanceof Date ? celda : new Date(String(celda));
      if (isNaN(fecha.getTime())) continue;

      porClave.set(`${entidad.replace(/\s+/g, " ").trim()}|${fecha.toISOString().slice(0, 10)}`, {
        entidad: entidad.replace(/\s+/g, " ").trim(),
        fecha: fecha.toISOString().slice(0, 10),
        marca,
        jornada,
      });
    }
  }

  const filas = [...porClave.values()];

  return {
    columnaEntidad,
    columnaJornada,
    columnasFecha,
    filas,
    marcasDesconocidas: [...desconocidas].slice(0, 8),
  };
}
