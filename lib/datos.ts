import { createClient } from "@/lib/supabase/server";
import { diasHabiles } from "@/lib/utils";
import type { FilaCumplimiento } from "@/components/charts/cumplimiento";
import type { PuntoEjecutivo } from "@/components/charts/cuadrantes";
import type { FilaRanking } from "@/components/charts/ranking";
import type { FilaMovilidad } from "@/components/charts/movilidad";

export interface Contexto {
  userId: string | null;
  email: string | null;
  tenantId: string | null;
  esAdmin: boolean;
  campanas: { id: string; nombre: string }[];
}

export async function getContexto(): Promise<Contexto> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: null, email: null, tenantId: null, esAdmin: false, campanas: [] };
  }

  const [{ data: perfil }, { data: campanas }] = await Promise.all([
    supabase
      .from("perfil")
      .select("tenant_id, rol")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("campana")
      .select("id, nombre")
      .order("nombre"),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    tenantId: perfil?.tenant_id ?? null,
    esAdmin: perfil?.rol === "admin",
    campanas: campanas ?? [],
  };
}

export interface Rango {
  desde: string;
  hasta: string;
  finDeMes: string;
}

/** Mes en curso, o el mes de la última venta si el mes actual está vacío. */
export function rangoMes(fecha = new Date()): Rango {
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const fin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
  return {
    desde: iso(inicio),
    hasta: iso(fecha < fin ? fecha : fin),
    finDeMes: iso(fin),
  };
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export interface ResumenVentas {
  cumplimiento: FilaCumplimiento[];
  totales: {
    contratos: number;
    asegurados: number;
    cotizaciones: number;
    uf: number;
    tasaCierre: number | null;
    profundidad: number | null;
  };
  ejecutivos: PuntoEjecutivo[];
  ranking: FilaRanking[];
  medianaAsegurados: number;
  brechaOportunidad: number;
  coefVariacion: number | null;
  hayDatos: boolean;
}

export async function getResumenVentas(
  campanaId: string | null,
  rango: Rango,
): Promise<ResumenVentas> {
  const supabase = await createClient();

  let qVentas = supabase
    .from("venta")
    .select(
      "id, ejecutivo_id, n_asegurados, precio_uf, fecha_solicitud, producto:producto_id (agrupacion_meta, nombre)",
    )
    .gte("fecha_solicitud", rango.desde)
    .lte("fecha_solicitud", `${rango.hasta}T23:59:59`);

  let qCotiz = supabase
    .from("cotizacion")
    .select("id, ejecutivo_id")
    .gte("fecha", rango.desde)
    .lte("fecha", `${rango.hasta}T23:59:59`);

  let qMetas = supabase
    .from("meta")
    .select("agrupacion_meta, valor, dg_esperados, unidad")
    .lte("periodo_inicio", rango.hasta)
    .gte("periodo_fin", rango.desde);

  if (campanaId) {
    qVentas = qVentas.eq("campana_id", campanaId);
    qCotiz = qCotiz.eq("campana_id", campanaId);
    qMetas = qMetas.eq("campana_id", campanaId);
  }

  const [{ data: ventas }, { data: cotiz }, { data: metas }, { data: ejecutivos }, { data: asist }] =
    await Promise.all([
      qVentas,
      qCotiz,
      qMetas,
      supabase.from("ejecutivo").select("id, nombre_canonico").eq("activo", true),
      supabase
        .from("asistencia")
        .select("ejecutivo_id, marca")
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta),
    ]);

  const nombre = new Map((ejecutivos ?? []).map((e) => [e.id, e.nombre_canonico]));

  const dgPorEjecutivo = new Map<string, number>();
  for (const a of asist ?? []) {
    if (a.marca === "P" && a.ejecutivo_id) {
      dgPorEjecutivo.set(a.ejecutivo_id, (dgPorEjecutivo.get(a.ejecutivo_id) ?? 0) + 1);
    }
  }

  // Si no hay asistencia cargada, los días hábiles del rango sirven de piso
  const dgFallback = diasHabiles(new Date(rango.desde), new Date(rango.hasta));

  const cotizPorEjecutivo = new Map<string, number>();
  for (const c of cotiz ?? []) {
    if (c.ejecutivo_id) {
      cotizPorEjecutivo.set(c.ejecutivo_id, (cotizPorEjecutivo.get(c.ejecutivo_id) ?? 0) + 1);
    }
  }

  const agr = new Map<string, number>();
  const porEjecutivo = new Map<
    string,
    { asegurados: number; contratos: number; uf: number }
  >();

  let totalUf = 0;
  let totalAsegurados = 0;

  for (const v of ventas ?? []) {
    const producto = v.producto as unknown as { agrupacion_meta?: string } | null;
    const clave = producto?.agrupacion_meta ?? "Sin clasificar";
    agr.set(clave, (agr.get(clave) ?? 0) + (v.n_asegurados ?? 0));

    totalAsegurados += v.n_asegurados ?? 0;
    totalUf += Number(v.precio_uf ?? 0);

    if (v.ejecutivo_id) {
      const acc = porEjecutivo.get(v.ejecutivo_id) ?? {
        asegurados: 0,
        contratos: 0,
        uf: 0,
      };
      acc.asegurados += v.n_asegurados ?? 0;
      acc.contratos += 1;
      acc.uf += Number(v.precio_uf ?? 0);
      porEjecutivo.set(v.ejecutivo_id, acc);
    }
  }

  const habilesTranscurridos = diasHabiles(new Date(rango.desde), new Date(rango.hasta));
  const habilesMes = diasHabiles(new Date(rango.desde), new Date(rango.finDeMes));
  const avance = habilesMes > 0 ? habilesTranscurridos / habilesMes : 0;

  const cumplimiento: FilaCumplimiento[] = (metas ?? [])
    .filter((m) => m.agrupacion_meta)
    .map((m) => {
      const real = agr.get(m.agrupacion_meta!) ?? 0;
      return {
        agrupacion: m.agrupacion_meta!,
        asegurados: real,
        meta: Number(m.valor),
        ritmoEsperado: Number(m.valor) * avance,
        proyeccion: avance > 0 ? real / avance : 0,
      };
    });

  // Líneas con ventas pero sin meta configurada: se muestran igual
  for (const [clave, real] of agr) {
    if (!cumplimiento.some((c) => c.agrupacion === clave)) {
      cumplimiento.push({
        agrupacion: clave,
        asegurados: real,
        meta: 0,
        ritmoEsperado: 0,
        proyeccion: avance > 0 ? real / avance : 0,
      });
    }
  }

  const puntos: PuntoEjecutivo[] = [...porEjecutivo.entries()]
    .map(([id, v]) => {
      const dg = dgPorEjecutivo.get(id) ?? dgFallback;
      const cotizaciones = cotizPorEjecutivo.get(id) ?? 0;
      return {
        ejecutivo: nombre.get(id) ?? "Sin identificar",
        ipD: dg > 0 ? v.asegurados / dg : 0,
        ipC: cotizaciones > 0 ? v.asegurados / cotizaciones : 0,
        uf: v.uf,
        asegurados: v.asegurados,
        cotizaciones,
        dg,
      };
    })
    .sort((a, b) => b.asegurados - a.asegurados);

  const asegurados = puntos.map((p) => p.asegurados);
  const med = mediana(asegurados);
  const brecha = puntos
    .filter((p) => p.asegurados < med)
    .reduce((acc, p) => acc + (med - p.asegurados), 0);

  const cuartilDe = (valor: number) => {
    if (asegurados.length < 4) return null;
    const s = [...asegurados].sort((a, b) => a - b);
    const q1 = s[Math.floor(s.length * 0.25)];
    const q3 = s[Math.floor(s.length * 0.75)];
    if (valor <= q1) return 1;
    if (valor >= q3) return 4;
    return valor >= med ? 3 : 2;
  };

  const ranking: FilaRanking[] = puntos.map((p) => ({
    ejecutivo: p.ejecutivo,
    asegurados: p.asegurados,
    cuartil: cuartilDe(p.asegurados),
    ipD: p.ipD,
  }));

  const totalContratos = (ventas ?? []).length;
  const totalCotiz = (cotiz ?? []).length;

  return {
    cumplimiento: cumplimiento.sort((a, b) => b.meta - a.meta),
    totales: {
      contratos: totalContratos,
      asegurados: totalAsegurados,
      cotizaciones: totalCotiz,
      uf: totalUf,
      tasaCierre: totalCotiz > 0 ? totalContratos / totalCotiz : null,
      profundidad: totalContratos > 0 ? totalAsegurados / totalContratos : null,
    },
    ejecutivos: puntos,
    ranking,
    medianaAsegurados: med,
    brechaOportunidad: brecha,
    coefVariacion: coefVar(puntos.map((p) => p.ipD)),
    hayDatos: totalContratos > 0 || totalCotiz > 0,
  };
}

