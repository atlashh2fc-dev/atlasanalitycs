/**
 * Catálogo de tarjetas.
 *
 * Define qué puede visualizar el usuario en función de lo que cargó.
 * El catálogo es declarativo y lo comparten el asistente de creación
 * (navegador) y el motor de consulta (servidor), así que no hay forma de
 * que ofrezcan cosas distintas.
 */

export type TipoWidget =
  | "kpi"
  | "barras"
  | "barras_horizontal"
  | "lineas"
  | "area"
  | "dona"
  | "tabla"
  | "dispersion";

export type Fuente =
  | "venta"
  | "cotizacion"
  | "agendamiento"
  | "asistencia"
  | "cliente";

export type Agregacion = "suma" | "conteo" | "promedio" | "distintos" | "razon";

export interface Metrica {
  clave: string;
  nombre: string;
  agregacion: Agregacion;
  campo?: string;
  /** para razones: campo del numerador filtrado */
  filtro?: { campo: string; valor: unknown };
  unidad?: "entero" | "decimal" | "uf" | "clp" | "porcentaje";
  descripcion?: string;
}

export interface Dimension {
  clave: string;
  nombre: string;
  /** ruta al valor dentro de la fila devuelta por Supabase */
  campo: string;
  temporal?: boolean;
}

export interface DefinicionFuente {
  clave: Fuente;
  nombre: string;
  descripcion: string;
  tabla: string;
  select: string;
  campoFecha: string;
  metricas: Metrica[];
  dimensiones: Dimension[];
}

