"use client";

import { useEffect, useState } from "react";
import {
  Area,
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
import { SERIES, Tooltip } from "@/components/charts/base";
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
  const [datos, setDatos] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const firma = JSON.stringify({ config, filtros });

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);

    fetch("/api/consulta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...config, ...filtros }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.error) setError(j.error);
        else setDatos(j as Resultado);
      })
      .catch(() => vivo && setError("No se pudo consultar."))
      .finally(() => vivo && setCargando(false));

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

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
    const pct = objetivo && objetivo > 0 ? datos.total / objetivo : null;
    return (
      <div className="flex h-full flex-col justify-center px-1">
        <p className="tabular text-[clamp(1.75rem,4.5vw,2.75rem)] font-semibold leading-none tracking-tight">
          {formatea(datos.total, datos.unidad)}
        </p>
        {objetivo ? (
          <>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-0)]">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, (pct ?? 0) * 100)}%`,
                  background:
                    (pct ?? 0) >= 1
                      ? "var(--good)"
                      : (pct ?? 0) >= 0.85
                        ? "var(--warning)"
                        : "var(--serious)",
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              {fmt.pct(pct)} de {formatea(objetivo, datos.unidad)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {fmt.entero(datos.registros)} registros
          </p>
        )}
      </div>
    );
  }

  /* ---------------- Tabla ---------------- */
  if (tipo === "tabla") {
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--surface-2)]">
            <tr className="border-b text-left text-[var(--text-muted)]">
              <th className="pb-1.5 font-medium">Categoría</th>
              <th className="pb-1.5 text-right font-medium">Valor</th>
              <th className="w-24 pb-1.5 text-right font-medium">Peso</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {datos.filas.map((f) => {
              const peso = datos.total > 0 ? f.valor / datos.total : 0;
              return (
                <tr key={f.clave} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 text-[var(--text-primary)]">{f.clave}</td>
                  <td className="py-1.5 text-right">
                    {formatea(f.valor, datos.unidad)}
                  </td>
                  <td className="py-1.5 pl-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-0)]">
                      <div
                        className="h-full rounded-full bg-[var(--series-1)]"
                        style={{ width: `${Math.min(100, peso * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
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
              { etiqueta: "Valor", valor: formatea(d.valor, datos.unidad), color: SERIES[0] },
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
              strokeWidth={2}
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
              <span className="tabular ml-auto font-medium">
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
            <linearGradient id="relleno" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
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
              stroke={SERIES[0]}
              strokeWidth={2}
              fill="url(#relleno)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-2)" }}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="valor"
              stroke={SERIES[0]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-2)" }}
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
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} fill={SERIES[0]} maxBarSize={20}>
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
        <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill={SERIES[0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}
