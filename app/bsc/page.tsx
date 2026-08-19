import { Suspense } from "react";
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
import { hayCredenciales } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import { getContexto, rangoMes } from "@/lib/datos";
import { GlassSelect, type GlassSelectOption } from "@/components/ui/glass-select";

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

async function ContenidoPrincipal({
  datos,
  comparar,
  analysisQuery,
}: {
  datos: Promise<any[]>;
  comparar: boolean;
  analysisQuery: string;
}) {
  const [
    { data: indicadores }, { data: lineas }, { data: equilibrio },
    { data: proyeccion }, { data: proyeccionesLinea }, { data: proyeccionesLineaAnterior },
    { data: embudo }, { data: indicadoresAnteriores }, { data: costosCierre },
  ] = await datos;
  return <>
    <Tablero
      indicadores={(indicadores ?? []) as Indicador[]}
      lineas={(lineas ?? []) as FilaLinea[]}
      equilibrio={((equilibrio ?? [])[0] as Equilibrio | undefined) ?? null}
      proyeccion={(proyeccion ?? []) as PuntoProyeccion[]}
      proyeccionesLinea={(proyeccionesLinea ?? []) as ProyeccionPorLinea[]}
      proyeccionesLineaAnterior={(proyeccionesLineaAnterior ?? []) as ProyeccionPorLinea[]}
      embudo={(embudo ?? []) as EtapaEmbudo[]}
      indicadoresAnteriores={comparar ? (indicadoresAnteriores ?? []) as Indicador[] : []}
      analysisQuery={analysisQuery}
      costosCierre={(costosCierre ?? []) as CostoCierre[]}
    />
  </>;
}

async function GestionEquipo({ datos }: { datos: PromiseLike<any> }) {
  const { data: control } = await datos;
  return <section className="mt-8 space-y-4">
    <div className="flex items-baseline gap-3">
      <span className="etiqueta shrink-0 text-[var(--text-muted)]">4</span>
      <h2 className="text-[15px] font-semibold tracking-tight">Gestión del equipo</h2>
      <span className="text-xs text-[var(--text-muted)]">Meta, ritmo, forecast y equilibrio en una sola vista</span>
      <span className="h-px flex-1 bg-[var(--vidrio-borde)]" />
    </div>
    <Control filas={(control ?? []) as FilaControl[]} />
  </section>;
}

function Cargando({ className = "h-40" }: { className?: string }) {
  return <div className={`mt-3 ${className} animate-pulse rounded-[10px] border border-[var(--vidrio-borde)] bg-[var(--surface-1)]`} />;
}

async function FiltrosControl({
  periodos,
  mes,
  campana,
  comparar,
  campanas,
}: {
  periodos: PromiseLike<{ data: { fecha_inicio: string; etiqueta: string }[] | null }>;
  mes: string;
  campana: string | null;
  comparar: boolean;
  campanas: { id: string; nombre: string }[];
}) {
  const { data: periodosDisponibles } = await periodos;
  return (
    <form className="flex flex-wrap items-center gap-2">
      <GlassSelect
        name="mes"
        defaultValue={mes}
        ariaLabel="Mes del dashboard"
        prefix="Mes"
        options={[
          ...(!(periodosDisponibles ?? []).some((p) => p.fecha_inicio?.slice(0, 7) === mes)
            ? [{ value: mes, label: mes }]
            : []),
          ...(periodosDisponibles ?? []).map((p) => ({
            value: p.fecha_inicio.slice(0, 7),
            label: p.etiqueta,
          })),
        ] satisfies GlassSelectOption[]}
      />
      {campanas.length > 1 ? (
        <GlassSelect
          name="campana"
          defaultValue={campana ?? ""}
          ariaLabel="Campaña"
          options={[
            { value: "", label: "Todas las campañas" },
            ...campanas.map((c) => ({ value: c.id, label: c.nombre })),
          ]}
        />
      ) : null}
      <GlassSelect
        name="comparar"
        defaultValue={comparar ? "si" : "no"}
        ariaLabel="Comparación"
        options={[
          { value: "si", label: "Vs. período anterior" },
          { value: "no", label: "Sin comparación" },
        ]}
      />
      <button type="submit" className="min-h-7 rounded-lg bg-[var(--series-1)] px-3 text-[11px] font-semibold text-white">
        Aplicar
      </button>
    </form>
  );
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

  const [ctx, sp] = await Promise.all([getContexto(), searchParams]);
  if (!ctx.tenantId) redirect("/administracion");
  const rango = rangoMes();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : rango.desde.slice(0, 7);
  const rangoSeleccionado = rangoDeMes(mes);
  const desde = sp.mes ? rangoSeleccionado.desde : sp.desde ?? rangoSeleccionado.desde;
  const hasta = sp.mes ? rangoSeleccionado.hasta : sp.hasta ?? rangoSeleccionado.hasta;
  const campana = sp.campana ?? null;
  const comparar = sp.comparar !== "no";
  const anterior = mesAnterior(mes);
  const cierre = cierreDelMes(hasta);
  const contextoAnalisis = new URLSearchParams({ desde, hasta });
  if (campana) contextoAnalisis.set("campana", campana);

  const supabase = await createClient();

  const periodosPromise = supabase
    .from("periodo")
    .select("fecha_inicio, etiqueta")
    .eq("tipo", "mes")
    .order("fecha_inicio", { ascending: false });

  const sinComparacion = Promise.resolve({ data: [] });

  const datosPrincipales = Promise.all([
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
      comparar ? supabase.rpc("proyeccion_cierre_por_linea", {
        p_desde: anterior.desde,
        p_corte: anterior.hasta,
        p_cierre: anterior.cierre,
        p_campana: campana,
      }) : sinComparacion,
      supabase.rpc("embudo_periodo", {
        p_desde: desde,
        p_hasta: hasta,
        p_campana: campana,
      }),
      comparar ? supabase.rpc("bsc_periodo", {
        p_desde: anterior.desde,
        p_hasta: anterior.hasta,
        p_campana: campana,
      }) : sinComparacion,
      supabase.rpc("costos_periodo", {
        p_desde: desde,
        p_hasta: cierre,
        p_campana: campana,
      }),
    ]);

  const controlPromise = supabase.rpc("control_ejecutivo", {
    p_desde: desde,
    p_hasta: cierre,
    p_campana: campana,
  });

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1400px] px-6 py-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="etiqueta">Contact center · gestión de venta</p>
            <h1 className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.03em]">
              Cuadro de mando integral
            </h1>
          </div>

          <Suspense fallback={<div className="h-7 w-80 animate-pulse rounded-lg bg-[var(--surface-1)]" />}>
            <FiltrosControl periodos={periodosPromise} mes={mes} campana={campana} comparar={comparar} campanas={ctx.campanas} />
          </Suspense>
        </div>

        <Suspense fallback={<Cargando className="h-56" />}>
          <ContenidoPrincipal datos={datosPrincipales} comparar={comparar} analysisQuery={contextoAnalisis.toString()} />
        </Suspense>

        <Suspense fallback={<Cargando className="h-24" />}>
          <GestionEquipo datos={controlPromise} />
        </Suspense>

      </main>
    </>
  );
}
