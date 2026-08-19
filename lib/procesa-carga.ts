import * as XLSX from "xlsx";
import { normalizaRut, validaRut } from "@/lib/rut";
import { extraeMatriz, normalizaTexto } from "@/lib/perfilador";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FuenteCobertura } from "@/lib/fuente-carga";

/**
 * Derivación de un archivo al modelo canónico, en el servidor.
 *
 * Se procesa por lotes y el avance queda en `carga.filas_procesadas`,
 * así que la carga puede reanudarse exactamente donde quedó: cerrar la
 * pestaña ya no pierde el trabajo.
 */

type Supa = SupabaseClient;

export interface ConfigCarga {
  mapeo: Record<string, string>;
  modo: "tabular" | "matriz";
  filaEncabezado: number;
  campanaId: string | null;
  fuenteEsperada?: FuenteCobertura;
  fechaEsperada?: string;
}

export interface ResultadoLote {
  procesadas: number;
  total: number;
  insertadas: number;
  rechazadas: number;
  terminado: boolean;
  periodosActualizados?: string[];
  ventasRetiradas?: number;
}

type FilaCliente = {
  tenant_id: string;
  rut: string;
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  prevision?: string | null;
  edad?: number | null;
};

const CACHE_HOJAS_MAX = 4;
const CACHE_HOJAS_TTL_MS = 15 * 60 * 1_000;
const cacheHojas = new Map<string, { matriz: unknown[][]; vence: number }>();

/* ------------------------------------------------------------------ */
/* Utilidades de valor                                                 */
/* ------------------------------------------------------------------ */

function invertir(mapeo: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [columna, rol] of Object.entries(mapeo)) {
    if (!out[rol]) out[rol] = columna;
  }
  return out;
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/**
 * Convierte a número un valor que puede venir como número o como texto.
 *
 * Los exports escriben los montos como texto y el punto es ambiguo:
 * en "25.325" separa miles, en "0.62" separa decimales. Asumir siempre
 * miles convertía 0,62 UF en 62 —un error de dos órdenes de magnitud
 * que no rompe nada y por eso pasa desapercibido—.
 *
 * Reglas, en orden:
 *   1. Si trae punto Y coma, el ÚLTIMO en aparecer es el decimal.
 *   2. Si trae sólo coma, es decimal (convención chilena).
 *   3. Si trae sólo punto: en pesos separa miles —el peso no tiene
 *      decimales—; en cualquier otro campo es decimal.
 */