export const FUENTES: DefinicionFuente[] = [
  {
    clave: "venta",
    nombre: "Ventas",
    descripcion: "Contratos cerrados, asegurados y UF.",
    tabla: "venta",
    campoFecha: "fecha_solicitud",
    select:
      "id, fecha_solicitud, n_asegurados, precio_uf, precio_clp, cobertura, medio_pago, canal, campana_id, " +
      "ejecutivo:ejecutivo_id (nombre_canonico), producto:producto_id (nombre, linea, agrupacion_meta)",
    metricas: [
      {
        clave: "asegurados",
        nombre: "Asegurados",
        agregacion: "suma",
        campo: "n_asegurados",
        unidad: "entero",
        descripcion: "Titular más cargas. Es la unidad de la meta.",
      },
      { clave: "contratos", nombre: "Contratos", agregacion: "conteo", unidad: "entero" },
      { clave: "uf", nombre: "UF vendida", agregacion: "suma", campo: "precio_uf", unidad: "uf" },
      { clave: "monto", nombre: "Monto en pesos", agregacion: "suma", campo: "precio_clp", unidad: "clp" },
      {
        clave: "ticket",
        nombre: "Ticket promedio (UF)",
        agregacion: "promedio",
        campo: "precio_uf",
        unidad: "uf",
      },
      {
        clave: "profundidad",
        nombre: "Asegurados por contrato",
        agregacion: "promedio",
        campo: "n_asegurados",
        unidad: "decimal",
        descripcion: "Cuánta familia entra en cada venta.",
      },
    ],
    dimensiones: [
      { clave: "ejecutivo", nombre: "Ejecutivo", campo: "ejecutivo.nombre_canonico" },
      { clave: "producto", nombre: "Producto", campo: "producto.nombre" },
      { clave: "linea", nombre: "Línea", campo: "producto.linea" },
      { clave: "agrupacion", nombre: "Agrupación de meta", campo: "producto.agrupacion_meta" },
      { clave: "cobertura", nombre: "Cobertura", campo: "cobertura" },
      { clave: "medio_pago", nombre: "Medio de pago", campo: "medio_pago" },
      { clave: "canal", nombre: "Canal", campo: "canal" },
      { clave: "fecha", nombre: "Fecha de venta", campo: "fecha_solicitud", temporal: true },
    ],
  },
  {
    clave: "cotizacion",
    nombre: "Cotizaciones",
    descripcion: "Todo lo que se cotizó, haya cerrado o no.",
    tabla: "cotizacion",
    campoFecha: "fecha",
    select:
      "id, fecha, precio_uf, precio_clp, sistema_salud, procedencia_lead, campana_id, " +
      "ejecutivo:ejecutivo_id (nombre_canonico), producto:producto_id (nombre, agrupacion_meta)",
    metricas: [
      { clave: "cotizaciones", nombre: "Cotizaciones", agregacion: "conteo", unidad: "entero" },
      { clave: "uf", nombre: "UF cotizada", agregacion: "suma", campo: "precio_uf", unidad: "uf" },
      { clave: "ticket", nombre: "Precio promedio (UF)", agregacion: "promedio", campo: "precio_uf", unidad: "uf" },
    ],
    dimensiones: [
      { clave: "ejecutivo", nombre: "Ejecutivo", campo: "ejecutivo.nombre_canonico" },
      { clave: "producto", nombre: "Producto", campo: "producto.nombre" },
      { clave: "sistema_salud", nombre: "Sistema de salud", campo: "sistema_salud" },
      { clave: "procedencia", nombre: "Procedencia del lead", campo: "procedencia_lead" },
      { clave: "fecha", nombre: "Fecha de cotización", campo: "fecha", temporal: true },
    ],
  },
  {
    clave: "agendamiento",
    nombre: "Agendamiento",
    descripcion: "Base UCC: horas agendadas y presentación.",
    tabla: "agendamiento",
    campoFecha: "fecha_agenda",
    select:
      "id, fecha_agenda, presentado, centro, area, especialidad, prevision, equipo, linea, cluster, campana_id",
    metricas: [
      { clave: "registros", nombre: "Registros", agregacion: "conteo", unidad: "entero" },
      {
        clave: "presentados",
        nombre: "Presentados",
        agregacion: "conteo",
        filtro: { campo: "presentado", valor: true },
        unidad: "entero",
      },
      {
        clave: "tasa_presentacion",
        nombre: "Tasa de presentación",
        agregacion: "razon",
        filtro: { campo: "presentado", valor: true },
        unidad: "porcentaje",
        descripcion: "Presentados sobre agendados.",
      },
    ],
    dimensiones: [
      { clave: "centro", nombre: "Centro", campo: "centro" },
      { clave: "area", nombre: "Área", campo: "area" },
      { clave: "especialidad", nombre: "Especialidad", campo: "especialidad" },
      { clave: "prevision", nombre: "Previsión", campo: "prevision" },
      { clave: "equipo", nombre: "Equipo", campo: "equipo" },
      { clave: "linea", nombre: "Línea", campo: "linea" },
      { clave: "cluster", nombre: "Clúster", campo: "cluster" },
      { clave: "fecha", nombre: "Fecha de agenda", campo: "fecha_agenda", temporal: true },
    ],
  },
  {
    clave: "asistencia",
    nombre: "Asistencia",
    descripcion: "Días trabajados por ejecutivo. Alimenta el IP-D.",
    tabla: "asistencia",
    campoFecha: "fecha",
    select:
      "id, fecha, marca, jornada_horas, campana_id, ejecutivo:ejecutivo_id (nombre_canonico)",
    metricas: [
      {
        clave: "dias_gestionados",
        nombre: "Días gestionados",
        agregacion: "conteo",
        filtro: { campo: "marca", valor: "P" },
        unidad: "entero",
        descripcion: "Sólo los días presentes.",
      },
      { clave: "dias_registrados", nombre: "Días registrados", agregacion: "conteo", unidad: "entero" },
      {
        clave: "adherencia",
        nombre: "Adherencia",
        agregacion: "razon",
        filtro: { campo: "marca", valor: "P" },
        unidad: "porcentaje",
        descripcion: "Días presentes sobre días registrados.",
      },
      { clave: "jornada", nombre: "Jornada promedio", agregacion: "promedio", campo: "jornada_horas", unidad: "decimal" },
    ],
    dimensiones: [
      { clave: "ejecutivo", nombre: "Ejecutivo", campo: "ejecutivo.nombre_canonico" },
      { clave: "marca", nombre: "Tipo de marca", campo: "marca" },
      { clave: "fecha", nombre: "Fecha", campo: "fecha", temporal: true },
    ],
  },
  {
    clave: "cliente",
    nombre: "Clientes",
    descripcion: "Personas contactadas, por RUT único.",
    tabla: "cliente",
    campoFecha: "created_at",
    select: "id, region, comuna, prevision, sexo, tramo_etario, edad, created_at",
    metricas: [
      { clave: "clientes", nombre: "Clientes", agregacion: "conteo", unidad: "entero" },
      { clave: "edad", nombre: "Edad promedio", agregacion: "promedio", campo: "edad", unidad: "decimal" },
    ],
    dimensiones: [
      { clave: "region", nombre: "Región", campo: "region" },
      { clave: "prevision", nombre: "Previsión", campo: "prevision" },
      { clave: "sexo", nombre: "Sexo", campo: "sexo" },
      { clave: "tramo", nombre: "Tramo etario", campo: "tramo_etario" },
    ],
  },
];

