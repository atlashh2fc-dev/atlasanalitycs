import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import {
  Tablero,
  type CostoCierre,
  type Equilibrio,
  type FilaLinea,
  type Indicador,
  type ProyeccionPorLinea,
} from "@/components/bsc/tablero";
import { Control, type FilaControl } from "@/components/bsc/control";
import { type EtapaEmbudo } from "@/components/bsc/embudo";
import { type PuntoProyeccion } from "@/components/bsc/proyeccion";
import {
  ComparacionSemanal,
  type SemanaComparacion,
} from "@/components/bsc/semanas";
import { hayCredenciales } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import { getContexto, rangoMes } from "@/lib/datos";

export const dynamic = "force-dynamic";

function isoUTC(fecha: Date) {
  return fecha.toISOString().slice(0, 10);
}

function cierreDelMes(fecha: string) {
  const base = new Date(`${fecha}T12:00:00Z`);
  return isoUTC(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 12)));
}

function rangoDeMes(mes: string, hoy = new Date()) {
  const [anio, numeroMes] = mes.split("-").map(Number);
  const desde = isoUTC(new Date(Date.UTC(anio, numeroMes - 1, 1, 12)));
  const cierre = isoUTC(new Date(Date.UTC(anio, numeroMes, 0, 12)));
  const hoyIso = isoUTC(hoy);
  return { desde, hasta: hoyIso >= desde && hoyIso <= cierre ? hoyIso : cierre, cierre };
}

function mesAnterior(mes: string) {
  const [anio, numeroMes] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, numeroMes - 2, 1, 12));
  return rangoDeMes(fecha.toISOString().slice(0, 7), new Date("9999-12-31T12:00:00Z"));
}

function semanasDelRango(desde: string, hasta: string) {
  const semanas: { desde: string; hasta: string; etiqueta: string }[] = [];
  let cursor = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  let numero = 1;
  while (cursor <= fin) {
    const finSemana = new Date(Math.min(
      fin.getTime(),
      cursor.getTime() + (7 - (cursor.getUTCDay() || 7)) * 86_400_000,
    ));
    semanas.push({
      desde: isoUTC(cursor),
      hasta: isoUTC(finSemana),
      etiqueta: `Semana ${numero++}`,
    });
    cursor = new Date(finSemana.getTime() + 86_400_000);
  }
  return semanas;
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
  searchParams: Promise<{ mes?: string; desde?: string; hasta?: string; campana?: string; comparar?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  if (!ctx.tenantId) redirect("/administracion");

  const sp = await searchParams;
  const rango = rangoMes();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : rango.desde.slice(0, 7);
  const rangoSeleccionado = rangoDeMes(mes);
  const desde = sp.mes ? rangoSeleccionado.desde : sp.desde ?? rangoSeleccionado.desde;
  const hasta = sp.mes ? rangoSeleccionado.hasta : sp.hasta ?? rangoSeleccionado.hasta;
  const campana = sp.campana ?? null;
  const comparar = sp.comparar !== "no";
  const anterior = mesAnterior(mes);
  const cierre = cierreDelMes(hasta);
  const semanas = semanasDelRango(desde, hasta);
  const contextoAnalisis = new URLSearchParams({ desde, hasta });
  if (campana) contextoAnalisis.set("campana", campana);

  const supabase = await createClient();

  const { data: periodosDisponibles } = await supabase
    .from("periodo")
    .select("fecha_inicio, etiqueta")
    .eq("tipo", "mes")
    .order("fecha_inicio", { ascending: false });

  const [
    { data: indicadores },
    { data: lineas },
    { data: equilibrio },
    { data: control },
    { data: proyeccion },
    { data: proyeccionesLinea },
    { data: embudo },
    { data: indicadoresAnteriores },
    { data: costosCierre },
  ] = await Promise.all([
      supabase.rpc("bsc_periodo", {
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
        p_hasta: cierre,
        p_campana: campana,
      }),
      supabase.rpc("proyeccion_cierre", {
        p_desde: desde,
        p_corte: hasta,
        p_cierre: cierre,
        p_campana: campana,
      }),
      supabase.rpc("proyeccion_cierre_por_linea", {
        p_desde: desde,
        p_corte: hasta,
        p_cierre: cierre,
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
      supabase.rpc("costos_periodo", {
        p_desde: desde,
        p_hasta: cierre,
        p_campana: campana,
      }),
    ]);

  const resultadosSemanales = await Promise.all(
    semanas.map((semana) =>
      supabase.rpc("bsc_periodo", {
        p_desde: semana.desde,
        p_hasta: semana.hasta,
        p_campana: campana,
      }),
    ),
  );
  const comparacionSemanal: SemanaComparacion[] = semanas.map((semana, indice) => ({
    ...semana,
    indicadores: (resultadosSemanales[indice].data ?? []) as unknown as Indicador[],
  }));

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
              <span className="text-[var(--text-muted)]">Mes</span>
              <select name="mes" defaultValue={mes} aria-label="Mes del dashboard">
                {!(periodosDisponibles ?? []).some((p) => p.fecha_inicio?.slice(0, 7) === mes) ? (
                  <option value={mes}>{mes}</option>
                ) : null}
                {(periodosDisponibles ?? []).map((p) => (
                  <option key={p.fecha_inicio} value={p.fecha_inicio.slice(0, 7)}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
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
          lineas={(lineas ?? []) as unknown as FilaLinea[]}
          equilibrio={
            ((equilibrio ?? [])[0] as unknown as Equilibrio | undefined) ?? null
          }
          proyeccion={(proyeccion ?? []) as unknown as PuntoProyeccion[]}
          proyeccionesLinea={(proyeccionesLinea ?? []) as unknown as ProyeccionPorLinea[]}
          embudo={(embudo ?? []) as unknown as EtapaEmbudo[]}
          indicadoresAnteriores={comparar ? (indicadoresAnteriores ?? []) as unknown as Indicador[] : []}
          analysisQuery={contextoAnalisis.toString()}
          costosCierre={(costosCierre ?? []) as unknown as CostoCierre[]}
        />

        <ComparacionSemanal semanas={comparacionSemanal} />

        <section className="mt-8 space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="etiqueta shrink-0 text-[var(--text-muted)]">4</span>
            <h2 className="text-[15px] font-semibold tracking-tight">Gestión del equipo</h2>
            <span className="text-xs text-[var(--text-muted)]">Meta, ritmo, forecast y equilibrio en una sola vista</span>
            <span className="h-px flex-1 bg-[var(--vidrio-borde)]" />
          </div>
          <Control filas={(control ?? []) as unknown as FilaControl[]} />
        </section>

      </main>
    </>
  );
}
