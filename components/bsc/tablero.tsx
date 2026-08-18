"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Banknote,
  Cog,
  HeartHandshake,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ESTADO } from "@/components/charts/base";
import { Embudo, type EtapaEmbudo } from "@/components/bsc/embudo";
import { Proyeccion, type PuntoProyeccion } from "@/components/bsc/proyeccion";
import { usaMovimientoReducido } from "@/lib/animacion";
import { fmt } from "@/lib/utils";

export interface Indicador {
  perspectiva: string;
  orden: number;
  indicador: string;
  valor: number | null;
  unidad: string;
  meta: number | null;
  cumplimiento: number | null;
  sentido: string;
  detalle: string;
}

export interface Equilibrio {
  asegurados_equilibrio: number | null;
  asegurados_reales: number;
  tarifa_media_clp: number | null;
  costo_total_clp: number;
  ultima_venta: string | null;
}

export interface FilaLinea {
  agrupacion_meta: string;
  asegurados: number;
  meta: number | null;
  cumplimiento_pct: number | null;
  tarifa_uf: number | null;
  ingreso_uf: number;
  ingreso_clp: number;
}

export interface CostoCierre {
  concepto: string;
  base: string;
  cantidad: number | null;
  monto_clp: number;
}

export interface ProyeccionPorLinea extends PuntoProyeccion {
  agrupacion_meta: string;
}

/**
 * Las cuatro perspectivas de Kaplan y Norton, en el orden en que se leen:
 * la financiera es el resultado, y las tres de abajo son las causas.
 */
const PERSPECTIVAS: {
  nombre: string;
  icono: LucideIcon;
  tono: string;
  enfoque: string;
}[] = [
  {
    nombre: "Financiera",
    icono: Banknote,
    tono: "var(--tono-venta)",
    enfoque: "Rentabilidad y sostenibilidad",
  },
  {
    nombre: "Cliente",
    icono: HeartHandshake,
    tono: "var(--tono-cliente)",
    enfoque: "Calidad y respuesta de la base",
  },
  {
    nombre: "Procesos",
    icono: Cog,
    tono: "var(--tono-agendamiento)",
    enfoque: "Volumen, eficiencia y conversión",
  },
  {
    nombre: "Personas",
    icono: Users,
    tono: "var(--tono-cotizacion)",
    enfoque: "Capacidad y cumplimiento",
  },
];

function formatea(v: number | null, unidad: string): string {
  if (v === null || v === undefined) return "—";
  switch (unidad) {
    case "clp":
      return fmt.clp(v);
    case "uf":
      return `${fmt.decimal(v, 3)} UF`;
    case "pct":
      return `${fmt.decimal(v, 1)}%`;
    case "decimal":
      return fmt.decimal(v, 2);
    default:
      return fmt.entero(v);
  }
}

/** Color del cumplimiento, sólo cuando hay meta contra la cual medir. */
function colorEstado(i: Indicador): string | null {
  if (i.cumplimiento === null) return null;
  if (i.cumplimiento >= 100) return ESTADO.good;
  if (i.cumplimiento >= 85) return "var(--warning)";
  return ESTADO.serious;
}

/* ------------------------------------------------------------------ */

function Titulo({
  numero,
  titulo,
  subtitulo,
}: {
  numero: string;
  titulo: string;
  subtitulo: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="etiqueta shrink-0 text-[var(--text-muted)]">{numero}</span>
      <h2 className="text-[15px] font-semibold tracking-tight">{titulo}</h2>
      <span className="text-xs text-[var(--text-muted)]">{subtitulo}</span>
      <span className="h-px flex-1 bg-[var(--vidrio-borde)]" />
    </div>
  );
}