export async function getPeriodosMovilidad(): Promise<
  { fechaInicio: string; etiqueta: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("periodo")
    .select("fecha_inicio, etiqueta")
    .eq("tipo", "mes")
    .order("fecha_inicio", { ascending: false });

  return (data ?? []).map((p) => ({
    fechaInicio: p.fecha_inicio,
    etiqueta: p.etiqueta,
  }));
}

export async function getMovilidad(
  campanaId: string | null,
  mes: string | null,
): Promise<{
  filas: FilaMovilidad[];
  transicion: { de: number; a: number; ejecutivos: number }[];
}> {
  const supabase = await createClient();

  let q = supabase
    .from("v_movilidad_cuartil")
    .select(
      "ejecutivo_id, periodo_anterior, etiqueta, cuartil_anterior, cuartil_ip_d, delta_ip_d, movimiento, fecha_inicio",
    )
    .order("fecha_inicio", { ascending: false })
    .limit(500);

  if (campanaId) q = q.eq("campana_id", campanaId);
  else q = q.is("campana_id", null);
  if (mes) q = q.eq("fecha_inicio", `${mes}-01`);

  const [{ data: mov }, { data: ejec }] = await Promise.all([
    q,
    supabase.from("ejecutivo").select("id, nombre_canonico"),
  ]);

  const nombre = new Map((ejec ?? []).map((e) => [e.id, e.nombre_canonico]));

  // Si no se solicitó un mes, usa el último que tenga comparación válida.
  const ultimo = mes
    ? (mov ?? [])[0]?.etiqueta ?? null
    : (mov ?? []).find((m) => m.periodo_anterior)?.etiqueta ?? null;

  const filas: FilaMovilidad[] = (mov ?? [])
    .filter((m) => m.etiqueta === ultimo && m.periodo_anterior)
    .map((m) => ({
      ejecutivo: nombre.get(m.ejecutivo_id) ?? "Sin identificar",
      periodoAnterior: m.periodo_anterior,
      periodoActual: m.etiqueta,
      cuartilAnterior: m.cuartil_anterior,
      cuartilActual: m.cuartil_ip_d,
      deltaIpD: m.delta_ip_d === null ? null : Number(m.delta_ip_d),
      movimiento: m.movimiento,
    }));

  const mapa = new Map<string, number>();
  for (const f of filas) {
    if (f.cuartilAnterior && f.cuartilActual) {
      const k = `${f.cuartilAnterior}-${f.cuartilActual}`;
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
    }
  }

  const transicion = [...mapa.entries()].map(([k, ejecutivos]) => {
    const [de, a] = k.split("-").map(Number);
    return { de, a, ejecutivos };
  });

  return { filas, transicion };
}

function mediana(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function coefVar(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (media === 0) return null;
  const varianza =
    xs.reduce((acc, x) => acc + (x - media) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(varianza) / media;
}
