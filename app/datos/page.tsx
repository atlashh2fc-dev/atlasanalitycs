import Link from "next/link";
import { redirect } from "next/navigation";
import { Upload } from "lucide-react";
import { Nav } from "@/components/nav";
import { CampanaCard } from "@/components/datos/dataset-card";
import { EstadoVacioDatos } from "@/components/datos/estado-vacio";
import { getContexto } from "@/lib/datos";
import { obtenerResumenCampanas } from "@/lib/datasets-ui";
import { hayCredenciales } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default async function Datos() {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const campanas = ctx.tenantId ? await obtenerResumenCampanas() : [];

  return (
    <>
      <Nav email={ctx.email} />
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="etiqueta">Datos</p>
            <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
              Tus campañas
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Cada campaña reúne sus archivos diarios, equipo, usuarios,
              configuración e indicadores. Las nuevas cargas se acumulan en la
              misma campaña.
            </p>
          </div>
          {campanas.length > 0 ? (
            <Link
              href="/cargar"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white"
            >
              <Upload className="size-4" /> Nueva carga
            </Link>
          ) : null}
        </div>

        {campanas.length === 0 ? (
          <div className="mt-8">
            <EstadoVacioDatos />
          </div>
        ) : (
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {campanas.map((campana) => (
              <CampanaCard key={campana.id} campana={campana} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
