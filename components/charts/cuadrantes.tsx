"use client";

import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { SERIES, SinDatos, Tooltip } from "./base";
import { fmt } from "@/lib/utils";

export interface PuntoEjecutivo {
  ejecutivo: string;
  ipD: number;
  ipC: number;
  uf: number;
  asegurados: number;
  cotizaciones: number;
  dg: number;
}

/**
 * Matriz de diagnóstico: ritmo (IP-D) contra efectividad de cierre (IP-C).
 *
 * Es el gráfico central del dashboard de ventas porque separa esfuerzo de
 * resultado. En los datos reales hay ejecutivos con 404 cotizaciones y 6
 * contratos junto a otros con 75 y 12: un ranking por volumen premiaría
 * al primero.
 */
export function GraficoCuadrantes({
  datos,
  objetivoIpD = 0.88,
}: {
  datos: PuntoEjecutivo[];
  objetivoIpD?: number;
}) {
  if (datos.length === 0) {
    return <SinDatos mensaje="Sin ejecutivos con actividad en el periodo seleccionado." />;
  }

  const medianaIpC = mediana(datos.map((d) => d.ipC));

  // Se etiquetan sólo los extremos: nunca un número sobre cada punto.
  const destacados = new Set(
    [...datos]
      .sort((a, b) => b.ipD - a.ipD)
      .slice(0, 2)
      .concat([...datos].sort((a, b) => a.ipC - b.ipC).slice(0, 2))
      .map((d) => d.ejecutivo),
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 32, left: 8 }}>
          <CartesianGrid />
          <XAxis
            type="number"
            dataKey="ipD"
            name="IP-D"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
            label={{
              value: "IP-D · asegurados por día gestionado",
              position: "insideBottom",
              offset: -18,
              style: { fill: "var(--text-secondary)", fontSize: 12 },
            }}
          />
          <YAxis
            type="number"
            dataKey="ipC"
            name="IP-C"
            width={52}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
            label={{
              value: "IP-C · cierre",
              angle: -90,
              position: "insideLeft",
              style: { fill: "var(--text-secondary)", fontSize: 12 },
            }}
          />
          <ZAxis type="number" dataKey="uf" range={[64, 420]} name="UF" />

          <ReferenceLine
            x={objetivoIpD}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            strokeWidth={2}
            label={{
              value: "meta 0,88",
              position: "top",
              style: { fill: "var(--text-muted)", fontSize: 11 },
            }}
          />
          <ReferenceLine
            y={medianaIpC}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            strokeWidth={2}
            label={{
              value: "mediana cierre",
              position: "insideTopRight",
              offset: 8,
              style: { fill: "var(--text-muted)", fontSize: 11 },
            }}
          />

          <RTooltip
            cursor={{ strokeDasharray: "3 3", stroke: "var(--border-strong)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as PuntoEjecutivo;
              return (
                <Tooltip
                  titulo={d.ejecutivo}
                  filas={[
                    { etiqueta: "IP-D (ritmo)", valor: fmt.decimal(d.ipD), color: SERIES[0] },
                    { etiqueta: "IP-C (cierre)", valor: fmt.pct(d.ipC) },
                    { etiqueta: "Asegurados", valor: fmt.entero(d.asegurados) },
                    { etiqueta: "Cotizaciones", valor: fmt.entero(d.cotizaciones) },
                    { etiqueta: "Días gestionados", valor: fmt.entero(d.dg) },
                    { etiqueta: "UF vendida", valor: fmt.uf(d.uf) },
                  ]}
                />
              );
            }}
          />

          <Scatter data={datos} fill={SERIES[0]} fillOpacity={0.75}>
            {datos.map((d) => (
              <Cell
                key={d.ejecutivo}
                stroke="var(--surface-2)"
                strokeWidth={2}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Tamaño de la burbuja = UF vendida. Arriba a la derecha: referentes.
        Abajo a la derecha: gestiona mucho y cierra poco — es el caso de
        coaching, no de más base.
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)]">
          Ver tabla
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[var(--text-muted)]">
              <th className="pb-1.5 font-medium">Ejecutivo</th>
              <th className="pb-1.5 text-right font-medium">DG</th>
              <th className="pb-1.5 text-right font-medium">Cotiz.</th>
              <th className="pb-1.5 text-right font-medium">Aseg.</th>
              <th className="pb-1.5 text-right font-medium">IP-D</th>
              <th className="pb-1.5 text-right font-medium">IP-C</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {[...datos]
              .sort((a, b) => b.ipD - a.ipD)
              .map((d) => (
                <tr key={d.ejecutivo} className="border-b last:border-0">
                  <td className="py-1.5 text-[var(--text-primary)]">
                    {d.ejecutivo}
                    {destacados.has(d.ejecutivo) ? (
                      <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">
                        destacado
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right">{fmt.entero(d.dg)}</td>
                  <td className="py-1.5 text-right">{fmt.entero(d.cotizaciones)}</td>
                  <td className="py-1.5 text-right">{fmt.entero(d.asegurados)}</td>
                  <td className="py-1.5 text-right">{fmt.decimal(d.ipD)}</td>
                  <td className="py-1.5 text-right">{fmt.pct(d.ipC)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function mediana(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
