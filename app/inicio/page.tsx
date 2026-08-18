import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Database,
  Sparkles,
  Upload,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { CampanaCard } from "@/components/datos/dataset-card";
import { EstadoVacioDatos } from "@/components/datos/estado-vacio";
import { getContexto } from "@/lib/datos";
import { obtenerResumenCampanas } from "@/lib/datasets-ui";
import { hayCredenciales } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const campanas = ctx.tenantId ? await obtenerResumenCampanas() : [];
  const filas = campanas.reduce((total, campana) => total + campana.filas, 0);

  return (
    <>
      <Nav email={ctx.email} />
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="etiqueta">Tu espacio de trabajo</p>
            <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
              Tus datos, primero
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
              Trabaja por campaña: cada archivo diario se suma al mismo historial
              y alimenta sus indicadores sin crear contenedores separados.
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
          <>
            <section className="mt-7 grid gap-3 sm:grid-cols-3">
              <Resumen
                icono={Database}
                etiqueta="Campañas activas"
                valor={String(campanas.length)}
              />
              <Resumen
                icono={BarChart3}
                etiqueta="Registros disponibles"
                valor={new Intl.NumberFormat("es-CL").format(filas)}
              />
              <Resumen
                icono={Sparkles}
                etiqueta="Interpretación"
                valor="Automática"
              />
            </section>

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Campañas</h2>
                <Link
                  href="/datos"
                  className="flex items-center gap-1 text-xs font-medium text-[var(--series-1)]"
                >
                  Ver todas <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {campanas.slice(0, 4).map((campana) => (
                  <CampanaCard key={campana.id} campana={campana} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Resumen({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: typeof Database;
  etiqueta: string;
  valor: string;
}) {
  return (
    <div className="rounded-2xl border bg-[var(--surface-0)] p-4">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Icono className="size-3.5" />
        <p className="etiqueta">{etiqueta}</p>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight">{valor}</p>
    </div>
  );
}
