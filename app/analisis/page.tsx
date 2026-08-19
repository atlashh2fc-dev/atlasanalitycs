import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { Panel, type WidgetGuardado } from "@/components/panel/panel";
import DashboardLegacy from "@/app/dashboard/page";
import { getContexto } from "@/lib/datos";
import type { CatalogoDataset } from "@/lib/panel-dataset";
import { hayCredenciales } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Analisis({
  searchParams,
}: {
  searchParams: Promise<{ dataset?: string; campana?: string; desde?: string; hasta?: string; foco?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");
  const { dataset: datasetId, campana, desde, hasta, foco } = await searchParams;

  // Sin contexto explícito se conserva exactamente el panel personal legacy
  // de Seguros, con sus widgets, metas y filtros de campaña.
  if (!datasetId) {
    return <DashboardLegacy searchParams={Promise.resolve({ campana, desde, hasta, foco })} />;
  }

  const ctx = await getContexto();
  if (!ctx.tenantId || !ctx.userId) redirect("/cargar");
  const supabase = await createClient();

  const [{ data: datasets }, { data: catalogo, error: errorCatalogo }] = await Promise.all([
    supabase
      .from("dataset")
      .select("id,nombre,descripcion")
      .eq("activo", true)
      .order("updated_at", { ascending: false }),
    supabase.rpc("catalogo_dataset", { p_dataset: datasetId }),
  ]);

  if (errorCatalogo || !catalogo) redirect("/analisis");

  const { data: panelId, error: errorPanel } = await supabase.rpc(
    "obtener_o_crear_panel_dataset",
    { p_dataset: datasetId },
  );
  if (errorPanel || !panelId) {
    throw new Error(errorPanel?.message ?? "No se pudo preparar el panel de la base.");
  }

  const { data: widgets } = await supabase
    .from("panel_widget")
    .select("id,tipo,titulo,config,x,y,w,h")
    .eq("panel_id", panelId)
    .order("orden");

  const catalogoTipado = catalogo as unknown as CatalogoDataset;
  // Algunas versiones del RPC separan las fechas de `dimensiones`; la UI
  // siempre debe ofrecerlas como ejes temporales configurables.
  catalogoTipado.dimensiones = [
    ...catalogoTipado.dimensiones,
    ...catalogoTipado.campos.filter(
      (campo) =>
        (campo.rol === "fecha" || campo.tipo === "fecha") &&
        !catalogoTipado.dimensiones.some((dimension) => dimension.id === campo.id),
    ),
  ];
  // Si la base no declara periodo, se consulta completa. Usar el mes actual
  // como valor implícito hacía que bases históricas aparecieran vacías.
  const rango = {
    desde: catalogoTipado.resumen.desde ?? "",
    hasta: catalogoTipado.resumen.hasta ?? "",
  };

  return (
    <>
      <Nav email={ctx.email} />
      <main className="mx-auto max-w-[1400px] px-5 py-3">
        <div className="mb-3">
          <div>
            <p className="etiqueta">Explorador de base</p>
            <h1 className="mt-0.5 text-[20px] font-semibold leading-none tracking-[-0.025em]">
              {catalogoTipado.dataset.nombre}
            </h1>
            <p className="mt-1.5 text-[12px] text-[var(--text-secondary)]">
              Vista independiente para explorar campos de una carga · {Number(catalogoTipado.resumen.filas ?? 0).toLocaleString("es-CL")} registros
            </p>
          </div>

        </div>

        <Panel
          key={`dataset:${datasetId}`}
          panelId={panelId as string}
          widgetsIniciales={(widgets ?? []) as unknown as WidgetGuardado[]}
          campanas={ctx.campanas}
          fuentesDisponibles={{ dataset: Number(catalogoTipado.resumen.filas ?? 0) }}
          rangoInicial={{ desde: rango.desde, hasta: rango.hasta }}
          catalogoDataset={catalogoTipado}
          datasets={datasets ?? []}
        />
      </main>
    </>
  );
}
