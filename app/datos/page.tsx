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
      <main className="mx-auto max-w-[1400px] px-5 py-3">
        <div>
          <div>
            <p className="etiqueta">Gobierno de datos</p>
            <h1 className="mt-0.5 text-[20px] font-semibold leading-none tracking-[-0.025em]">
              Datos y calidad
            </h1>
            <p className="mt-1.5 max-w-2xl text-[12px] text-[var(--text-secondary)]">
              Controla fuentes, cobertura, frescura, calidad e historial de cargas.
              Los parámetros del negocio y los usuarios viven en Administración.
            </p>
          </div>
        </div>

        <section className="mt-3 flex gap-2 rounded-lg border border-[color-mix(in_srgb,var(--series-1)_35%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--series-1)_7%,var(--surface-0))] px-3 py-2 sm:items-center">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--series-1)_16%,transparent)] text-[var(--series-1)]"><Layers3 className="size-3.5" /></span>
          <div className="flex-1">
            <h2 className="text-[11px] font-semibold">La campaña es el contenedor permanente</h2>
            <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
              Agrega cada archivo a su campaña: se acumula en el historial y actualiza Control y Análisis.
            </p>
          </div>
        </section>

        <nav className="mt-2 flex flex-wrap items-center gap-1.5 border-b border-[var(--vidrio-borde)] pb-2" aria-label="Acciones de datos">
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
          <div id="campanas" className="mt-3 grid scroll-mt-24 gap-2">
            {campanas.map((campana) => (
              <CampanaCard key={campana.id} campana={campana} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
