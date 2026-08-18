import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import {
  Tablero,
  type Equilibrio,
  type FilaEconomia,
  type FilaLinea,
  type Indicador,
} from "@/components/bsc/tablero";
import { Control, type FilaControl } from "@/components/bsc/control";
import { Decisiones, type ControlCalidad } from "@/components/bsc/decisiones";
import { type EtapaEmbudo } from "@/components/bsc/embudo";
import { type PuntoProyeccion } from "@/components/bsc/proyeccion";
import { hayCredenciales } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import { getContexto, rangoMes } from "@/lib/datos";

export const dynamic = "force-dynamic";

function isoUTC(fecha: Date) {
  return fecha.toISOString().slice(0, 10);
}

function periodoAnterior(desde: string, hasta: string) {
  const inicio = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  const dias = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1);
  const finAnterior = new Date(inicio.getTime() - 86_400_000);
  const inicioAnterior = new Date(finAnterior.getTime() - (dias - 1) * 86_400_000);
  return { desde: isoUTC(inicioAnterior), hasta: isoUTC(finAnterior) };
}

/**
 * Cuadro de mando integral.
 *
 * A diferencia del panel armable, este tablero no se configura: tiene
 * una estructura fija porque su valor está justamente en la estructura.
 * Las cuatro perspectivas se leen de abajo hacia arriba —personas
 * habilita procesos, procesos mejora la relación con el cliente, y eso
 * termina en el resultado financiero—, y esa cadena se pierde si cada
 * quien arma las tarjetas a su gusto.
 */
export default async function CuadroDeMando({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; campana?: string; comparar?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  if (!ctx.tenantId) redirect("/mantenedor");

  const sp = await searchParams;
  const rango = rangoMes();
  const desde = sp.desde ?? rango.desde;
  const hasta = sp.hasta ?? rango.hasta;
  const campana = sp.campana ?? null;
  const comparar = sp.comparar !== "no";
  const anterior = periodoAnterior(desde, hasta);

  const supabase = await createClient();

  const [
    { data: indicadores },
    { data: economia },
    { data: lineas },
    { data: equilibrio },
    { data: control },
    { data: proyeccion },
    { data: embudo },
    { data: indicadoresAnteriores },
    { data: calidad },
  ] = await Promise.all([
      supabase.rpc("bsc_periodo", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
      supabase.rpc("economia_ejecutivo", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
      supabase.rpc("ingreso_periodo", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
      supabase.rpc("punto_equilibrio", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
      supabase.rpc("control_ejecutivo", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
      supabase.rpc("proyeccion_cierre", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
      supabase.rpc("embudo_periodo", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
      supabase.rpc("bsc_periodo", {
        p_desde: anterior.desde,
        p_hasta: anterior.hasta,
        p_campana: campana,
      }),
      supabase.rpc("calidad_bsc", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
    ]);

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1560px] px-6 py-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="etiqueta">Contact center · gestión de venta</p>
            <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
              Cuadro de mando integral
            </h1>
          </div>

          <form className="flex flex-wrap items-center gap-2.5">
            <label className="pildora cursor-pointer">
              <input
                type="date"
                name="desde"
                defaultValue={desde}
                aria-label="Desde"
                className="tabular"
              />
              <span className="text-[var(--text-muted)]">→</span>
              <input
                type="date"
                name="hasta"
                defaultValue={hasta}
                aria-label="Hasta"
                className="tabular"
              />
            </label>

            {ctx.campanas.length > 1 ? (
              <label className="pildora cursor-pointer">
                <select name="campana" defaultValue={campana ?? ""} aria-label="Campaña">
                  <option value="">Todas las campañas</option>
                  {ctx.campanas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="pildora cursor-pointer">
              <select name="comparar" defaultValue={comparar ? "si" : "no"} aria-label="Comparación">
                <option value="si">Vs. período anterior</option>
                <option value="no">Sin comparación</option>
              </select>
            </label>

            <button
              type="submit"
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-white"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--tono-venta) 92%, white), color-mix(in srgb, var(--tono-cotizacion) 80%, black))",
              }}
            >
              Aplicar
            </button>
          </form>
        </div>

        <Tablero
          indicadores={(indicadores ?? []) as unknown as Indicador[]}
          economia={(economia ?? []) as unknown as FilaEconomia[]}
          lineas={(lineas ?? []) as unknown as FilaLinea[]}
          equilibrio={
            ((equilibrio ?? [])[0] as unknown as Equilibrio | undefined) ?? null
          }
          proyeccion={(proyeccion ?? []) as unknown as PuntoProyeccion[]}
          embudo={(embudo ?? []) as unknown as EtapaEmbudo[]}
          periodo={{ desde, hasta }}
          indicadoresAnteriores={comparar ? (indicadoresAnteriores ?? []) as unknown as Indicador[] : []}
          periodoAnterior={comparar ? anterior : null}
        />

        <section className="mt-8 space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="etiqueta shrink-0 text-[var(--text-muted)]">4</span>
            <h2 className="text-[15px] font-semibold tracking-tight">
              Gestión del equipo
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              ¿Dónde intervenir primero?
            </span>
            <span className="h-px flex-1 bg-[var(--vidrio-borde)]" />
          </div>
          <Control filas={(control ?? []) as unknown as FilaControl[]} />
        </section>

        <section className="mt-8 space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="etiqueta shrink-0 text-[var(--text-muted)]">5</span>
            <h2 className="text-[15px] font-semibold tracking-tight">Decisiones y seguimiento</h2>
            <span className="text-xs text-[var(--text-muted)]">¿Qué hacemos ahora y quién lo toma?</span>
            <span className="h-px flex-1 bg-[var(--vidrio-borde)]" />
          </div>
          <Decisiones
            calidad={(calidad ?? []) as unknown as ControlCalidad[]}
            control={(control ?? []) as unknown as FilaControl[]}
            proyeccion={(proyeccion ?? []) as unknown as PuntoProyeccion[]}
            campanaId={campana}
          />
        </section>
      </main>
    </>
  );
}
