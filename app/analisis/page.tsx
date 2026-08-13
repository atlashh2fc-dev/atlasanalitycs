import Link from "next/link";
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
  searchParams: Promise<{ dataset?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");
  const { dataset: datasetId } = await searchParams;

  // Sin contexto explícito se conserva exactamente el panel personal legacy
  // de Seguros, con sus widgets, metas y filtros de campaña.
  if (!datasetId) return <DashboardLegacy />;

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
      <main className="mx-auto max-w-[1560px] px-6 py-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="etiqueta">Análisis de base</p>
            <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
              {catalogoTipado.dataset.nombre}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Panel configurable · {Number(catalogoTipado.resumen.filas ?? 0).toLocaleString("es-CL")} registros
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form className="pildora">
              <label htmlFor="dataset" className="text-xs text-[var(--text-muted)]">Base</label>
              <select id="dataset" name="dataset" defaultValue={datasetId}>
                {(datasets ?? []).map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.nombre}</option>
                ))}
              </select>
              <button type="submit" className="text-xs font-semibold text-[var(--series-1)]">Ver</button>
            </form>
            <Link href="/analisis" className="pildora text-xs font-semibold">
              Panel de Seguros
            </Link>
          </div>
        </div>

        <Panel
          panelId={panelId as string}
          widgetsIniciales={(widgets ?? []) as unknown as WidgetGuardado[]}
          campanas={[]}
          fuentesDisponibles={{ dataset: Number(catalogoTipado.resumen.filas ?? 0) }}
          rangoInicial={{ desde: rango.desde, hasta: rango.hasta }}
          catalogoDataset={catalogoTipado}
        />
      </main>
    </>
  );
}