export function getFuente(clave: string): DefinicionFuente | undefined {
  return FUENTES.find((f) => f.clave === clave);
}

export type Granularidad = "dia" | "semana" | "mes";

export interface ConfigWidget {
  fuente: Fuente;
  metrica: string;
  dimension?: string;
  granularidad?: Granularidad;
  limite?: number;
  orden?: "desc" | "asc";
  objetivo?: number;
  comparar?: string;
}

export interface FilaResultado {
  clave: string;
  valor: number;
  secundario?: number;
}

export interface Resultado {
  filas: FilaResultado[];
  total: number;
  unidad: Metrica["unidad"];
  registros: number;
}

/* ------------------------------------------------------------------ */
/* Agregación                                                          */
/* ------------------------------------------------------------------ */

/** Lee "producto.nombre" dentro de la fila que devuelve Supabase. */
export function valorDe(fila: Record<string, unknown>, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((acc, parte) => {
    if (acc === null || acc === undefined) return undefined;
    const obj = acc as Record<string, unknown>;
    const v = obj[parte];
    // Supabase devuelve las relaciones como objeto o como arreglo de uno
    return Array.isArray(v) ? v[0] : v;
  }, fila);
}

function etiquetaTemporal(valor: unknown, gran: Granularidad): string {
  const d = valor instanceof Date ? valor : new Date(String(valor));
  if (isNaN(d.getTime())) return "sin fecha";

  if (gran === "mes") return d.toISOString().slice(0, 7);
  if (gran === "semana") {
    const lunes = new Date(d);
    const dow = (d.getUTCDay() + 6) % 7;
    lunes.setUTCDate(d.getUTCDate() - dow);
    return lunes.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function agrega(
  filas: Record<string, unknown>[],
  fuente: DefinicionFuente,
  config: ConfigWidget,
): Resultado {
  const metrica = fuente.metricas.find((m) => m.clave === config.metrica);
  if (!metrica) {
    return { filas: [], total: 0, unidad: "entero", registros: filas.length };
  }

  const dimension = config.dimension
    ? fuente.dimensiones.find((d) => d.clave === config.dimension)
    : undefined;

  const gran = config.granularidad ?? "dia";

  // acumuladores por grupo: suma, conteo y conteo filtrado
  const grupos = new Map<
    string,
    { suma: number; n: number; nFiltrado: number; sumaFiltrada: number }
  >();

  const claveDe = (f: Record<string, unknown>): string => {
    if (!dimension) return "total";
    const v = valorDe(f, dimension.campo);
    if (v === null || v === undefined || String(v).trim() === "") return "Sin dato";
    return dimension.temporal ? etiquetaTemporal(v, gran) : String(v);
  };

  for (const f of filas) {
    const k = claveDe(f);
    const acc = grupos.get(k) ?? { suma: 0, n: 0, nFiltrado: 0, sumaFiltrada: 0 };

    const bruto = metrica.campo ? Number(valorDe(f, metrica.campo) ?? 0) : 0;
    const valor = Number.isFinite(bruto) ? bruto : 0;

    acc.suma += valor;
    acc.n += 1;

    if (metrica.filtro) {
      const v = valorDe(f, metrica.filtro.campo);
      if (v === metrica.filtro.valor) {
        acc.nFiltrado += 1;
        acc.sumaFiltrada += valor;
      }
    }

    grupos.set(k, acc);
  }

  const resolver = (a: {
    suma: number;
    n: number;
    nFiltrado: number;
  }): number => {
    switch (metrica.agregacion) {
      case "suma":
        return a.suma;
      case "conteo":
        return metrica.filtro ? a.nFiltrado : a.n;
      case "promedio":
        return a.n > 0 ? a.suma / a.n : 0;
      case "distintos":
        return a.n;
      case "razon":
        return a.n > 0 ? a.nFiltrado / a.n : 0;
      default:
        return a.suma;
    }
  };

  let resultado: FilaResultado[] = [...grupos.entries()].map(([clave, a]) => ({
    clave,
    valor: Number(resolver(a).toFixed(4)),
  }));

  if (dimension?.temporal) {
    resultado.sort((a, b) => a.clave.localeCompare(b.clave));
  } else {
    resultado.sort((a, b) =>
      config.orden === "asc" ? a.valor - b.valor : b.valor - a.valor,
    );
  }

  if (config.limite && config.limite > 0 && !dimension?.temporal) {
    resultado = resultado.slice(0, config.limite);
  }

  // El total del periodo no es la suma de los grupos cuando la métrica
  // es un promedio o una razón: se recalcula sobre el conjunto completo.
  const global = [...grupos.values()].reduce(
    (acc, a) => ({
      suma: acc.suma + a.suma,
      n: acc.n + a.n,
      nFiltrado: acc.nFiltrado + a.nFiltrado,
      sumaFiltrada: acc.sumaFiltrada + a.sumaFiltrada,
    }),
    { suma: 0, n: 0, nFiltrado: 0, sumaFiltrada: 0 },
  );

  return {
    filas: resultado,
    total: Number(resolver(global).toFixed(4)),
    unidad: metrica.unidad ?? "entero",
    registros: filas.length,
  };
}

/* ------------------------------------------------------------------ */
/* Sugerencias                                                         */
/* ------------------------------------------------------------------ */

/**
 * Qué visualización tiene sentido para una combinación dada.
 * Es la misma heurística que aplicaría un analista: magnitud comparada
 * entre categorías es barra, evolución en el tiempo es línea, una sola
 * cifra es tarjeta, composición es dona, y muchas categorías van a
 * tabla o a barras horizontales porque las etiquetas no caben.
 */
export function tiposSugeridos(
  config: Pick<ConfigWidget, "dimension">,
  fuente: DefinicionFuente,
  cardinalidad = 0,
): { tipo: TipoWidget; nombre: string; razon: string }[] {
  if (!config.dimension) {
    return [
      { tipo: "kpi", nombre: "Tarjeta de cifra", razon: "Un solo número, grande y legible." },
    ];
  }

  const dim = fuente.dimensiones.find((d) => d.clave === config.dimension);

  if (dim?.temporal) {
    return [
      { tipo: "lineas", nombre: "Línea", razon: "Evolución en el tiempo." },
      { tipo: "area", nombre: "Área", razon: "Evolución con énfasis en el volumen." },
      { tipo: "barras", nombre: "Barras", razon: "Comparar periodos discretos." },
      { tipo: "tabla", nombre: "Tabla", razon: "Ver los valores exactos." },
    ];
  }

  const muchas = cardinalidad > 8;

  return [
    muchas
      ? { tipo: "barras_horizontal" as const, nombre: "Barras horizontales", razon: "Muchas categorías: las etiquetas caben." }
      : { tipo: "barras" as const, nombre: "Barras", razon: "Comparar magnitudes entre categorías." },
    muchas
      ? { tipo: "barras" as const, nombre: "Barras verticales", razon: "Si prefieres el eje clásico." }
      : { tipo: "barras_horizontal" as const, nombre: "Barras horizontales", razon: "Etiquetas largas se leen mejor." },
    { tipo: "dona", nombre: "Dona", razon: "Composición del total. Sirve con pocas categorías." },
    { tipo: "tabla", nombre: "Tabla", razon: "Valores exactos y ordenables." },
  ];
}

export const TIPO_NOMBRE: Record<TipoWidget, string> = {
  kpi: "Tarjeta de cifra",
  barras: "Barras",
  barras_horizontal: "Barras horizontales",
  lineas: "Línea",
  area: "Área",
  dona: "Dona",
  tabla: "Tabla",
  dispersion: "Dispersión",
};
