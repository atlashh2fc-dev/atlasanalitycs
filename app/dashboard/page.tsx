import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Panel, type WidgetGuardado } from "@/components/panel/panel";
import { hayCredenciales } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import { getContexto, rangoMes } from "@/lib/datos";
import type { ConfigWidget, TipoWidget } from "@/lib/widgets";

export const dynamic = "force-dynamic";

/**
 * Tarjetas con las que arranca un panel nuevo.
 *
 * No es una plantilla decorativa: es el pack de gestión de venta
 * outbound. El usuario puede moverlas, redimensionarlas o borrarlas, y
 * agregar las suyas.
 */
const SEMILLA: {
  tipo: TipoWidget;
  titulo: string;
  config: ConfigWidget;
  x: number;
  y: number;
  w: number;
  h: number;
}[] = [
  {
    tipo: "kpi",
    titulo: "Asegurados del periodo",
    config: { fuente: "venta", metrica: "asegurados", objetivo: 310 },
    x: 0, y: 0, w: 3, h: 3,
  },
  {
    tipo: "kpi",
    titulo: "Contratos",
    config: { fuente: "venta", metrica: "contratos" },
    x: 3, y: 0, w: 3, h: 3,
  },
  {
    tipo: "kpi",
    titulo: "UF vendida",
    config: { fuente: "venta", metrica: "uf" },
    x: 6, y: 0, w: 3, h: 3,
  },
  {
    tipo: "kpi",
    titulo: "Cotizaciones",
    config: { fuente: "cotizacion", metrica: "cotizaciones" },
    x: 9, y: 0, w: 3, h: 3,
  },
  {
    tipo: "barras",
    titulo: "Asegurados por agrupación de meta",
    config: { fuente: "venta", metrica: "asegurados", dimension: "agrupacion", limite: 8, orden: "desc" },
    x: 0, y: 3, w: 6, h: 5,
  },
  {
    tipo: "barras_horizontal",
    titulo: "Asegurados por ejecutivo",
    config: { fuente: "venta", metrica: "asegurados", dimension: "ejecutivo", limite: 12, orden: "desc" },
    x: 6, y: 3, w: 6, h: 7,
  },
  {
    tipo: "area",
    titulo: "Evolución diaria de asegurados",
    config: { fuente: "venta", metrica: "asegurados", dimension: "fecha", granularidad: "dia" },
    x: 0, y: 8, w: 6, h: 5,
  },
  {
    tipo: "dona",
    titulo: "Mix de producto",
    config: { fuente: "venta", metrica: "asegurados", dimension: "producto", limite: 6, orden: "desc" },
    x: 6, y: 10, w: 6, h: 5,
  },
];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ campana?: string; desde?: string; hasta?: string; foco?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const supabase = await createClient();
  const { campana: campanaSolicitada, desde, hasta, foco } = await searchParams;

  if (!ctx.tenantId) {
    return (
      <>
        <Nav email={ctx.email} />
        <main className="mx-auto max-w-[700px] px-6 py-10">
          <div className="vidrio rounded-2xl border-dashed p-8 text-center">
            <p className="text-sm font-medium">Falta crear tu organización</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Es un paso de una sola vez.
            </p>
            <Link
              href="/cargar"
              className="mt-4 inline-block rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white"
            >
              Empezar
            </Link>
          </div>
        </main>
      </>
    );
  }

  // Panel personal del usuario; se crea con el pack la primera vez.
  let { data: panel } = await supabase
    .from("panel")
    .select("id")
    .eq("perfil_id", ctx.userId!)
    .is("dataset_id", null)
    .maybeSingle();

  if (!panel) {
    const { data: creado } = await supabase
      .from("panel")
      .insert({
        tenant_id: ctx.tenantId,
        perfil_id: ctx.userId,
        nombre: "Mi panel",
        es_default: true,
      })
      .select("id")
      .single();

    panel = creado;

    if (panel) {
      await supabase.from("panel_widget").insert(
        SEMILLA.map((s, i) => ({
          panel_id: panel!.id,
          tipo: s.tipo,
          titulo: s.titulo,
          config: s.config,
          x: s.x,
          y: s.y,
          w: s.w,
          h: s.h,
          orden: i,
        })),
      );
    }
  }

  const { data: widgets } = await supabase
    .from("panel_widget")
    .select("id, tipo, titulo, config, x, y, w, h")
    .eq("panel_id", panel?.id ?? "")
    .order("orden");

  // Sólo se ofrecen en el asistente las fuentes que tienen datos.
  const [venta, cotizacion, gestion, agendamiento, asistencia, cliente, datasets] = await Promise.all([
    supabase.from("venta").select("id", { count: "exact", head: true }),
    supabase.from("cotizacion").select("id", { count: "exact", head: true }),
    supabase.from("gestion").select("id", { count: "exact", head: true }),
    supabase.from("agendamiento").select("id", { count: "exact", head: true }),
    supabase.from("asistencia").select("id", { count: "exact", head: true }),
    supabase.from("cliente").select("id", { count: "exact", head: true }),
    supabase
      .from("dataset")
      .select("id,nombre")
      .eq("activo", true)
      .order("nombre"),
  ]);

  const campanaInicial = ctx.campanas.some((campana) => campana.id === campanaSolicitada)
    ? campanaSolicitada ?? null
    : null;

  const rango = rangoMes();
  const rangoPanel = { desde: desde ?? rango.desde, hasta: hasta ?? rango.hasta };
  const parametrosControl = new URLSearchParams(rangoPanel);
  if (campanaInicial) parametrosControl.set("campana", campanaInicial);

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1400px] px-6 py-4">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="etiqueta">Zoom operativo personalizable</p>
            <h1 className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.03em]">Análisis operativo</h1>
            <p className="mt-1.5 max-w-2xl text-[12px] text-[var(--text-secondary)]">
              Elige los KPI que te sirven, combínalos y ordena el panel según tu gestión. Las tarjetas y su disposición se guardan para tu usuario.
            </p>
            {foco ? <p className="mt-2 text-xs font-medium capitalize text-[var(--tono-venta)]">Contexto heredado desde {foco}</p> : null}
          </div>
          <Link href={`/bsc?${parametrosControl}`} className="pildora text-xs font-medium">Volver a Control</Link>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--vidrio-borde)] bg-[var(--surface-1)] px-3.5 py-2 text-[11px]">
          <span><span className="text-[var(--text-muted)]">Origen</span> <strong>Control</strong></span>
          <span><span className="text-[var(--text-muted)]">Perspectiva</span> <strong className="capitalize">{foco ?? "Operación completa"}</strong></span>
          <span><span className="text-[var(--text-muted)]">Periodo</span> <strong className="tabular">{rangoPanel.desde} → {rangoPanel.hasta}</strong></span>
          <span><span className="text-[var(--text-muted)]">Campaña</span> <strong>{campanaInicial ? ctx.campanas.find((item) => item.id === campanaInicial)?.nombre ?? "Seleccionada" : "Todas"}</strong></span>
        </div>

        <Panel
          key="campanas"
          panelId={panel?.id ?? ""}
          widgetsIniciales={(widgets ?? []) as unknown as WidgetGuardado[]}
          campanas={ctx.campanas}
          fuentesDisponibles={{
            venta: venta.count ?? 0,
            cotizacion: cotizacion.count ?? 0,
            operacion: (gestion.count ?? 0) + (cotizacion.count ?? 0) + (venta.count ?? 0),
            agendamiento: agendamiento.count ?? 0,
            asistencia: asistencia.count ?? 0,
            cliente: cliente.count ?? 0,
          }}
          rangoInicial={rangoPanel}
          datasets={datasets.data ?? []}
          campanaInicial={campanaInicial}
        />
      </main>
    </>
  );
}
