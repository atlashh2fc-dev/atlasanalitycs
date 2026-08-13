import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { normalizaRut, validaRut } from "@/lib/rut";
import { normalizaTexto } from "@/lib/perfilador";

interface Payload {
  cargaId: string | null;
  archivo: string;
  hoja: string;
  modo: "tabular" | "matriz";
  filaEncabezado: number;
  metadatos: Record<string, unknown>;
  campanaId: string | null;
  mapeo: Record<string, string>;
  columnas: {
    posicion: number;
    nombreOriginal: string;
    nombreNormalizado: string;
    tipo: string;
    confianza: number;
    rol: string | null;
    cardinalidad: number;
    nulos: number;
    filas: number;
    varianzaCero: boolean;
    descartada: boolean;
    motivoDescarte: string | null;
    muestra: string[];
  }[];
  filas: Record<string, unknown>[];
  desplazamiento: number;
  ultimo: boolean;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.tenant_id) {
    return NextResponse.json(
      { error: "El usuario no tiene un tenant asignado. Créalo en el mantenedor." },
      { status: 400 },
    );
  }

  const tenantId = perfil.tenant_id;
  const p = (await request.json()) as Payload;

  /* ---------- 1. Cabecera de la carga (sólo en el primer lote) ------- */
  let cargaId = p.cargaId;

  if (!cargaId) {
    const { data: carga, error } = await supabase
      .from("carga")
      .insert({
        tenant_id: tenantId,
        campana_id: p.campanaId,
        archivo_nombre: p.archivo,
        hoja: p.hoja,
        modo: p.modo,
        fila_encabezado: p.filaEncabezado + 1,
        metadatos: p.metadatos,
        estado: "perfilada",
        cargado_por: user.id,
      })
      .select("id")
      .single();

    if (error || !carga) {
      return NextResponse.json(
        { error: error?.message ?? "No se pudo registrar la carga." },
        { status: 500 },
      );
    }
    cargaId = carga.id;

    await supabase.from("carga_columna").insert(
      p.columnas.map((c) => ({
        carga_id: cargaId,
        posicion: c.posicion,
        nombre_original: c.nombreOriginal,
        nombre_normalizado: c.nombreNormalizado,
        tipo_detectado: c.tipo,
        confianza: c.confianza,
        rol_semantico: c.rol,
        cardinalidad: c.cardinalidad,
        nulos: c.nulos,
        filas: c.filas,
        varianza_cero: c.varianzaCero,
        descartada: c.descartada,
        motivo_descarte: c.motivoDescarte,
        muestra: c.muestra,
      })),
    );

    // El mapeo confirmado alimenta el diccionario de sinónimos: la
    // próxima vez que llegue una columna con ese nombre, se reconoce sola.
    for (const c of p.columnas) {
      if (!c.rol) continue;
      await supabase.from("sinonimo_columna").upsert(
        {
          tenant_id: tenantId,
          nombre_normalizado: c.nombreNormalizado,
          rol_semantico: c.rol,
          tipo_esperado: c.tipo,
        },
        { onConflict: "tenant_id,nombre_normalizado,rol_semantico", ignoreDuplicates: true },
      );
    }
  }

  /* ---------- 2. Filas crudas: fuente de verdad --------------------- */
  await supabase.from("fila_cruda").insert(
    p.filas.map((f, i) => ({
      carga_id: cargaId,
      nro_fila: p.desplazamiento + i + 1,
      datos: f,
    })),
  );

  /* ---------- 3. Derivación al modelo canónico ---------------------- */
  const inverso = invertir(p.mapeo);
  let insertadas = 0;

  const tieneVenta = inverso.fecha_venta && inverso.rut_cliente;
  const tieneCotizacion = inverso.fecha_cotizacion && !tieneVenta;

  if (tieneVenta || tieneCotizacion) {
    const ejecutivos = await mapaEjecutivos(supabase, tenantId);
    const productos = await mapaProductos(supabase, tenantId);

    for (const fila of p.filas) {
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
            campana_id: p.campanaId,
            ejecutivo_id: ejecutivoId,
            cliente_id: cliente.id,
            producto_id: productoId,
            nro_solicitud: texto(fila[inverso.nro_solicitud ?? ""]),
            fecha_solicitud: fecha(fila[inverso.fecha_venta!]),
            precio_uf: numero(fila[inverso.monto_uf ?? ""]),
            precio_clp: numero(fila[inverso.monto_clp ?? ""]),
            n_asegurados: Math.max(1, Math.round(numero(fila[inverso.n_asegurados ?? ""]) ?? 1)),
            carga_id: cargaId,
          },
          { onConflict: "tenant_id,nro_solicitud", ignoreDuplicates: false },
        );

        if (!error) insertadas++;
      } else {
        const { error } = await supabase.from("cotizacion").insert({
          tenant_id: tenantId,
          campana_id: p.campanaId,
          ejecutivo_id: ejecutivoId,
          producto_id: productoId,
          fecha: fecha(fila[inverso.fecha_cotizacion!]),
          nombre_cotizante: texto(fila[inverso.nombre_cliente ?? ""]),
          email: texto(fila[inverso.email_cliente ?? ""]),
          telefono: texto(fila[inverso.telefono_cliente ?? ""]),
          precio_uf: numero(fila[inverso.monto_uf ?? ""]),
          precio_clp: numero(fila[inverso.monto_clp ?? ""]),
          carga_id: cargaId,
        });

        if (!error) insertadas++;
      }
    }
  }

  if (p.ultimo) {
    await supabase
      .from("carga")
      .update({ estado: "procesada", filas_totales: p.desplazamiento + p.filas.length })
      .eq("id", cargaId);
  }

  return NextResponse.json({ cargaId, insertadas });
}

/* -------------------------------------------------------------------- */

type Supa = Awaited<ReturnType<typeof createClient>>;

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

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fecha(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();

  const s = String(v).trim();
  // dd-mm-yyyy y dd/mm/yyyy: formato chileno, se interpreta día primero
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})([ T](\d{1,2}):(\d{2})(:(\d{2}))?)?/);
  if (m) {
    const [, d, mes, a, , h = "0", min = "0", , seg = "0"] = m;
    return new Date(
      Date.UTC(+a, +mes - 1, +d, +h, +min, +seg),
    ).toISOString();
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function mapaEjecutivos(supabase: Supa, tenantId: string) {
  const { data } = await supabase
    .from("ejecutivo_alias")
    .select("alias_normalizado, ejecutivo_id")
    .eq("tenant_id", tenantId);
  return new Map((data ?? []).map((a) => [a.alias_normalizado, a.ejecutivo_id]));
}

/**
 * Conciliación de ejecutivos: el nombre entrante se normaliza y se busca
 * entre los alias conocidos. En los archivos reales el mismo ejecutivo
 * aparecía como "Francisca  Valenzuela" y "Francisca Valenzuela".
 */
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

/** Complementario y Catastrófico comparten meta; Oncológico va aparte. */
function agrupacionSugerida(claveNormalizada: string): string {
  if (claveNormalizada.includes("onco")) return "ONCO";
  if (
    claveNormalizada.includes("complementario") ||
    claveNormalizada.includes("catastrofico")
  ) {
    return "CM+CAT";
  }
  return "Sin clasificar";
}