function ResumenPerspectivas({
  porPerspectiva,
  abierto,
  setAbierto,
  reducido,
  analysisQuery,
}: {
  porPerspectiva: Map<string, Indicador[]>;
  abierto: string | null;
  setAbierto: (clave: string | null) => void;
  reducido: boolean;
  analysisQuery: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {PERSPECTIVAS.map((p, k) => {
        const lista = porPerspectiva.get(p.nombre) ?? [];
        const Icono = p.icono;
        return (
          <motion.div
            key={p.nombre}
            initial={reducido ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: k * 0.05, type: "spring", stiffness: 260, damping: 26 }}
            data-tono
            style={{ "--tono": p.tono } as React.CSSProperties}
            className="vidrio flex flex-col rounded-2xl p-4"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg" style={{ background: "color-mix(in srgb, var(--tono) 18%, transparent)", border: "1px solid color-mix(in srgb, var(--tono) 38%, transparent)", color: "var(--tono)" }}>
                <Icono className="size-4" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold leading-tight">{p.nombre}</h3>
                <p className="text-[11px] text-[var(--text-muted)]">{p.enfoque}</p>
              </div>
            </div>
            <ul className="flex-1 space-y-0.5">
              {lista.map((i) => {
                const color = colorEstado(i);
                const clave = `${i.perspectiva}-${i.indicador}`;
                const activo = abierto === clave;
                return (
                  <li key={clave} className="border-b last:border-0">
                    <button onClick={() => setAbierto(activo ? null : clave)} className="flex w-full items-baseline justify-between gap-2 py-1.5 text-left" aria-expanded={activo}>
                      <span className="text-xs text-[var(--text-secondary)]">{i.indicador}</span>
                      <span className="tabular shrink-0 text-[13px] font-semibold tracking-tight" style={color ? { color } : undefined}>{formatea(i.valor, i.unidad)}</span>
                    </button>
                    {activo ? <p className="pb-2 text-[11px] leading-relaxed text-[var(--text-muted)]">{i.detalle}</p> : null}
                  </li>
                );
              })}
            </ul>
            <Link
              href={`/analisis?${analysisQuery}&foco=${encodeURIComponent(p.nombre.toLocaleLowerCase("es"))}`}
              className="mt-3 border-t border-[var(--vidrio-borde)] pt-2 text-[11px] font-medium text-[var(--tono)]"
            >
              Profundizar en Análisis →
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Tablero({
  indicadores,
  lineas,
  equilibrio,
  proyeccion,
  proyeccionesLinea = [],
  embudo,
  indicadoresAnteriores = [],
  analysisQuery = "",
  costosCierre = [],
}: {
  indicadores: Indicador[];
  lineas: FilaLinea[];
  equilibrio: Equilibrio | null;
  proyeccion: PuntoProyeccion[];
  proyeccionesLinea?: ProyeccionPorLinea[];
  embudo: EtapaEmbudo[];
  indicadoresAnteriores?: Indicador[];
  analysisQuery?: string;
  costosCierre?: CostoCierre[];
}) {
  const reducido = usaMovimientoReducido();
  const [abierto, setAbierto] = useState<string | null>(null);

  const proyeccionesAgrupadas = useMemo(() => {
    const grupos = new Map<string, PuntoProyeccion[]>();
    for (const punto of proyeccionesLinea) {
      const puntos = grupos.get(punto.agrupacion_meta) ?? [];
      puntos.push(punto);
      grupos.set(punto.agrupacion_meta, puntos);
    }
    const orden = ["ONCO", "CM+CAT"];
    return [...grupos.entries()].sort(([a], [b]) => {
      const ia = orden.indexOf(a);
      const ib = orden.indexOf(b);
      return (ia === -1 ? orden.length : ia) - (ib === -1 ? orden.length : ib)
        || a.localeCompare(b, "es");
    });
  }, [proyeccionesLinea]);

  const porPerspectiva = useMemo(() => {
    const m = new Map<string, Indicador[]>();
    for (const i of indicadores) {
      const l = m.get(i.perspectiva) ?? [];
      l.push(i);
      m.set(i.perspectiva, l);
    }
    for (const l of m.values()) l.sort((a, b) => a.orden - b.orden);
    return m;
  }, [indicadores]);

  const financiera = porPerspectiva.get("Financiera") ?? [];
  const anteriores = useMemo(
    () => new Map(indicadoresAnteriores.map((i) => [`${i.perspectiva}-${i.indicador}`, i])),
    [indicadoresAnteriores],
  );
  const ingreso = financiera.find((i) => i.indicador === "Ingreso del periodo");
  const costo = financiera.find((i) => i.indicador === "Costo total");
  const margen = financiera.find((i) => i.indicador === "Margen");

  const forecastFinanciero = useMemo(() => {
    const corte = proyeccion.findLast((p) => !p.es_futuro);
    const cierre = proyeccion.at(-1);
    const aseguradosReales = corte?.acumulado ?? 0;
    if (!cierre || aseguradosReales <= 0) return null;

    const factorLineal = cierre.proyectado / aseguradosReales;
    const factorIdeal = cierre.linea_meta === null ? null : cierre.linea_meta / aseguradosReales;
    const ingresoReal = ingreso?.valor ?? 0;
    const totalCostoCierre = costosCierre.reduce((s, fila) => s + Number(fila.monto_clp ?? 0), 0);
    const costoVariableActual = costosCierre
      .filter((fila) => fila.concepto !== "Sueldo base" && !["mensual", "por_posicion"].includes(fila.base))
      .reduce((s, fila) => s + Number(fila.monto_clp ?? 0), 0);
    const costoFijoCierre = Math.max(0, totalCostoCierre - costoVariableActual);
    const costoLineal = costosCierre.length > 0 ? costoFijoCierre + costoVariableActual * factorLineal : null;
    const costoIdeal = costosCierre.length > 0 && factorIdeal !== null ? costoFijoCierre + costoVariableActual * factorIdeal : null;
    const ingresoLineal = ingresoReal * factorLineal;
    const ingresoIdeal = ingreso?.meta ?? (factorIdeal === null ? null : ingresoReal * factorIdeal);

    return {
      ingresoLineal,
      ingresoIdeal,
      costoLineal,
      costoIdeal,
      margenLineal: costoLineal === null ? null : ingresoLineal - costoLineal,
      margenIdeal: costoIdeal === null || ingresoIdeal === null ? null : ingresoIdeal - costoIdeal,
    };
  }, [costosCierre, ingreso, proyeccion]);

  const desgloseCostos = useMemo(() => {
    const corte = proyeccion.findLast((p) => !p.es_futuro);
    const cierre = proyeccion.at(-1);
    const reales = corte?.acumulado ?? 0;
    const factorLineal = reales > 0 && cierre ? cierre.proyectado / reales : 1;
    const filas = costosCierre.map((fila) => {
      const fijo = ["mensual", "por_posicion"].includes(fila.base);
      const proyectado = Number(fila.monto_clp ?? 0) * (fijo ? 1 : factorLineal);
      return { ...fila, fijo, proyectado };
    });
    const total = filas.reduce((s, fila) => s + fila.proyectado, 0);
    return {
      filas,
      total,
      fijo: filas.filter((fila) => fila.fijo).reduce((s, fila) => s + fila.proyectado, 0),
      variable: filas.filter((fila) => !fila.fijo).reduce((s, fila) => s + fila.proyectado, 0),
      leyes: filas.filter((fila) => fila.concepto.startsWith("Leyes sociales")).reduce((s, fila) => s + fila.proyectado, 0),
    };
  }, [costosCierre, proyeccion]);

  const sinCostos = (costo?.valor ?? 0) === 0;

  // El salto de tarifa del oncológico es el hallazgo más accionable del
  // tablero: unos pocos asegurados más suben el valor de todos.
  const onco = lineas.find((l) => l.tarifa_uf !== null);
  const brecha =
    onco && onco.meta && onco.cumplimiento_pct !== null && onco.cumplimiento_pct < 100
      ? Math.ceil(onco.meta - onco.asegurados)
      : null;

  const ultimoProyectado = proyeccion.at(-1)?.proyectado ?? null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Titulo numero="1" titulo="Resumen ejecutivo BSC" subtitulo="Financiera · Cliente · Procesos · Personas" />
        <ResumenPerspectivas porPerspectiva={porPerspectiva} abierto={abierto} setAbierto={setAbierto} reducido={reducido} analysisQuery={analysisQuery} />
      </section>

      <section className="space-y-4">
        <Titulo numero="2" titulo="Resultado financiero y forecast" subtitulo="Real al corte, cierre esperado, meta y sostenibilidad" />
        <div className="grid gap-4 lg:grid-cols-3">
        {[
          { t: "Ingreso del periodo", i: ingreso, tono: "var(--tono-venta)", mejorAlSubir: true, lineal: forecastFinanciero?.ingresoLineal, ideal: forecastFinanciero?.ingresoIdeal },
          { t: "Costo total", i: costo, tono: "var(--tono-asistencia)", mejorAlSubir: false, lineal: forecastFinanciero?.costoLineal, ideal: forecastFinanciero?.costoIdeal },
          { t: "Margen", i: margen, tono: "var(--tono-cliente)", mejorAlSubir: true, lineal: forecastFinanciero?.margenLineal, ideal: forecastFinanciero?.margenIdeal },
        ].map((c, k) => (
          <motion.div
            key={c.t}
            initial={reducido ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: k * 0.05, type: "spring", stiffness: 260, damping: 26 }}
            data-tono
            style={{ "--tono": c.tono } as React.CSSProperties}
            className="vidrio rounded-2xl p-5"
          >
            <p className="etiqueta">{c.t}</p>
            <p className="cifra mt-2.5 text-[2.1rem]">
              {formatea(c.i?.valor ?? null, c.i?.unidad ?? "clp")}
            </p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {c.i?.detalle}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--vidrio-borde)] pt-3">
              <div>
                <p className="etiqueta">Cierre lineal</p>
                <p className="tabular mt-1 text-sm font-semibold">{c.lineal === null || c.lineal === undefined ? "—" : fmt.clp(c.lineal)}</p>
              </div>
              <div>
                <p className="etiqueta">Ideal al cierre</p>
                <p className="tabular mt-1 text-sm font-semibold">{c.ideal === null || c.ideal === undefined ? "—" : fmt.clp(c.ideal)}</p>
              </div>
            </div>
            {c.i && anteriores.has(`${c.i.perspectiva}-${c.i.indicador}`) ? (() => {
              const previo = anteriores.get(`${c.i.perspectiva}-${c.i.indicador}`)?.valor;
              if (previo === null || previo === undefined) return null;
              const delta = (c.i.valor ?? 0) - previo;
              const pct = previo === 0 ? null : (delta / Math.abs(previo)) * 100;
              const favorable = c.mejorAlSubir ? delta >= 0 : delta <= 0;
              return (
                <p className="mt-3 border-t border-[var(--vidrio-borde)] pt-2 text-[11px]" style={{ color: favorable ? ESTADO.good : ESTADO.serious }}>
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {pct === null ? formatea(Math.abs(delta), c.i.unidad) : `${Math.abs(pct).toFixed(1)}%`} vs. período anterior
                </p>
              );
            })() : null}
          </motion.div>
        ))}
        </div>

        {forecastFinanciero ? (
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            Forecast financiero: el ingreso mantiene el mix y la tarifa media observados; el costo fijo se lleva completo al cierre y el variable acompaña el volumen proyectado. “Ideal” representa el escenario de cumplir la meta, no un presupuesto contable independiente.
          </p>
        ) : null}

        {desgloseCostos.filas.length > 0 ? (
          <div
            data-tono
            style={{ "--tono": "var(--tono-asistencia)" } as React.CSSProperties}
            className="vidrio overflow-hidden rounded-2xl"
          >
            <div className="grid gap-4 border-b border-[var(--vidrio-borde)] p-5 lg:grid-cols-[1.35fr_repeat(3,minmax(130px,0.65fr))] lg:items-end">
              <div>
                <p className="etiqueta">Estructura de costo · cierre lineal</p>
                <h3 className="mt-1 text-sm font-semibold">Qué compone el costo y cuánto pesa</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Separa compromisos fijos, costo variable y carga legal para explicar el margen proyectado.
                </p>
              </div>
              {[
                ["Fijo comprometido", desgloseCostos.fijo],
                ["Variable proyectado", desgloseCostos.variable],
                ["Leyes sociales", desgloseCostos.leyes],
              ].map(([etiqueta, valor]) => (
                <div key={String(etiqueta)}>
                  <p className="etiqueta">{etiqueta}</p>
                  <p className="tabular mt-1 text-lg font-semibold">{fmt.clp(Number(valor))}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto px-5 pb-4">
              <table className="w-full min-w-[680px] text-xs">
                <thead>
                  <tr className="border-b border-[var(--vidrio-borde)] text-left text-[var(--text-muted)]">
                    <th className="py-2 font-medium">Componente</th>
                    <th className="py-2 font-medium">Naturaleza</th>
                    <th className="py-2 text-right font-medium">Proyección cierre</th>
                    <th className="py-2 text-right font-medium">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {desgloseCostos.filas.map((fila) => (
                    <tr key={`${fila.concepto}-${fila.base}`} className="border-b border-[var(--vidrio-borde)] last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-[var(--text-primary)]">
                        {fila.concepto}
                        <span className="ml-2 font-normal text-[var(--text-muted)]">{fila.base.replaceAll("_", " ")}</span>
                      </td>
                      <td className="py-2.5">
                        <span className="rounded-full border border-[var(--vidrio-borde)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                          {fila.fijo ? "Fijo" : "Variable"}
                        </span>
                      </td>
                      <td className="tabular py-2.5 text-right font-semibold">{fmt.clp(fila.proyectado)}</td>
                      <td className="tabular py-2.5 text-right text-[var(--text-secondary)]">
                        {desgloseCostos.total > 0 ? `${((fila.proyectado / desgloseCostos.total) * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--vidrio-borde)]">
                    <td className="py-2.5 font-semibold" colSpan={2}>Costo total proyectado</td>
                    <td className="tabular py-2.5 text-right font-semibold">{fmt.clp(desgloseCostos.total)}</td>
                    <td className="tabular py-2.5 text-right font-semibold">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null}

        {sinCostos ? (
        <p
          className="rounded-xl px-3.5 py-2.5 text-xs"
          style={{
            color: "var(--warning)",
            background: "color-mix(in srgb, var(--warning) 12%, transparent)",
          }}
        >
          No hay remuneraciones ni costos cargados, así que el margen es
          igual al ingreso. Cárgalos en Administración · Economía del negocio
          para que este tablero diga algo sobre rentabilidad.
        </p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {proyeccionesAgrupadas.map(([agrupacion, puntos]) => (
            <Proyeccion
              key={agrupacion}
              puntos={puntos}
              titulo={
                agrupacion === "ONCO"
                  ? "Oncológico"
                  : agrupacion === "CM+CAT"
                    ? "Complementario + Catastrófico"
                    : agrupacion
              }
            />
          ))}
        </div>

        {brecha !== null && brecha > 0 ? (
        <p
          className="rounded-xl px-3.5 py-2.5 text-xs"
          style={{
            color: "var(--tono-cotizacion)",
            background: "color-mix(in srgb, var(--tono-cotizacion) 12%, transparent)",
          }}
        >
          Oncológico va en {fmt.decimal(onco!.cumplimiento_pct!, 1)}% de su meta.
          {brecha === 1 ? " Falta 1 asegurado" : ` Faltan ${brecha} asegurados`} para
          cruzar el 100% y subir la tarifa de 1,5 a 1,6 UF — y sube para los{" "}
          {onco!.asegurados + brecha} beneficiarios del mes, no sólo para los que
          exceden. Son unas {fmt.decimal((onco!.asegurados + brecha) * 0.1, 1)} UF
          adicionales por cruzar esa línea.
        </p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1fr_1.35fr]">
          {equilibrio?.asegurados_equilibrio ? (
            <div
              data-tono
              style={{ "--tono": "var(--tono-asistencia)" } as React.CSSProperties}
              className="vidrio rounded-2xl p-5"
            >
              <p className="etiqueta">Punto de equilibrio</p>
              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
            <div>
              <p className="cifra text-[2.1rem]">
                {fmt.decimal(equilibrio.asegurados_equilibrio, 0)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                asegurados para cubrir el costo
              </p>
            </div>
            <div>
              <p
                className="cifra text-[2.1rem]"
                style={{
                  color:
                    equilibrio.asegurados_reales >= equilibrio.asegurados_equilibrio
                      ? ESTADO.good
                      : ESTADO.serious,
                }}
              >
                {fmt.entero(equilibrio.asegurados_reales)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                producidos hasta ahora
              </p>
            </div>
                {ultimoProyectado !== null ? (
                  <div>
                    <p
                      className="cifra text-[2.1rem]"
                      style={{
                        color:
                          ultimoProyectado >= equilibrio.asegurados_equilibrio
                            ? ESTADO.good
                            : ESTADO.serious,
                      }}
                    >
                      {fmt.decimal(ultimoProyectado, 1)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      proyectados al cierre
                    </p>
                  </div>
                ) : null}
              </div>

              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                A la tarifa media del mes, {fmt.clp(equilibrio.tarifa_media_clp ?? 0)} por
                asegurado, la campaña se paga sola desde el asegurado{" "}
                {fmt.decimal(equilibrio.asegurados_equilibrio, 0)}. Todo lo que venga
                después es margen.
              </p>
            </div>
          ) : (
            <div className="vidrio rounded-2xl p-5 text-xs text-[var(--text-muted)]">
              El punto de equilibrio aparecerá cuando existan costos y producción valorizada.
            </div>
          )}

          <div
            data-tono
            style={{ "--tono": "var(--tono-cotizacion)" } as React.CSSProperties}
            className="vidrio overflow-x-auto rounded-2xl p-5"
          >
            <h3 className="mb-3 text-[13px] font-semibold">Ingreso por línea</h3>
            <TablaLineas lineas={lineas} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <Titulo numero="3" titulo="Diagnóstico operativo" subtitulo="Volumen y eficiencia desde la gestión hasta la venta" />
        <Embudo etapas={embudo} />
      </section>

    </div>
  );
}

function TablaLineas({ lineas }: { lineas: FilaLinea[] }) {
  return (
    <table className="w-full min-w-[620px] text-xs">
      <thead>
        <tr className="border-b text-left text-[var(--text-muted)]">
          <th className="pb-1.5 font-medium">Línea</th>
          <th className="pb-1.5 text-right font-medium">Asegurados</th>
          <th className="pb-1.5 text-right font-medium">Meta</th>
          <th className="pb-1.5 text-right font-medium">Cumplimiento</th>
          <th className="pb-1.5 text-right font-medium">Tarifa</th>
          <th className="pb-1.5 text-right font-medium">Ingreso UF</th>
          <th className="pb-1.5 text-right font-medium">Ingreso</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {lineas.map((l) => (
          <tr key={l.agrupacion_meta} className="border-b last:border-0">
            <td className="py-1.5 font-medium text-[var(--text-primary)]">{l.agrupacion_meta}</td>
            <td className="py-1.5 text-right">{fmt.entero(l.asegurados)}</td>
            <td className="py-1.5 text-right text-[var(--text-secondary)]">{l.meta === null ? "—" : fmt.entero(l.meta)}</td>
            <td
              className="py-1.5 text-right font-medium"
              style={{
                color:
                  l.cumplimiento_pct === null
                    ? undefined
                    : l.cumplimiento_pct >= 100
                      ? ESTADO.good
                      : l.cumplimiento_pct >= 85
                        ? "var(--warning)"
                        : ESTADO.serious,
              }}
            >
              {l.cumplimiento_pct === null ? "—" : `${fmt.decimal(l.cumplimiento_pct, 1)}%`}
            </td>
            <td className="py-1.5 text-right text-[var(--text-secondary)]">{l.tarifa_uf === null ? "por edad" : `${fmt.decimal(l.tarifa_uf, 2)} UF`}</td>
            <td className="py-1.5 text-right">{fmt.decimal(l.ingreso_uf, 2)}</td>
            <td className="py-1.5 text-right font-semibold">{fmt.clp(l.ingreso_clp)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
