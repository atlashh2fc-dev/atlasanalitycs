import Link from "next/link";
import { redirect } from "next/navigation";
import { Upload } from "lucide-react";
import { Nav } from "@/components/nav";
import { DatasetCard } from "@/components/datos/dataset-card";
import { EstadoVacioDatos } from "@/components/datos/estado-vacio";
import { getContexto } from "@/lib/datos";
import { obtenerResumenDatasets } from "@/lib/datasets-ui";
import { hayCredenciales } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default async function Datos() {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const datasets = ctx.tenantId ? await obtenerResumenDatasets() : [];

  return (
    <>
      <Nav email={ctx.email} />
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="etiqueta">Datos</p>
            <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
              Tus bases
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Cada base reúne su estructura, calidad, historial de cargas y
              análisis. Puedes actualizarla sin volver a configurar sus campos.
            </p>
          </div>
          {datasets.length > 0 ? (
            <Link
              href="/cargar"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white"
            >
              <Upload className="size-4" /> Cargar una base
            </Link>
          ) : null}
        </div>

        {datasets.length === 0 ? (
          <div className="mt-8">
            <EstadoVacioDatos />
          </div>
        ) : (
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {datasets.map((dataset) => (
              <DatasetCard key={dataset.id} dataset={dataset} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