function numero(v: unknown, formato: "clp" | "decimal" = "decimal"): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  const limpio = String(v).trim().replace(/[^0-9.,-]/g, "");
  if (limpio === "" || limpio === "-") return null;

  const punto = limpio.lastIndexOf(".");
  const coma = limpio.lastIndexOf(",");

  let normalizado: string;

  if (punto >= 0 && coma >= 0) {
    const decimal = punto > coma ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    normalizado = limpio.split(miles).join("").replace(decimal, ".");
  } else if (coma >= 0) {
    normalizado = limpio.replace(/,/g, ".");
  } else if (punto >= 0) {
    normalizado = formato === "clp" ? limpio.split(".").join("") : limpio;
  } else {
    normalizado = limpio;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function fecha(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();

  const s = String(v).trim();
  // dd-mm-yyyy y dd/mm/yyyy: formato chileno, día primero.
  // El separador con la hora admite coma: el export del discador
  // escribe "8/8/2026, 11:28:59" y sin la coma se perdía la hora, que es
  // justo lo que se necesita para saber a qué hora se contacta mejor.
  const m = s.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:,?[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    const [, d, mes, a, h = "0", min = "0", seg = "0"] = m;
    return new Date(Date.UTC(+a, +mes - 1, +d, +h, +min, +seg)).toISOString();
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Fecha sin hora, para columnas de tipo día (agenda, asistencia). */
function soloFecha(v: unknown): string | null {
  const iso = fecha(v);
  return iso ? iso.slice(0, 10) : null;
}

/**
 * Sí/no en las formas que traen los archivos reales: la base UCC usa
 * "Si"/"Sí"/"No", otros exports usan 1/0 o true/false.
 */
function booleano(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = normalizaTexto(v);
  if (["si", "sí", "true", "1", "verdadero", "x"].includes(s)) return true;
  if (["no", "false", "0", "falso"].includes(s)) return false;
  return null;
}

/* ------------------------------------------------------------------ */
/* Maestros                                                            */
/* ------------------------------------------------------------------ */

interface MapaEjecutivos {
  porAlias: Map<string, string>;
  porRut: Map<string, string>;
}

async function mapaEjecutivos(
  supabase: Supa,
  tenantId: string,
): Promise<MapaEjecutivos> {
  const [{ data: alias }, { data: ejecutivos }] = await Promise.all([
    supabase
      .from("ejecutivo_alias")
      .select("alias_normalizado, ejecutivo_id")
      .eq("tenant_id", tenantId),
    supabase
      .from("ejecutivo")
      .select("id, rut")
      .eq("tenant_id", tenantId)
      .not("rut", "is", null),
  ]);

  return {
    porAlias: new Map(
      (alias ?? []).map((a) => [a.alias_normalizado as string, a.ejecutivo_id as string]),
    ),
    porRut: new Map(
      (ejecutivos ?? []).map((e) => [e.rut as string, e.id as string]),
    ),
  };
}

/**
 * Identifica al ejecutivo.
 *
 * El RUT manda cuando el archivo lo trae. Emparejar sólo por nombre es
 * lo que llenó la tabla de duplicados: el discador escribe "Sofia San
 * Martin Moscoso" y el archivo de ventas "Sofia San Martin", y cada
 * variante creaba una persona nueva con sus propias ventas.
 *
 * Cuando llega un RUT para alguien que hasta ahora sólo se conocía por
 * nombre, se le asigna: de ahí en adelante esa persona queda anclada y
 * cualquier variante futura de su nombre cae en la misma ficha.
 */
async function resuelveEjecutivo(
  supabase: Supa,
  tenantId: string,
  nombre: string,
  cache: MapaEjecutivos,
  rut?: string | null,
): Promise<string | null> {
  const clave = normalizaTexto(nombre);
  const rutNorm = rut ? normalizaRut(rut) : null;

  if (rutNorm && cache.porRut.has(rutNorm)) {
    const id = cache.porRut.get(rutNorm)!;
    if (clave && !cache.porAlias.has(clave)) {
      await supabase.from("ejecutivo_alias").insert({
        tenant_id: tenantId,
        ejecutivo_id: id,
        alias_original: nombre,
        origen: "carga_excel",
      });
      cache.porAlias.set(clave, id);
    }
    return id;
  }

  if (cache.porAlias.has(clave)) {
    const id = cache.porAlias.get(clave)!;
    if (rutNorm) {
      await supabase.from("ejecutivo").update({ rut: rutNorm }).eq("id", id);
      cache.porRut.set(rutNorm, id);
    }
    return id;
  }

  const { data: nuevo } = await supabase
    .from("ejecutivo")
    .insert({ tenant_id: tenantId, nombre_canonico: nombre, rut: rutNorm })
    .select("id")
    .single();

  if (!nuevo) return null;

  await supabase.from("ejecutivo_alias").insert({
    tenant_id: tenantId,
    ejecutivo_id: nuevo.id,
    alias_original: nombre,
    origen: "carga_excel",
  });

  cache.porAlias.set(clave, nuevo.id);
  if (rutNorm) cache.porRut.set(rutNorm, nuevo.id);
  return nuevo.id;
}

async function mapaProductos(supabase: Supa, tenantId: string) {
  const { data } = await supabase
    .from("producto")
    .select("id, nombre")
    .eq("tenant_id", tenantId);
  return new Map((data ?? []).map((p) => [normalizaTexto(p.nombre), p.id]));
}

/** Consolida RUT repetidos y resuelve todos los clientes del lote de una vez. */
async function upsertClientes(
  supabase: Supa,
  filas: FilaCliente[],
): Promise<Map<string, string>> {
  const unicos = new Map<string, FilaCliente>();
  for (const fila of filas) unicos.set(fila.rut, fila);
  if (unicos.size === 0) return new Map();

  const { data, error } = await supabase
    .from("cliente")
    .upsert([...unicos.values()], { onConflict: "tenant_id,rut" })
    .select("id,rut");

  if (error) throw new Error(`No se pudieron preparar los clientes: ${error.message}`);
  return new Map((data ?? []).map((c) => [c.rut as string, c.id as string]));
}

function mesDeFecha(valor: unknown): string | null {
  const iso = fecha(valor);
  return iso ? iso.slice(0, 7) : null;
}

function deduplicaParaUpsert<T>(filas: T[], clave: (fila: T) => string | null): T[] {
  const conClave = new Map<string, T>();
  const sinClave: T[] = [];
  for (const fila of filas) {
    const k = clave(fila);
    if (k === null) sinClave.push(fila);
    else conClave.set(k, fila);
  }
  return [...conClave.values(), ...sinClave];
}

/** Actualiza los snapshots mensuales que pudieron cambiar con la carga. */
async function recalculaPeriodos(
  supabase: Supa,
  _tenantId: string,
  meses: Iterable<string>,
): Promise<string[]> {
  const actualizados = [...new Set(meses)]
    .filter((mes) => /^\d{4}-\d{2}$/.test(mes))
    .sort();
  if (actualizados.length === 0) return [];

  const { error } = await supabase.rpc("recalcular_periodos_carga", {
    p_meses: actualizados.map((mes) => `${mes}-01`),
  });
  if (error) {
    throw new Error(`La carga terminó, pero no se actualizaron sus periodos: ${error.message}`);
  }
  return actualizados;
}

/** Complementario y Catastrófico comparten meta; Oncológico va aparte. */
function agrupacionSugerida(clave: string): string {
  if (clave.includes("onco")) return "ONCO";
  if (clave.includes("complementario") || clave.includes("catastrofico")) {
    return "CM+CAT";
  }
  return "Sin clasificar";
}

async function resuelveProducto(
  supabase: Supa,
  tenantId: string,
  nombre: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const clave = normalizaTexto(nombre);
  if (cache.has(clave)) return cache.get(clave)!;

  const { data: nuevo } = await supabase
    .from("producto")
    .insert({
      tenant_id: tenantId,
      nombre,
      agrupacion_meta: agrupacionSugerida(clave),
    })
    .select("id")
    .single();

  if (!nuevo) return null;
  cache.set(clave, nuevo.id);
  return nuevo.id;
}

/* ------------------------------------------------------------------ */
/* Lectura del archivo desde Storage                                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Tipificaciones                                                      */
/* ------------------------------------------------------------------ */

async function mapaTipificaciones(supabase: Supa, tenantId: string) {
  const { data } = await supabase
    .from("tipificacion")
    .select("id, codigo")
    .eq("tenant_id", tenantId);

  return new Map((data ?? []).map((t) => [t.codigo as string, t.id as string]));
}

/**
 * Una tipificación que no está en el catálogo se crea sola, en
 * 'pendiente'. Descartar la gestión sería peor: el discador agrega
 * códigos nuevos sin avisar y perderíamos gestiones reales. Queda
 * marcada para que el mantenedor la reclasifique.
 */
async function resuelveTipificacion(
  supabase: Supa,
  tenantId: string,
  nombre: string | null,
  cache: Map<string, string>,
): Promise<string | null> {
  if (!nombre) return null;

  const codigo = normalizaTexto(nombre);
  const conocida = cache.get(codigo);
  if (conocida) return conocida;

  const { data } = await supabase
    .from("tipificacion")
    .upsert(
      {
        tenant_id: tenantId,
        codigo,
        nombre,
        categoria: "pendiente",
        cuenta_como_contacto: false,
        es_cierre: false,
      },
      { onConflict: "tenant_id,codigo", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (data?.id) {
    cache.set(codigo, data.id as string);
    return data.id as string;
  }
  return null;
}

export async function leeHoja(
  supabase: Supa,
  storagePath: string,
  hoja: string,
): Promise<unknown[][]> {
  const claveCache = `${storagePath}\n${hoja}`;
  const cacheada = cacheHojas.get(claveCache);
  if (cacheada && cacheada.vence > Date.now()) return cacheada.matriz;

  const { data, error } = await supabase.storage.from("cargas").download(storagePath);
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo leer el archivo de Storage.");
  }

  const buf = await data.arrayBuffer();
  const libro = XLSX.read(buf, { cellDates: true });
  const sheet = libro.Sheets[hoja];
  if (!sheet) throw new Error(`La hoja «${hoja}» no está en el archivo.`);

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  cacheHojas.set(claveCache, { matriz, vence: Date.now() + CACHE_HOJAS_TTL_MS });
  while (cacheHojas.size > CACHE_HOJAS_MAX) {
    const primera = cacheHojas.keys().next().value as string | undefined;
    if (!primera) break;
    cacheHojas.delete(primera);
  }
  return matriz;
}

/* ------------------------------------------------------------------ */
/* Procesamiento de un lote                                            */
/* ------------------------------------------------------------------ */

export async function procesaLote(
  supabase: Supa,
  tenantId: string,
  carga: {
    id: string;
    hoja: string;
    storage_path: string;
    filas_procesadas: number;
    config: ConfigCarga;
  },
  tamanoLote = 400,
): Promise<ResultadoLote> {
  const matriz = await leeHoja(supabase, carga.storage_path, carga.hoja);
  const cfg = carga.config;

  /* --- Planilla: unpivot por lotes para informar avance real y reanudar. --- */
  if (cfg.modo === "matriz") {
    const largo = extraeMatriz(matriz, cfg.filaEncabezado);
    // También las planillas se conservan en su forma original. Antes se
    // derivaban directo a asistencia y Atlas perdía las celdas que no
    // pertenecían a ese pack especializado.
    const encabezadoFuente = (matriz[cfg.filaEncabezado] ?? []).map((c, i) =>
      typeof c === "string" && c.trim() !== "" ? c.trim() : `columna_${i + 1}`,
    );
    const filasFuente = matriz
      .slice(cfg.filaEncabezado + 1)
      .filter((f) => f.some((c) => c !== null && String(c).trim() !== ""))
      .map((f, i) => {
        const datos: Record<string, unknown> = {};
        encabezadoFuente.forEach((nombre, posicion) => {
          const valor = f[posicion];
          datos[nombre] = valor instanceof Date ? valor.toISOString() : valor;
        });
        return { carga_id: carga.id, nro_fila: i + 1, datos };
      });

    const desde = carga.filas_procesadas;
    const hasta = Math.min(desde + tamanoLote, largo.filas.length);

    // Si el primer intento se cortó antes de confirmar avance, reconstruimos
    // la copia cruda para no duplicarla al reintentar.
    if (desde === 0) {
      const { error: errorLimpieza } = await supabase
        .from("fila_cruda")
        .delete()
        .eq("carga_id", carga.id);
      if (errorLimpieza) {
        throw new Error(`No se pudo preparar la hoja: ${errorLimpieza.message}`);
      }

      for (let i = 0; i < filasFuente.length; i += 500) {
        const { error } = await supabase
          .from("fila_cruda")
          .insert(filasFuente.slice(i, i + 500));
        if (error) throw new Error(`No se pudo conservar la hoja: ${error.message}`);
      }
    }

    const ejecutivos = await mapaEjecutivos(supabase, tenantId);
    const jornadas = new Map<string, number>();
    const asistencias: Record<string, unknown>[] = [];

    for (const f of largo.filas.slice(desde, hasta)) {
      const ejecutivoId = await resuelveEjecutivo(
        supabase,
        tenantId,
        f.entidad,
        ejecutivos,
      );
      if (!ejecutivoId) continue;

      asistencias.push({
        tenant_id: tenantId,
        ejecutivo_id: ejecutivoId,
        campana_id: cfg.campanaId,
        fecha: f.fecha,
        marca: f.marca,
        jornada_horas: f.jornada,
        carga_id: carga.id,
      });

      // La jornada contractual viene en la planilla (42 hrs / 30 hrs).
      // Sin esto todos quedaban con el 42 por defecto de la tabla.
      if (f.jornada && !jornadas.has(ejecutivoId)) {
        jornadas.set(ejecutivoId, f.jornada);
        await supabase
          .from("ejecutivo")
          .update({ jornada_horas: f.jornada })
          .eq("id", ejecutivoId);
      }
    }

    let insertadas = 0;
    if (asistencias.length > 0) {
      const { data, error } = await supabase
        .from("asistencia")
        .upsert(asistencias, { onConflict: "ejecutivo_id,fecha" })
        .select("id");
      if (error) throw new Error(`No se pudo guardar la asistencia: ${error.message}`);
      insertadas = data?.length ?? 0;
    }

    const terminado = hasta >= largo.filas.length;
    const periodosActualizados = terminado
      ? await recalculaPeriodos(
          supabase,
          tenantId,
          largo.filas.map((f) => f.fecha.slice(0, 7)),
        )
      : undefined;

    await supabase
      .from("carga")
      .update({
        estado: terminado ? "procesada" : "mapeada",
        filas_procesadas: hasta,
        filas_totales: largo.filas.length,
        filas_validas: filasFuente.length,
        filas_rechazadas: 0,
      })
      .eq("id", carga.id);

    return {
      procesadas: hasta,
      total: largo.filas.length,
      insertadas,
      rechazadas: 0,
      terminado,
      periodosActualizados,
    };
  }

  /* --- Tabla: por lotes --- */
  const encabezado = (matriz[cfg.filaEncabezado] ?? []).map((c, i) =>
    typeof c === "string" && c.trim() !== "" ? c.trim() : `columna_${i + 1}`,
  );

  const cuerpo = matriz
    .slice(cfg.filaEncabezado + 1)
    .filter((f) => f.some((c) => c !== null && String(c).trim() !== ""));

  const desde = carga.filas_procesadas;
  const hasta = Math.min(desde + tamanoLote, cuerpo.length);
  const lote = cuerpo.slice(desde, hasta);

  const filas = lote.map((f) => {
    const o: Record<string, unknown> = {};
    encabezado.forEach((nombre, i) => {
      const v = f[i];
      o[nombre] = v instanceof Date ? v.toISOString() : v;
    });
    return o;
  });

  const inverso = invertir(cfg.mapeo);
  // Gestiones del discador: una fila por intento de contacto, con su
  // tipificación. Se evalúa primero porque el archivo también trae RUT
  // de cliente y podría confundirse con una base.
  const tieneGestion = Boolean(inverso.fecha_gestion && inverso.tipificacion);
  const tieneVenta = Boolean(!tieneGestion && inverso.fecha_venta && inverso.rut_cliente);
  const tieneCotizacion = Boolean(!tieneGestion && inverso.fecha_cotizacion && !tieneVenta);
  // Base UCC: identifica a la persona por RUT y trae una fecha de
  // agenda. No es una venta, es una hora médica por confirmar.
  const tieneAgenda = Boolean(
    !tieneGestion && !tieneVenta && !tieneCotizacion && inverso.rut_cliente &&
      (inverso.fecha_agenda || inverso.presentado),
  );
  const requiereRutValido = tieneGestion || tieneVenta || tieneAgenda;
  const erroresFila = filas.map((fila) => {
    if (!requiereRutValido || !inverso.rut_cliente) return null;
    return validaRut(fila[inverso.rut_cliente])
      ? null
      : "RUT de cliente ausente o inválido; fila conservada sin derivar al modelo analítico.";
  });
  const rechazadasLote = erroresFila.filter(Boolean).length;

  // Filas crudas: fuente de verdad, se conservan siempre
  if (filas.length > 0) {
    // Un corte entre el INSERT y la actualización de filas_procesadas no
    // puede duplicar el lote al reanudar. Limpiamos sólo el rango que se va
    // a reconstruir; los lotes ya confirmados permanecen intactos.
    const { error: errorLimpieza } = await supabase
      .from("fila_cruda")
      .delete()
      .eq("carga_id", carga.id)
      .gte("nro_fila", desde + 1)
      .lte("nro_fila", hasta);
    if (errorLimpieza) {
      throw new Error(`No se pudo reanudar la copia cruda: ${errorLimpieza.message}`);
    }
    const { error } = await supabase.from("fila_cruda").insert(
      filas.map((f, i) => ({
        carga_id: carga.id,
        nro_fila: desde + i + 1,
        datos: f,
        error: erroresFila[i],
      })),
    );
    if (error) throw new Error(`No se pudieron conservar las filas: ${error.message}`);
  }
  let insertadas = 0;

  if (tieneGestion) {
    const ejecutivos = await mapaEjecutivos(supabase, tenantId);
    const tipificaciones = await mapaTipificaciones(supabase, tenantId);
    const preparadas = filas
      .map((fila) => ({ fila, rut: normalizaRut(fila[inverso.rut_cliente ?? ""]) }))
      .filter(
        (x): x is { fila: Record<string, unknown>; rut: string } =>
          Boolean(x.rut && validaRut(x.rut)),
      );
    const clientes = await upsertClientes(
      supabase,
      preparadas.map(({ fila, rut }) => ({
        tenant_id: tenantId,
        rut,
        nombre: texto(fila[inverso.nombre_cliente ?? ""]),
        telefono: texto(fila[inverso.telefono_cliente ?? ""]),
      })),
    );
    const gestiones: Record<string, unknown>[] = [];

    for (const { fila, rut } of preparadas) {
      const clienteId = clientes.get(rut);
      if (!clienteId) continue;

      const ejecutivoNombre = texto(fila[inverso.ejecutivo ?? ""]);
      const ejecutivoId = ejecutivoNombre
        ? await resuelveEjecutivo(
            supabase,
            tenantId,
            ejecutivoNombre,
            ejecutivos,
            texto(fila[inverso.rut_ejecutivo ?? ""]),
          )
        : null;

      const tipificacionId = await resuelveTipificacion(
        supabase,
        tenantId,
        texto(fila[inverso.tipificacion!]),
        tipificaciones,
      );

      gestiones.push({
          tenant_id: tenantId,
          campana_id: cfg.campanaId,
          cliente_id: clienteId,
          ejecutivo_id: ejecutivoId,
          fecha: fecha(fila[inverso.fecha_gestion!]),
          tipificacion_id: tipificacionId,
          id_externo:
            texto(fila[inverso.id_gestion ?? ""]) ??
            texto(fila[inverso.id_externo ?? ""]),
          carga_id: carga.id,
      });
    }

    if (gestiones.length > 0) {
      const gestionesUnicas = deduplicaParaUpsert(gestiones, (g) =>
        typeof g.id_externo === "string" ? `${g.tenant_id}:${g.id_externo}` : null,
      );
      const { data, error } = await supabase
        .from("gestion")
        .upsert(gestionesUnicas, { onConflict: "tenant_id,id_externo" })
        .select("id");
      if (error) throw new Error(`No se pudieron guardar las gestiones: ${error.message}`);
      insertadas += data?.length ?? 0;
    }
  }

  if (tieneAgenda) {
    const preparadas = filas
      .map((fila) => ({ fila, rut: normalizaRut(fila[inverso.rut_cliente!]) }))
      .filter(
        (x): x is { fila: Record<string, unknown>; rut: string } =>
          Boolean(x.rut && validaRut(x.rut)),
      );
    const clientes = await upsertClientes(
      supabase,
      preparadas.map(({ fila, rut }) => {
        const edad = numero(fila[inverso.edad ?? ""]);
        return {
          tenant_id: tenantId,
          rut,
          nombre: texto(fila[inverso.nombre_cliente ?? ""]),
          email: texto(fila[inverso.email_cliente ?? ""]),
          telefono: texto(fila[inverso.telefono_cliente ?? ""]),
          prevision: texto(fila[inverso.prevision ?? ""]),
          edad: edad === null ? null : Math.round(edad),
        };
      }),
    );
    const agendas: Record<string, unknown>[] = [];

    for (const { fila, rut } of preparadas) {
      const clienteId = clientes.get(rut);
      if (!clienteId) continue;
      agendas.push({
          tenant_id: tenantId,
          campana_id: cfg.campanaId,
          cliente_id: clienteId,
          fecha_agenda: soloFecha(fila[inverso.fecha_agenda ?? ""]),
          presentado: booleano(fila[inverso.presentado ?? ""]),
          centro: texto(fila[inverso.centro ?? ""]),
          area: texto(fila[inverso.area ?? ""]),
          especialidad: texto(fila[inverso.especialidad ?? ""]),
          prevision: texto(fila[inverso.prevision ?? ""]),
          equipo: texto(fila[inverso.equipo ?? ""]),
          cluster: texto(fila[inverso.cluster ?? ""]),
          carga_id: carga.id,
      });
    }

    if (agendas.length > 0) {
      const agendasUnicas = deduplicaParaUpsert(agendas, (a) =>
        a.fecha_agenda && typeof a.especialidad === "string"
          ? `${a.tenant_id}:${a.cliente_id}:${a.fecha_agenda}:${a.especialidad}`
          : null,
      );
      const { data, error } = await supabase
        .from("agendamiento")
        .upsert(agendasUnicas, {
          onConflict: "tenant_id,cliente_id,fecha_agenda,especialidad",
        })
        .select("id");
      if (error) throw new Error(`No se pudo guardar la base de clientes: ${error.message}`);
      insertadas += data?.length ?? 0;
    }
  }

  if (tieneVenta || tieneCotizacion) {
    const ejecutivos = await mapaEjecutivos(supabase, tenantId);
    const productos = await mapaProductos(supabase, tenantId);
    const clientesVenta = tieneVenta
      ? await upsertClientes(
          supabase,
          filas.flatMap((fila) => {
            const rut = normalizaRut(fila[inverso.rut_cliente!]);
            if (!rut || !validaRut(rut)) return [];
            return [{
              tenant_id: tenantId,
              rut,
              nombre: texto(fila[inverso.nombre_cliente ?? ""]),
              email: texto(fila[inverso.email_cliente ?? ""]),
              telefono: texto(fila[inverso.telefono_cliente ?? ""]),
            }];
          }),
        )
      : new Map<string, string>();
    const ventas: Record<string, unknown>[] = [];
    const cotizaciones: Record<string, unknown>[] = [];

    for (const fila of filas) {
      const ejecutivoNombre = texto(fila[inverso.ejecutivo ?? ""]);
      const ejecutivoId = ejecutivoNombre
        ? await resuelveEjecutivo(
            supabase,
            tenantId,
            ejecutivoNombre,
            ejecutivos,
            texto(fila[inverso.rut_ejecutivo ?? ""]),
          )
        : null;

      const productoNombre = texto(fila[inverso.producto ?? ""]);
      const productoId = productoNombre
        ? await resuelveProducto(supabase, tenantId, productoNombre, productos)
        : null;

      if (tieneVenta) {
        const rut = normalizaRut(fila[inverso.rut_cliente!]);
        if (!rut || !validaRut(rut)) continue;
        const clienteId = clientesVenta.get(rut);
        if (!clienteId) continue;
        ventas.push({
            tenant_id: tenantId,
            campana_id: cfg.campanaId,
            ejecutivo_id: ejecutivoId,
            cliente_id: clienteId,
            producto_id: productoId,
            nro_solicitud: texto(fila[inverso.nro_solicitud ?? ""]),
            fecha_solicitud: fecha(fila[inverso.fecha_venta!]),
            precio_uf: numero(fila[inverso.monto_uf ?? ""]),
            precio_clp: numero(fila[inverso.monto_clp ?? ""], "clp"),
            n_asegurados: Math.max(
              1,
              Math.round(numero(fila[inverso.n_asegurados ?? ""]) ?? 1),
            ),
            carga_id: carga.id,
        });
      } else {
        cotizaciones.push({
          tenant_id: tenantId,
          campana_id: cfg.campanaId,
          ejecutivo_id: ejecutivoId,
          producto_id: productoId,
          fecha: fecha(fila[inverso.fecha_cotizacion!]),
          nombre_cotizante: texto(fila[inverso.nombre_cliente ?? ""]),
          email: texto(fila[inverso.email_cliente ?? ""]),
          telefono: texto(fila[inverso.telefono_cliente ?? ""]),
          precio_uf: numero(fila[inverso.monto_uf ?? ""]),
          precio_clp: numero(fila[inverso.monto_clp ?? ""], "clp"),
          carga_id: carga.id,
        });
      }
    }

    if (ventas.length > 0) {
      const ventasUnicas = deduplicaParaUpsert(ventas, (v) =>
        typeof v.nro_solicitud === "string"
          ? `${v.tenant_id}:${v.nro_solicitud}`
          : null,
      );
      const { data, error } = await supabase
        .from("venta")
        .upsert(ventasUnicas, { onConflict: "tenant_id,nro_solicitud" })
        .select("id");
      if (error) throw new Error(`No se pudieron guardar las ventas: ${error.message}`);
      insertadas += data?.length ?? 0;
    }
    if (cotizaciones.length > 0) {
      const { data, error } = await supabase
        .from("cotizacion")
        .insert(cotizaciones)
        .select("id");
      if (error) throw new Error(`No se pudieron guardar las cotizaciones: ${error.message}`);
      insertadas += data?.length ?? 0;
    }
  }

  const terminado = hasta >= cuerpo.length;

  let ventasRetiradas: number | undefined;

  // Un export de ventas puede ser una fotografia actualizada del mismo
  // periodo o un archivo incremental. La base distingue ambos casos por
  // solapamiento y cobertura; solo una fotografia comprobada retira las
  // solicitudes que ya no vienen en el origen.
  if (terminado && tieneVenta) {
    const { data, error } = await supabase.rpc("reconciliar_ventas_carga", {
      p_carga_id: carga.id,
    });
    if (error) throw new Error(`No se pudieron reconciliar las ventas: ${error.message}`);
    const resultado = data as { retiradas?: number } | null;
    ventasRetiradas = resultado?.retiradas ?? 0;
  }

  // Al cerrar una carga de ventas se desarman las columnas de titular y
  // beneficiarios en personas. El parseo vive en SQL para que haya una
  // sola implementación: la tarifa por tramo etario y el catálogo de
  // preexistencias dependen de que esto quede bien.
  if (terminado && tieneVenta) {
    const { error } = await supabase.rpc("poblar_asegurados_de_carga", {
      p_carga_id: carga.id,
    });
    if (error) throw new Error(`No se pudieron derivar los asegurados: ${error.message}`);
  }

  const columnaFechaKpi = tieneGestion
    ? inverso.fecha_gestion
    : tieneVenta
      ? inverso.fecha_venta
      : tieneCotizacion
        ? inverso.fecha_cotizacion
        : null;
  const posicionFechaKpi = columnaFechaKpi ? encabezado.indexOf(columnaFechaKpi) : -1;
  const periodosActualizados = terminado && posicionFechaKpi >= 0
    ? await recalculaPeriodos(
        supabase,
        tenantId,
        cuerpo.flatMap((fila) => {
          const mes = mesDeFecha(fila[posicionFechaKpi]);
          return mes ? [mes] : [];
        }),
      )
    : undefined;

  const { count: rechazadasAcumuladas, error: errorConteo } = await supabase
    .from("fila_cruda")
    .select("id", { count: "exact", head: true })
    .eq("carga_id", carga.id)
    .not("error", "is", null);
  if (errorConteo) {
    throw new Error(`La carga avanzó, pero no se pudieron contar sus filas rechazadas: ${errorConteo.message}`);
  }

  await supabase
    .from("carga")
    .update({
      filas_procesadas: hasta,
      filas_totales: cuerpo.length,
      filas_validas: Math.max(0, cuerpo.length - (rechazadasAcumuladas ?? 0)),
      filas_rechazadas: rechazadasAcumuladas ?? 0,
      estado: terminado ? "procesada" : "mapeada",
      error_detalle: null,
    })
    .eq("id", carga.id);

  return {
    procesadas: hasta,
    total: cuerpo.length,
    insertadas,
    rechazadas: rechazadasLote,
    terminado,
    periodosActualizados,
    ventasRetiradas,
  };
}
