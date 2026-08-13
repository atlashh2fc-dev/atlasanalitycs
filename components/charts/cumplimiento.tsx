"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ESTADO, SERIES, SinDatos, Tooltip } from "./base";
import { fmt } from "@/lib/utils";

export interface FilaCumplimiento {
  agrupacion: string;
  asegurados: number;
  meta: number;
  ritmoEsperado: number;
  proyeccion: number;
}

/**
 * Cumplimiento por línea de meta.
 *
 * Una sola serie (asegurados reales) con dos referencias: el ritmo que
 * corresponde a la fecha y la meta del mes. El consolidado esconde el
 * problema — Oncológico sobre ritmo tapa el atraso de Complementario —,
 * así que este gráfico nunca se muestra agregado.
 */
export function GraficoCumplimiento({ datos }: { datos: FilaCumplimiento[] }) {
  if (datos.length === 0) {
    return <SinDatos mensaje="Carga un archivo de ventas para ver el cumplimiento por línea." />;
  }

  const maxY = Math.max(...datos.map((d) => Math.max(d.meta, d.proyeccion))) * 1.15;

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={datos} margin={{ top: 24, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="agrupacion"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <YAxis
            domain={[0, maxY]}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <RTooltip
            cursor={{ fill: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as FilaCumplimiento;
              const pct = d.meta > 0 ? d.asegurados / d.meta : null;
              return (
                <Tooltip
                  titulo={d.agrupacion}
                  filas={[
                    { etiqueta: "Asegurados", valor: fmt.entero(d.asegurados), color: SERIES[0] },
                    { etiqueta: "Meta del mes", valor: fmt.entero(d.meta) },
                    { etiqueta: "Ritmo esperado a hoy", valor: fmt.entero(Math.round(d.ritmoEsperado)) },
                    { etiqueta: "Proyección al cierre", valor: fmt.entero(Math.round(d.proyeccion)) },
                    { etiqueta: "Avance", valor: fmt.pct(pct) },
                  ]}
                />
              );
            }}
          />
          {datos.map((d) => (
            <ReferenceLine
              key={`meta-${d.agrupacion}`}
              y={d.meta}
              stroke="var(--border-strong)"
              strokeDasharray="4 4"
              strokeWidth={2}
            />
          ))}
          <Bar dataKey="asegurados" radius={[4, 4, 0, 0]} maxBarSize={72}>
            {datos.map((d) => (
              <Cell
                key={d.agrupacion}
                fill={d.asegurados >= d.ritmoEsperado ? SERIES[0] : ESTADO.serious}
              />
            ))}
            <LabelList
              dataKey="asegurados"
              position="top"
              offset={8}
              style={{ fill: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="border-b text-left text-[var(--text-muted)]">
            <th className="pb-1.5 font-medium">Línea</th>
            <th className="pb-1.5 text-right font-medium">Asegurados</th>
            <th className="pb-1.5 text-right font-medium">Ritmo a hoy</th>
            <th className="pb-1.5 text-right font-medium">Meta</th>
            <th className="pb-1.5 text-right font-medium">Proyección</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {datos.map((d) => (
            <tr key={d.agrupacion} className="border-b last:border-0">
              <td className="py-1.5 text-[var(--text-primary)]">{d.agrupacion}</td>
              <td className="py-1.5 text-right">{fmt.entero(d.asegurados)}</td>
              <td className="py-1.5 text-right text-[var(--text-secondary)]">
                {fmt.entero(Math.round(d.ritmoEsperado))}
              </td>
              <td className="py-1.5 text-right">{fmt.entero(d.meta)}</td>
              <td
                className="py-1.5 text-right font-medium"
                style={{ color: d.proyeccion >= d.meta ? ESTADO.good : ESTADO.serious }}
              >
                {fmt.entero(Math.round(d.proyeccion))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
