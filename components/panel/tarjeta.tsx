"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import {
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Area, AreaChart as MiniArea } from "recharts";
import { SERIES, Tooltip } from "@/components/charts/base";
import { AnilloRitmo } from "@/components/ui/anillo";
import { useConteo, usaMovimientoReducido } from "@/lib/animacion";
import { tonoDe } from "@/lib/tonos";
import { fmt } from "@/lib/utils";
import type { Resultado, TipoWidget } from "@/lib/widgets";

export interface Filtros {
  desde: string;
  hasta: string;
  campanaId: string | null;
}

function formatea(valor: number, unidad: Resultado["unidad"]): string {
  switch (unidad) {
    case "uf":
      return fmt.decimal(valor, 2);
    case "clp":
      return fmt.clp(valor);
    case "porcentaje":
      return fmt.pct(valor);
    case "decimal":
      return fmt.decimal(valor);
    default:
      return fmt.entero(Math.round(valor));
  }
}

/** Etiquetas largas no se leen: se recortan con puntos suspensivos. */
function corta(s: string, n = 18): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function TablaAnalitica({ datos }: { datos: Resultado }) {
  const [busqueda, setBusqueda] = useState("");
  const [descendente, setDescendente] = useState(true);
  const filas = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");
    return [...datos.filas]
      .filter((f) => !termino || f.clave.toLocaleLowerCase("es").includes(termino))
      .sort((a, b) => descendente ? b.valor - a.valor : a.valor - b.valor);
  }, [busqueda, datos.filas, descendente]);

  function exportar() {
    const csv = [["Categoria", "Valor", "Peso"], ...filas.map((f) => [f.clave, f.valor, datos.total ? f.valor / datos.total : 0])]
      .map((fila) => fila.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "tabla-panel.csv";
    enlace.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-[var(--vidrio-borde)] px-2 py-1">
          <Search className="size-3 text-[var(--text-muted)]" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" />
        </label>
        <button type="button" onClick={() => setDescendente((v) => !v)} className="rounded-lg border border-[var(--vidrio-borde)] px-2 py-1 text-[11px]">
          Valor {descendente ? "↓" : "↑"}
        </button>
        <button type="button" onClick={exportar} title="Exportar CSV" aria-label="Exportar tabla CSV" className="rounded-lg border border-[var(--vidrio-borde)] p-1.5">
          <Download className="size-3" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--surface-2)]">
            <tr className="border-b text-left text-[var(--text-muted)]">
              <th className="pb-1.5 font-medium">Categoría</th>
              <th className="pb-1.5 text-right font-medium">Valor</th>
              <th className="w-24 pb-1.5 text-right font-medium">Peso</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {filas.map((f) => {
              const peso = datos.total > 0 ? f.valor / datos.total : 0;
              return (
                <tr key={f.clave} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 text-[var(--text-primary)]">{f.clave}</td>
                  <td className="py-1.5 text-right">{formatea(f.valor, datos.unidad)}</td>
                  <td className="py-1.5 pl-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-0)]">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, peso * 100)}%`, background: "linear-gradient(90deg, color-mix(in srgb, var(--series-1) 55%, transparent), var(--series-1))" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ContenidoTarjeta({
  tipo,
  config,
  filtros,
  objetivo,
}: {
  tipo: TipoWidget;
  config: Record<string, unknown>;
  filtros: Filtros;
  objetivo?: number;
}) {
  // Los degradados viven en <defs> con id propio: dos tarjetas en la
  // misma página no pueden compartirlo o la segunda pisa a la primera.
  const reducido = usaMovimientoReducido();
  // El color de las marcas lo define la fuente del dato, no la posición
  // de la tarjeta: dos gráficos de venta se ven hermanos aunque estén
  // en esquinas opuestas del panel.
  const tono = tonoDe(config.fuente).css;
  const idBase = useId().replace(/:/g, "");
  const gradVertical = `gv-${idBase}`;
  const gradHorizontal = `gh-${idBase}`;
  const gradArea = `ga-${idBase}`;
  const gradTrazo = `gt-${idBase}`;

  const [datos, setDatos] = useState<Resultado | null>(null);
  const [kpi, setKpi] = useState<DatosKpi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const firma = JSON.stringify({ config, filtros });

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    const esDataset = config.fuente === "dataset";
    const esKpiLegacy = tipo === "kpi" && !esDataset;
    const ruta = esDataset
      ? "/api/consulta/dataset"
      : esKpiLegacy
        ? "/api/kpi"
        : "/api/consulta";
    const cuerpo = esDataset
      ? {
          datasetId: config.datasetId,
          metricaId: config.metricaId ?? null,
          dimensionId: config.dimensionId ?? null,
          agregacion: config.agregacion ?? null,
          granularidad: config.granularidad ?? "dia",
          desde: config.tieneFecha ? filtros.desde || null : null,
          hasta: config.tieneFecha ? filtros.hasta || null : null,
          limite: config.limite ?? 50,
          orden: config.orden ?? "desc",
        }
      : esKpiLegacy
      ? {
          fuente: config.fuente,
          metrica: config.metrica,
          desde: filtros.desde,
          hasta: filtros.hasta,
          campanaId: filtros.campanaId,
        }
      : { ...config, ...filtros };

    fetch(ruta, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.error) return setError(j.error);
        if (esKpiLegacy) {
          const k = j as DatosKpi;
          setKpi(k);
          setDatos({
            filas: [],
            total: k.total,
            unidad: k.unidad,
            registros: k.registros,
          });
        } else {
          setKpi(null);
          setDatos(j as Resultado);
        }
      })
      .catch(() => vivo && setError("No se pudo consultar."))
      .finally(() => vivo && setCargando(false));

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, tipo]);

  if (cargando) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-[var(--surface-0)]">
          <div className="h-full w-1/3 animate-[cargando_1.1s_ease-in-out_infinite] rounded-full bg-[var(--series-1)]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-center text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!datos || (datos.filas.length === 0 && datos.total === 0)) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-center text-xs text-[var(--text-muted)]">
          Sin datos en el periodo seleccionado.
        </p>
      </div>
    );
  }

  /* ---------------- KPI ---------------- */
  if (tipo === "kpi") {
    return (
      <TarjetaCifra
        total={datos.total}
        unidad={datos.unidad}
        registros={datos.registros}
        objetivo={objetivo}
        anterior={kpi?.anterior}
        serie={kpi?.serie ?? []}
        granularidad={kpi?.granularidad}
        tono={tono}
        ritmo={fraccionTranscurrida(filtros.desde, filtros.hasta)}
      />
    );
  }

  /* ---------------- Tabla ---------------- */
  if (tipo === "tabla") {
    return <TablaAnalitica datos={datos} />;
  }

  const tooltip = (
    <RTooltip
      cursor={{ fill: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}
      content={({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const d = payload[0].payload as { clave: string; valor: number };
        const peso = datos.total > 0 ? d.valor / datos.total : 0;
        return (
          <Tooltip
            titulo={d.clave}
            filas={[
              { etiqueta: "Valor", valor: formatea(d.valor, datos.unidad), color: tono },
              { etiqueta: "Del total", valor: fmt.pct(peso) },
            ]}
          />
        );
      }}
    />
  );

  /* ---------------- Dona ---------------- */
  if (tipo === "dona") {
    const top = datos.filas.slice(0, 6);
    return (
      <div className="flex h-full items-center gap-3">
        <ResponsiveContainer width="55%" height="100%">
          <PieChart>
            <Pie
              data={top}
              dataKey="valor"
              nameKey="clave"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="var(--surface-2)"
              strokeWidth={3}
              isAnimationActive={!reducido}
              animationDuration={700}
            >
              {top.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} fillOpacity={1 - i * 0.11} />
              ))}
            </Pie>
            {tooltip}
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1 overflow-auto pr-1">
          {top.map((f, i) => (
            <div key={f.clave} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="inline-block size-2 shrink-0 rounded-sm"
                style={{
                  background: SERIES[i % SERIES.length],
                  opacity: 1 - i * 0.11,
                }}
              />
              <span className="truncate text-[var(--text-secondary)]">{f.clave}</span>
              <span className="tabular ml-auto font-medium tracking-tight">
                {formatea(f.valor, datos.unidad)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------------- Series ---------------- */
  const ejeY = (
    <YAxis
      tickLine={false}
      axisLine={false}
      width={44}
      tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
      tickFormatter={(v: number) =>
        datos.unidad === "porcentaje" ? `${Math.round(v * 100)}%` : fmt.entero(v)
      }
    />
  );

  if (tipo === "lineas" || tipo === "area") {
    const Grafico = tipo === "area" ? AreaChart : LineChart;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <Grafico data={datos.filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {/* Sólo varía la opacidad: el tono es el validado, así que
                el degradado no altera las relaciones de color. */}
            <linearGradient id={gradArea} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tono} stopOpacity={0.55} />
              <stop offset="55%" stopColor={tono} stopOpacity={0.18} />
              <stop offset="100%" stopColor={tono} stopOpacity={0.02} />
            </linearGradient>
            {/* El trazo se aclara hacia la derecha: sugiere avance en
                el tiempo sin cambiar el tono ni inventar una segunda
                serie. */}
            <linearGradient id={gradTrazo} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={tono} stopOpacity={0.65} />
              <stop offset="100%" stopColor={tono} stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="clave"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
            minTickGap={24}
          />
          {ejeY}
          {tooltip}
          {objetivo ? (
            <ReferenceLine
              y={objetivo}
              stroke="var(--border-strong)"
              strokeDasharray="4 4"
              strokeWidth={2}
            />
          ) : null}
          {tipo === "area" ? (
            <Area
              type="monotone"
              dataKey="valor"
              stroke={`url(#${gradTrazo})`}
              strokeWidth={2.5}
              fill={`url(#${gradArea})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-2)" }}
              isAnimationActive={!reducido}
              animationDuration={700}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="valor"
              stroke={`url(#${gradTrazo})`}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-2)" }}
              isAnimationActive={!reducido}
              animationDuration={700}
            />
          )}
        </Grafico>
      </ResponsiveContainer>
    );
  }

  if (tipo === "barras_horizontal") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={datos.filas}
          layout="vertical"
          margin={{ top: 4, right: 44, bottom: 4, left: 4 }}
          barCategoryGap={2}
        >
          <defs>
            <linearGradient id={gradHorizontal} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={tono} stopOpacity={0.6} />
              <stop offset="100%" stopColor={tono} stopOpacity={1} />
            </linearGradient>
          </defs>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="clave"
            width={116}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
            tickFormatter={(v: string) => corta(v)}
          />
          {tooltip}
          <Bar
            dataKey="valor"
            radius={[0, 4, 4, 0]}
            fill={`url(#${gradHorizontal})`}
            maxBarSize={20}
            isAnimationActive={!reducido}
            animationDuration={650}
          >
            <LabelList
              dataKey="valor"
              position="right"
              offset={6}
              formatter={(v: unknown) => formatea(Number(v ?? 0), datos.unidad)}
              style={{ fill: "var(--text-primary)", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={datos.filas} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradVertical} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tono} stopOpacity={1} />
            <stop offset="100%" stopColor={tono} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="clave"
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          tickFormatter={(v: string) => corta(v, 12)}
          interval={0}
          angle={datos.filas.length > 6 ? -30 : 0}
          textAnchor={datos.filas.length > 6 ? "end" : "middle"}
          height={datos.filas.length > 6 ? 52 : 28}
        />
        {ejeY}
        {tooltip}
        {objetivo ? (
          <ReferenceLine
            y={objetivo}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            strokeWidth={2}
          />
        ) : null}
        <Bar
          dataKey="valor"
          radius={[4, 4, 0, 0]}
          fill={`url(#${gradVertical})`}
          maxBarSize={56}
          isAnimationActive={!reducido}
          animationDuration={650}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}


