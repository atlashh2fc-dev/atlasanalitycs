import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { getContexto } from "@/lib/datos";
import { hayCredenciales } from "@/lib/supabase/client";
import { PanelAutomatico } from "./panel-automatico";

export const dynamic = "force-dynamic";

export default async function Analisis({
  searchParams,
}: {
  searchParams: Promise<{ dataset?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const supabase = await createClient();
  const { data: datasets } = ctx.tenantId
    ? await supabase
        .from("dataset")
        .select("id, nombre, descripcion, created_at")
        .eq("activo", true)
        .order("updated_at", { ascending: false })
    : { data: [] };

  const sp = await searchParams;
  const seleccionado =
    (datasets ?? []).find((d) => d.id === sp.dataset) ?? datasets?.[0] ?? null;

  return (
    <>
      <Nav email={ctx.email} />
      <main className="mx-auto max-w-[1560px] px-6 py-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="etiqueta">Análisis adaptable</p>
            <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
              {seleccionado?.nombre ?? "Tu análisis"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Atlas construye esta lectura con las métricas, categorías y fechas
              que encontró en tu base.
            </p>
          </div>

          {(datasets?.length ?? 0) > 1 ? (
            <form className="pildora">
              <label htmlFor="dataset" className="text-xs text-[var(--text-muted)]">
                Base
              </label>
              <select id="dataset" name="dataset" defaultValue={seleccionado?.id}>
                {datasets?.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
              <button type="submit" className="text-xs font-semibold text-[var(--series-1)]">
                Ver
              </button>
            </form>
          ) : null}
        </div>

        {seleccionado ? (
          <PanelAutomatico datasetId={seleccionado.id} />
        ) : (
          <div className="vidrio rounded-2xl border-dashed px-6 py-16 text-center">
            <p className="text-base font-semibold">Primero carga una base</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
              Puede ser Excel, CSV o XLS. No necesitas ordenar sus columnas antes:
              Atlas interpreta la estructura y propone el análisis.
            </p>
            <Link
              href="/cargar"
              className="mt-5 inline-flex rounded-full bg-[var(--series-1)] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Cargar mi primera base
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
