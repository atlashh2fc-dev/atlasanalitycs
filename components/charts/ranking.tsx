"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId } from "react";
import { ESTADO, SERIES, SinDatos, Tooltip } from "./base";
import { fmt } from "@/lib/utils";

export interface FilaRanking {
  ejecutivo: string;
  asegurados: number;
  cuartil: number | null;
  ipD: number;
}

const CUARTIL_TEXTO: Record<number, string> = {
  4: "Cuartil superior",
  3: "Sobre la mediana",
  2: "Bajo la mediana",
  1: "Cuartil inferior",
};

/**
 * Ranking por asegurados, con la mediana del equipo como referencia.
 * El foco no es premiar al primero: es ver la dispersión y cuánto hay
 * disponible en la parte baja.
 */
export function GraficoRanking({
  datos,
  mediana,
}: {
  datos: FilaRanking[];
  mediana: number;
}) {
  const id = useId().replace(/:/g, "");

  if (datos.length === 0) {
    return <SinDatos mensaje="Sin datos de ejecutivos en el periodo." />;
  }

  const orden = [...datos].sort((a, b) => b.asegurados - a.asegurados);

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(260, orden.length * 26)}>
        <BarChart
          data={orden}
          layout="vertical"
          margin={{ top: 18, right: 44, bottom: 24, left: 8 }}
          barCategoryGap={2}
        >
          <defs>
            {/* La barra se aclara hacia el origen: da volumen sin
                inventar una segunda serie ni tocar el tono validado. */}
            <linearGradient id={`rk-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.55} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={1} />
            </linearGradient>
            <linearGradient id={`rb-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={ESTADO.serious} stopOpacity={0.55} />
              <stop offset="100%" stopColor={ESTADO.serious} stopOpacity={1} />
            </linearGradient>
          </defs>
          <XAxis
            type="number"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="ejecutivo"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <RTooltip
            cursor={{ fill: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as FilaRanking;
              return (
                <Tooltip
                  titulo={d.ejecutivo}
                  filas={[
                    { etiqueta: "Asegurados", valor: fmt.entero(d.asegurados), color: SERIES[0] },
                    { etiqueta: "IP-D", valor: fmt.decimal(d.ipD) },
                    {
                      etiqueta: "Posición",
                      valor: d.cuartil ? CUARTIL_TEXTO[d.cuartil] : "Sin ranking",
                    },
                  ]}
                />
              );
            }}
          />
          <ReferenceLine
            x={mediana}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            strokeWidth={2}
            // Encima del área de trazado: dentro se cruzaba con la barra
            // del primer ejecutivo y ninguna de las dos se leía.
            label={{
              value: `mediana ${fmt.decimal(mediana, 0)}`,
              position: "top",
              offset: 6,
              style: {
                fill: "var(--text-muted)",
                fontSize: 11,
                textAnchor: "middle",
              },
            }}
          />
          <Bar dataKey="asegurados" radius={[0, 5, 5, 0]} maxBarSize={18}>
            {orden.map((d) => (
              <Cell
                key={d.ejecutivo}
                fill={d.cuartil === 1 ? `url(#rb-${id})` : `url(#rk-${id})`}
              />
            ))}
            <LabelList
              dataKey="asegurados"
              position="right"
              offset={6}
              style={{ fill: "var(--text-primary)", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        En tono cálido, el cuartil inferior. Llevarlo a la mediana es la
        brecha de oportunidad del equipo.
      </p>
    </div>
  );
}