interface DatosKpi {
  total: number;
  unidad: Resultado["unidad"];
  registros: number;
  anterior: number;
  serie: { clave: string; valor: number }[];
  granularidad: "dia" | "semana" | "mes";
}

/**
 * Tarjeta de cifra.
 *
 * Un número solo no dice nada: 104 asegurados puede ser excelente o
 * pésimo. Lo que le da sentido es contra qué se compara —la meta y el
 * periodo anterior— y cómo llegó hasta ahí, que es lo que muestra la
 * mini-serie.
 */
export function TarjetaCifra({
  total,
  unidad,
  registros,
  objetivo,
  anterior,
  serie,
  granularidad = "dia",
  tono = "var(--tono-venta)",
  ritmo,
}: {
  total: number;
  unidad: Resultado["unidad"];
  registros: number;
  objetivo?: number;
  anterior?: number;
  serie: { clave: string; valor: number }[];
  granularidad?: "dia" | "semana" | "mes";
  tono?: string;
  /** Fracción del periodo ya transcurrida, para la muesca del anillo. */
  ritmo?: number | null;
}) {
  const reducido = usaMovimientoReducido();
  const idSpark = useId().replace(/:/g, "");
  const animado = useConteo(total);
  const mostrado = reducido ? total : animado;

  const pct = objetivo && objetivo > 0 ? total / objetivo : null;
  const delta =
    anterior !== undefined && anterior !== 0 ? (total - anterior) / anterior : null;

  // Una variación es buena o mala según la métrica; acá todas las que
  // existen son "más es mejor", así que el signo basta.
  const tonoDelta =
    delta === null ? "neutro" : delta > 0 ? "good" : delta < 0 ? "critical" : "neutro";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="cifra text-[clamp(1.9rem,4vw,2.9rem)] text-[var(--text-primary)]">
            {formatea(mostrado, unidad)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {delta !== null ? (
              <span
                className="tabular inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                style={{
                  color: `var(--${tonoDelta === "neutro" ? "text-muted" : tonoDelta})`,
                  background:
                    tonoDelta === "neutro"
                      ? "transparent"
                      : `color-mix(in srgb, var(--${tonoDelta}) 15%, transparent)`,
                }}
                title={`Periodo anterior: ${formatea(anterior ?? 0, unidad)}`}
              >
                {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {fmt.pct(Math.abs(delta), 0)}
              </span>
            ) : null}

            <span className="text-[11px] text-[var(--text-muted)]">
              {objetivo
                ? `meta ${formatea(objetivo, unidad)}`
                : `${fmt.entero(registros)} registros`}
              {delta !== null ? " · vs. periodo anterior" : ""}
            </span>
          </div>
        </div>

        {/* Donde hay meta manda el anillo: dice si vas a llegar, no sólo
            cuánto llevas. Donde no la hay, la tarjeta queda limpia. */}
        {pct !== null ? (
          <AnilloRitmo avance={pct} ritmo={ritmo ?? null} tono={tono} />
        ) : null}
      </div>

      {/* La mini-serie ocupa el espacio muerto con información, no con
          decoración: muestra si la cifra viene subiendo o cayendo. */}
      {serie.length > 2 ? (
        <div className="-mx-1 mt-auto h-12 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <MiniArea data={serie} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`chispa-${idSpark}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tono} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={tono} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="valor"
                stroke={tono}
                strokeWidth={2}
                fill={`url(#chispa-${idSpark})`}
                dot={false}
                isAnimationActive={!reducido}
                animationDuration={600}
              />
            </MiniArea>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Qué fracción del periodo seleccionado ya pasó.
 *
 * Es la referencia del anillo: con 13 de 31 días corridos, ir en 42% de
 * la meta es ir en ritmo, no ir mal. Si el periodo ya cerró, la
 * referencia es la meta completa.
 */
export function fraccionTranscurrida(desde: string, hasta: string): number | null {
  const d = new Date(`${desde}T00:00:00`);
  const h = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime()) || h < d) return null;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const dia = 86_400_000;
  const total = Math.round((h.getTime() - d.getTime()) / dia) + 1;
  if (total <= 1) return null;
  if (hoy >= h) return 1;
  if (hoy < d) return 0;

  return (Math.round((hoy.getTime() - d.getTime()) / dia) + 1) / total;
}
