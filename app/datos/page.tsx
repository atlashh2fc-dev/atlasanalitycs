import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Settings2, ShieldCheck, Upload } from "lucide-react";
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
            <p className="etiqueta">Gobierno de datos</p>
            <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
              Datos y calidad
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
              Controla fuentes, cobertura, frescura, calidad e historial de cargas.
              Los parámetros del negocio y los usuarios viven en Administración.
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

        <section className="mt-7 grid gap-2 sm:grid-cols-4" aria-label="Flujo de puesta en marcha">
          {[
            { n: "1", t: "Administrar", d: "Campaña, equipo, metas y economía", icono: Settings2, href: "/administracion" },
            { n: "2", t: "Cargar", d: "Ventas, discador, cotizaciones y asistencia", icono: Upload, href: "/cargar" },
            { n: "3", t: "Validar", d: "Cobertura, calidad, errores y frescura", icono: ShieldCheck, href: "#campanas" },
            { n: "4", t: "Analizar", d: "KPI operativos elegidos por cada usuario", icono: BarChart3, href: "/analisis" },
          ].map((paso) => {
            const Icono = paso.icono;
            return (
              <Link key={paso.n} href={paso.href} className="rounded-xl border border-[var(--vidrio-borde)] bg-[var(--surface-0)] p-3 transition-colors hover:bg-[var(--vidrio)]">
                <div className="flex items-center gap-2"><span className="etiqueta">{paso.n}</span><Icono className="size-3.5 text-[var(--series-1)]" /><strong className="text-xs">{paso.t}</strong></div>
                <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-muted)]">{paso.d}</p>
              </Link>
            );
          })}
        </section>

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
