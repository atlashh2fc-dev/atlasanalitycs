import * as XLSX from "xlsx";
import { normalizaRut, validaRut } from "@/lib/rut";
import { extraeMatriz, normalizaTexto } from "@/lib/perfilador";
import type { SupabaseClient } from "@supabase/supabase-js";

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
}

export interface ResultadoLote {
  procesadas: number;
  total: number;
  insertadas: number;
  terminado: boolean;
}

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
  // dd-mm-yyyy y dd/mm/yyyy: formato chileno, día primero
  const m = s.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})([ T](\d{1,2}):(\d{2})(:(\d{2}))?)?/,
  );
  if (m) {
    const [, d, mes, a, , h = "0", min = "0", , seg = "0"] = m;
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

async function mapaEjecutivos(supabase: Supa, tenantId: string) {
  const { data } = await supabase
    .from("ejecutivo_alias")
    .select("alias_normalizado, ejecutivo_id")
    .eq("tenant_id", tenantId);
  return new Map((data ?? []).map((a) => [a.alias_normalizado, a.ejecutivo_id]));
}

async function resuelveEjecutivo(
  supabase: Supa,
  tenantId: string,
  nombre: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const clave = normalizaTexto(nombre);
  if (cache.has(clave)) return cache.get(clave)!;

  const { data: nuevo } = await supabase
    .from("ejecutivo")
    .insert({ tenant_id: tenantId, nombre_canonico: nombre })
    .select("id")
    .single();

  if (!nuevo) return null;

  await supabase.from("ejecutivo_alias").insert({
    tenant_id: tenantId,
    ejecutivo_id: nuevo.id,
    alias_original: nombre,
    origen: "carga_excel",
  });

  cache.set(clave, nuevo.id);
  return nuevo.id;
}

async function mapaProductos(supabase: Supa, tenantId: string) {
  const { data } = await supabase
    .from("producto")
    .select("id, nombre")
    .eq("tenant_id", tenantId);
  return new Map((data ?? []).map((p) => [normalizaTexto(p.nombre), p.id]));
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

export async function leeHoja(
  supabase: Supa,
  storagePath: string,
  hoja: string,
): Promise<unknown[][]> {
  const { data, error } = await supabase.storage.from("cargas").download(storagePath);
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo leer el archivo de Storage.");
  }

  const buf = await data.arrayBuffer();
  const libro = XLSX.read(buf, { cellDates: true });
  const sheet = libro.Sheets[hoja];
  if (!sheet) throw new Error(`La hoja «${hoja}» no está en el archivo.`);

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
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

  /* --- Planilla: el unpivot es atómico, va todo de una --- */
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

    for (let i = 0; i < filasFuente.length; i += 500) {
      const { error } = await supabase
        .from("fila_cruda")
        .insert(filasFuente.slice(i, i + 500));
      if (error) throw new Error(`No se pudo conservar la hoja: ${error.message}`);
    }

    const ejecutivos = await mapaEjecutivos(supabase, tenantId);
    const jornadas = new Map<string, number>();
    let insertadas = 0;

    for (const f of largo.filas) {
      const ejecutivoId = await resuelveEjecutivo(
        supabase,
        tenantId,
        f.entidad,
        ejecutivos,
      );
      if (!ejecutivoId) continue;

      const { error } = await supabase.from("asistencia").upsert(
        {
          tenant_id: tenantId,
          ejecutivo_id: ejecutivoId,
          campana_id: cfg.campanaId,
          fecha: f.fecha,
          marca: f.marca,
          jornada_horas: f.jornada,
          carga_id: carga.id,
        },
        { onConflict: "ejecutivo_id,fecha" },
      );
      if (!error) insertadas++;

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

    await supabase
      .from("carga")
      .update({
        estado: "procesada",
        filas_procesadas: largo.filas.length,
        filas_totales: largo.filas.length,
        filas_validas: filasFuente.length,
        filas_rechazadas: 0,
      })
      .eq("id", carga.id);

    return {
      procesadas: largo.filas.length,
      total: largo.filas.length,
      insertadas,
      terminado: true,
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

  // Filas crudas: fuente de verdad, se conservan siempre
  if (filas.length > 0) {
    const { error } = await supabase.from("fila_cruda").insert(
      filas.map((f, i) => ({
        carga_id: carga.id,
        nro_fila: desde + i + 1,
        datos: f,
      })),
    );
    if (error) throw new Error(`No se pudieron conservar las filas: ${error.message}`);
  }

  const inverso = invertir(cfg.mapeo);
  const tieneVenta = Boolean(inverso.fecha_venta && inverso.rut_cliente);
  const tieneCotizacion = Boolean(inverso.fecha_cotizacion && !tieneVenta);
  // Base UCC: identifica a la persona por RUT y trae una fecha de
  // agenda. No es una venta, es una hora médica por confirmar.
  const tieneAgenda = Boolean(
    !tieneVenta && !tieneCotizacion && inverso.rut_cliente &&
      (inverso.fecha_agenda || inverso.presentado),
  );
  let insertadas = 0;

  if (tieneAgenda) {
    for (const fila of filas) {
      const rut = normalizaRut(fila[inverso.rut_cliente!]);
      if (!rut || !validaRut(rut)) continue;

      const edad = numero(fila[inverso.edad ?? ""]);

      const { data: cliente } = await supabase
        .from("cliente")
        .upsert(
          {
            tenant_id: tenantId,
            rut,
            nombre: texto(fila[inverso.nombre_cliente ?? ""]),
            email: texto(fila[inverso.email_cliente ?? ""]),
            telefono: texto(fila[inverso.telefono_cliente ?? ""]),
            prevision: texto(fila[inverso.prevision ?? ""]),
            edad: edad === null ? null : Math.round(edad),
          },
          { onConflict: "tenant_id,rut" },
        )
        .select("id")
        .single();

      if (!cliente) continue;

      const { error } = await supabase.from("agendamiento").upsert(
        {
          tenant_id: tenantId,
          campana_id: cfg.campanaId,
          cliente_id: cliente.id,
          fecha_agenda: soloFecha(fila[inverso.fecha_agenda ?? ""]),
          presentado: booleano(fila[inverso.presentado ?? ""]),
          centro: texto(fila[inverso.centro ?? ""]),
          area: texto(fila[inverso.area ?? ""]),
          especialidad: texto(fila[inverso.especialidad ?? ""]),
          prevision: texto(fila[inverso.prevision ?? ""]),
          equipo: texto(fila[inverso.equipo ?? ""]),
          cluster: texto(fila[inverso.cluster ?? ""]),
          carga_id: carga.id,
        },
        { onConflict: "tenant_id,cliente_id,fecha_agenda,especialidad" },
      );

      if (!error) insertadas++;
    }
  }

  if (tieneVenta || tieneCotizacion) {
    const ejecutivos = await mapaEjecutivos(supabase, tenantId);
    const productos = await mapaProductos(supabase, tenantId);

    for (const fila of filas) {
      const ejecutivoNombre = texto(fila[inverso.ejecutivo ?? ""]);
      const ejecutivoId = ejecutivoNombre
        ? await resuelveEjecutivo(supabase, tenantId, ejecutivoNombre, ejecutivos)
        : null;

      const productoNombre = texto(fila[inverso.producto ?? ""]);
      const productoId = productoNombre
        ? await resuelveProducto(supabase, tenantId, productoNombre, productos)
        : null;

      if (tieneVenta) {
        const rut = normalizaRut(fila[inverso.rut_cliente!]);
        if (!rut || !validaRut(rut)) continue;

        const { data: cliente } = await supabase
          .from("cliente")
          .upsert(
            {
              tenant_id: tenantId,
              rut,
              nombre: texto(fila[inverso.nombre_cliente ?? ""]),
              email: texto(fila[inverso.email_cliente ?? ""]),
              telefono: texto(fila[inverso.telefono_cliente ?? ""]),
            },
            { onConflict: "tenant_id,rut" },
          )
          .select("id")
          .single();

        if (!cliente) continue;

        const { error } = await supabase.from("venta").upsert(
          {
            tenant_id: tenantId,
            campana_id: cfg.campanaId,
            ejecutivo_id: ejecutivoId,
            cliente_id: cliente.id,
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
          },
          { onConflict: "tenant_id,nro_solicitud" },
        );

        if (!error) insertadas++;
      } else {
        const { error } = await supabase.from("cotizacion").insert({
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

        if (!error) insertadas++;
      }
    }
  }

  const terminado = hasta >= cuerpo.length;

  await supabase
    .from("carga")
    .update({
      filas_procesadas: hasta,
      filas_totales: cuerpo.length,
      filas_validas: cuerpo.length,
      filas_rechazadas: 0,
      estado: terminado ? "procesada" : "mapeada",
    })
    .eq("id", carga.id);

  return { procesadas: hasta, total: cuerpo.length, insertadas, terminado };
}
