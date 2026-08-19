import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Layers3, Settings2, Upload } from "lucide-react";
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
      <main className="mx-auto max-w-[1200px] px-5 py-4">
        <div>
          <div>
            <p className="etiqueta">Gobierno de datos</p>
            <h1 className="mt-1 text-[23px] font-semibold leading-none tracking-[-0.03em]">
              Datos y calidad
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Controla fuentes, cobertura, frescura, calidad e historial de cargas.
              Los parámetros del negocio y los usuarios viven en Administración.
            </p>
          </div>
        </div>

        <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--series-1)_35%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--series-1)_7%,var(--surface-0))] p-4 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--series-1)_16%,transparent)] text-[var(--series-1)]"><Layers3 className="size-5" /></span>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">La campaña es el contenedor permanente</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              No crees una campaña por archivo. Elige abajo la campaña correcta y usa <strong>Agregar datos</strong>: cada archivo nuevo se acumula en su historial y actualiza Control y Análisis sin borrar lo anterior.
            </p>
          </div>
        </section>

        <nav className="mt-5 flex flex-wrap items-center gap-2 border-y border-[var(--vidrio-borde)] py-3" aria-label="Acciones de datos">
          {[
            { t: "Agregar datos", icono: Upload, href: "#campanas" },
            { t: "Analizar operación", icono: BarChart3, href: "/analisis" },
            { t: "Administrar reglas", icono: Settings2, href: "/administracion" },
          ].map((paso) => {
            const Icono = paso.icono;
            return (
              <Link key={paso.t} href={paso.href} className="pildora text-xs font-medium">
                <Icono className="size-3.5 text-[var(--series-1)]" />
                {paso.t}
              </Link>
            );
          })}
        </nav>

        {campanas.length === 0 ? (
          <div className="mt-8">
            <EstadoVacioDatos />
          </div>
        ) : (
          <div id="campanas" className="mt-7 grid scroll-mt-24 gap-4 md:grid-cols-2">
            {campanas.map((campana) => (
              <CampanaCard key={campana.id} campana={campana} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
