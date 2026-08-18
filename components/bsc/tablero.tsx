"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Banknote,
  Cog,
  HeartHandshake,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ESTADO, SERIES, Tooltip } from "@/components/charts/base";
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

export interface FilaEconomia {
  ejecutivo: string;
  contratos: number;
  asegurados: number;
  gestiones: number;
  ingreso_uf: number;
  ingreso_clp: number;
  costo_empresa_clp: number;
  margen_clp: number;
  margen_pct: number | null;
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

/**
 * Las cuatro perspectivas de Kaplan y Norton, en el orden en que se leen:
 * la financiera es el resultado, y las tres de abajo son las causas.
 */
const PERSPECTIVAS: {
  nombre: string;
  icono: LucideIcon;
  tono: string;
  pregunta: string;
}[] = [
  {
    nombre: "Financiera",
    icono: Banknote,
    tono: "var(--tono-venta)",
    pregunta: "¿El negocio deja plata?",
  },
  {
    nombre: "Cliente",
    icono: HeartHandshake,
    tono: "var(--tono-cliente)",
    pregunta: "¿Cómo nos recibe la base?",
  },
  {
    nombre: "Procesos",
    icono: Cog,
    tono: "var(--tono-agendamiento)",
    pregunta: "¿Trabajamos bien por dentro?",
  },
  {
    nombre: "Personas",
    icono: Users,
    tono: "var(--tono-cotizacion)",
    pregunta: "¿El equipo puede sostenerlo?",
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
  pregunta,
}: {
  numero: string;
  titulo: string;
  pregunta: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="etiqueta shrink-0 text-[var(--text-muted)]">{numero}</span>
      <h2 className="text-[15px] font-semibold tracking-tight">{titulo}</h2>
      <span className="text-xs text-[var(--text-muted)]">{pregunta}</span>
      <span className="h-px flex-1 bg-[var(--vidrio-borde)]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Tablero({
  indicadores,
  economia,
  lineas,
  equilibrio,
  proyeccion,
  embudo,
  periodo,
  indicadoresAnteriores = [],
  periodoAnterior = null,
}: {
  indicadores: Indicador[];
  economia: FilaEconomia[];
  lineas: FilaLinea[];
  equilibrio: Equilibrio | null;
  proyeccion: PuntoProyeccion[];
  embudo: EtapaEmbudo[];
  periodo: { desde: string; hasta: string };
  indicadoresAnteriores?: Indicador[];
  periodoAnterior?: { desde: string; hasta: string } | null;
}) {
  const reducido = usaMovimientoReducido();
  const [abierto, setAbierto] = useState<string | null>(null);

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

  const sinCostos = (costo?.valor ?? 0) === 0;

  // El salto de tarifa del oncológico es el hallazgo más accionable del
  // tablero: unos pocos asegurados más suben el valor de todos.
  const onco = lineas.find((l) => l.tarifa_uf !== null);
  const brecha =
    onco && onco.meta && onco.cumplimiento_pct !== null && onco.cumplimiento_pct < 100
      ? Math.ceil(onco.meta - onco.asegurados)
      : null;

  const topEconomia = economia.filter((e) => e.asegurados > 0).slice(0, 12);

  const ultimoProyectado = proyeccion.at(-1)?.proyectado ?? null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Titulo numero="1" titulo="El resultado" pregunta="¿Qué dejó el periodo?" />
        <div className="grid gap-4 lg:grid-cols-3">
        {[
          { t: "Ingreso del periodo", i: ingreso, tono: "var(--tono-venta)", mejorAlSubir: true },
          { t: "Costo total", i: costo, tono: "var(--tono-asistencia)", mejorAlSubir: false },
          { t: "Margen", i: margen, tono: "var(--tono-cliente)", mejorAlSubir: true },
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

        {sinCostos ? (
        <p
          className="rounded-xl px-3.5 py-2.5 text-xs"
          style={{
            color: "var(--warning)",
            background: "color-mix(in srgb, var(--warning) 12%, transparent)",
          }}
        >
          No hay remuneraciones ni costos cargados, así que el margen es
          igual al ingreso. Cárgalos en Mantenedor · Economía del negocio
          para que este tablero diga algo sobre rentabilidad.
        </p>
        ) : null}

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
        <Titulo numero="2" titulo="La trayectoria" pregunta="¿A dónde llegaremos si no cambia el ritmo?" />
        <Proyeccion puntos={proyeccion} />
      </section>

      <section className="space-y-4">
        <Titulo numero="3" titulo="Las causas" pregunta="¿Dónde se rompe el resultado?" />
        <Embudo etapas={embudo} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PERSPECTIVAS.map((p, k) => {
          const lista = porPerspectiva.get(p.nombre) ?? [];
          const Icono = p.icono;
          return (
            <motion.div
              key={p.nombre}
              initial={reducido ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.15 + k * 0.05,
                type: "spring",
                stiffness: 260,
                damping: 26,
              }}
              data-tono
              style={{ "--tono": p.tono } as React.CSSProperties}
              className="vidrio flex flex-col rounded-2xl p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="grid size-7 place-items-center rounded-lg"
                  style={{
                    background: "color-mix(in srgb, var(--tono) 18%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--tono) 38%, transparent)",
                    color: "var(--tono)",
                  }}
                >
                  <Icono className="size-4" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold leading-tight">
                    {p.nombre}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {p.pregunta}
                  </p>
                </div>
              </div>

              <ul className="flex-1 space-y-0.5">
                {lista.map((i) => {
                  const color = colorEstado(i);
                  const clave = `${i.perspectiva}-${i.indicador}`;
                  const activo = abierto === clave;
                  return (
                    <li key={clave} className="border-b last:border-0">
                      <button
                        onClick={() => setAbierto(activo ? null : clave)}
                        className="flex w-full items-baseline justify-between gap-2 py-1.5 text-left"
                        aria-expanded={activo}
                      >
                        <span className="text-xs text-[var(--text-secondary)]">
                          {i.indicador}
                        </span>
                        <span
                          className="tabular shrink-0 text-[13px] font-semibold tracking-tight"
                          style={color ? { color } : undefined}
                        >
                          {formatea(i.valor, i.unidad)}
                        </span>
                      </button>
                      {activo ? (
                        <p className="pb-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                          {i.detalle}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          );
        })}
        </div>

        <div
        data-tono
        style={{ "--tono": "var(--tono-venta)" } as React.CSSProperties}
        className="vidrio rounded-2xl p-5"
      >
        <h3 className="text-[13px] font-semibold">Aporte por ejecutivo</h3>
        <p className="mb-4 text-xs text-[var(--text-secondary)]">
          Ingreso que genera cada uno según la tarifa, contra lo que cuesta
          a la empresa. La barra es el ingreso; el número de la derecha, el
          margen. Del {periodo.desde} al {periodo.hasta}.
          {periodoAnterior ? ` Comparado con ${periodoAnterior.desde} al ${periodoAnterior.hasta}.` : ""}
        </p>

        {topEconomia.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-muted)]">
            Sin ventas en el periodo.
          </p>
        ) : (
          <>
            <ResponsiveContainer
              width="100%"
              height={Math.max(240, topEconomia.length * 30)}
            >
              <BarChart
                data={topEconomia}
                layout="vertical"
                margin={{ top: 4, right: 110, bottom: 4, left: 4 }}
                barCategoryGap={3}
              >
                <defs>
                  <linearGradient id="bscIngreso" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={SERIES[0]} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="ejecutivo"
                  width={150}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                />
                <RTooltip
                  cursor={{ fill: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as FilaEconomia;
                    return (
                      <Tooltip
                        titulo={d.ejecutivo}
                        filas={[
                          {
                            etiqueta: "Ingreso generado",
                            valor: fmt.clp(d.ingreso_clp),
                            color: SERIES[0],
                          },
                          { etiqueta: "En UF", valor: `${fmt.decimal(d.ingreso_uf, 2)} UF` },
                          { etiqueta: "Costo empresa", valor: fmt.clp(d.costo_empresa_clp) },
                          { etiqueta: "Margen", valor: fmt.clp(d.margen_clp) },
                          { etiqueta: "Contratos", valor: fmt.entero(d.contratos) },
                          { etiqueta: "Asegurados", valor: fmt.entero(d.asegurados) },
                          { etiqueta: "Gestiones", valor: fmt.entero(d.gestiones) },
                        ]}
                      />
                    );
                  }}
                />
                <Bar
                  dataKey="ingreso_clp"
                  radius={[0, 5, 5, 0]}
                  maxBarSize={20}
                  isAnimationActive={!reducido}
                >
                  {topEconomia.map((d) => (
                    <Cell
                      key={d.ejecutivo}
                      fill={
                        d.margen_clp < 0 ? ESTADO.serious : "url(#bscIngreso)"
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="margen_clp"
                    position="right"
                    offset={8}
                    formatter={(v: unknown) => fmt.clp(Number(v ?? 0))}
                    style={{
                      fill: "var(--text-primary)",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Con la remuneración cargada, el margen deja de ser igual al
              ingreso y aparece quién se paga solo y quién todavía no.
            </p>
          </>
        )}
        </div>
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
