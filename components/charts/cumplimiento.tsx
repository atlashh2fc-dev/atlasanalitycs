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
import { useId } from "react";
import { usaMovimientoReducido } from "@/lib/animacion";
import { fmt } from "@/lib/utils";

export interface FilaCumplimiento {
  agrupacion: string;
  asegurados: number;
  meta: number;
  ritmoEsperado: number;
  proyeccion: number;
}

/**
 * Cumplimiento por línea, medido como avance sobre la propia meta.
 *
 * El eje es relativo a propósito. En unidades absolutas, CM+CAT (meta 250)
 * y Oncológico (meta 60) no son comparables: la barra de 57 se ve enorme
 * al lado de la de 47 aunque vaya mucho más atrasada, y la línea de ritmo
 * de una línea cruzaba la barra de la otra —una referencia horizontal
 * abarca todo el gráfico, no una sola categoría—, lo que se leía como si
 * Oncológico estuviera bajo el ritmo de Complementario.
 *
 * Sobre el eje relativo desaparecen ambos problemas: la meta es 100% para
 * todas las líneas y el ritmo esperado, que es la meta por la fracción de
 * mes transcurrida, cae en el mismo punto para todas. Una sola referencia,
 * válida para todas las barras. Los valores absolutos siguen visibles en
 * la etiqueta, el tooltip y la tabla.
 */
export function GraficoCumplimiento({ datos }: { datos: FilaCumplimiento[] }) {
  const reducido = usaMovimientoReducido();
  const id = useId().replace(/:/g, "");

  if (datos.length === 0) {
    return <SinDatos mensaje="Carga un archivo de ventas para ver el cumplimiento por línea." />;
  }

  const filas = datos.map((d) => {
    const avance = d.meta > 0 ? (d.asegurados / d.meta) * 100 : 0;
    const ritmo = d.meta > 0 ? (d.ritmoEsperado / d.meta) * 100 : 0;
    return {
      ...d,
      avance,
      ritmo,
      faltante: Math.max(100 - avance, 0),
      enRitmo: d.asegurados >= d.ritmoEsperado,
    };
  });

  // El ritmo cae en el mismo punto para todas las líneas salvo que alguna
  // tenga un calendario distinto. Si se separan, se dibuja una referencia
  // por valor en vez de una sola, para no afirmar algo que no es cierto.
  const ritmos = filas.map((f) => f.ritmo);
  const dispersos = Math.max(...ritmos) - Math.min(...ritmos) > 1.5;
  const referencias = dispersos
    ? filas.map((f) => ({ y: f.ritmo, texto: `ritmo ${f.agrupacion}` }))
    : [{ y: ritmos[0], texto: "ritmo a hoy" }];

  const techo = Math.max(112, ...filas.map((f) => f.avance)) * 1.04;

  return (
    <div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={filas} margin={{ top: 20, right: 78, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={`cu-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[0]} stopOpacity={1} />
              <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.5} />
            </linearGradient>
            <linearGradient id={`cb-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ESTADO.serious} stopOpacity={1} />
              <stop offset="100%" stopColor={ESTADO.serious} stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="agrupacion"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <YAxis
            domain={[0, techo]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <RTooltip
            cursor={{ fill: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof filas)[number];
              return (
                <Tooltip
                  titulo={d.agrupacion}
                  filas={[
                    {
                      etiqueta: "Asegurados",
                      valor: `${fmt.entero(d.asegurados)} de ${fmt.entero(d.meta)}`,
                      color: d.enRitmo ? SERIES[0] : ESTADO.serious,
                    },
                    { etiqueta: "Avance", valor: fmt.pct(d.avance / 100) },
                    {
                      etiqueta: "Ritmo esperado a hoy",
                      valor: `${fmt.entero(Math.round(d.ritmoEsperado))} · ${fmt.pct(d.ritmo / 100)}`,
                    },
                    { etiqueta: "Proyección al cierre", valor: fmt.entero(Math.round(d.proyeccion)) },
                  ]}
                />
              );
            }}
          />

          {/* La meta: el 100% del propio objetivo de cada línea. */}
          <ReferenceLine
            y={100}
            stroke="var(--border-strong)"
            strokeWidth={1.5}
            label={{
              value: "meta",
              position: "right",
              offset: 8,
              style: { fill: "var(--text-secondary)", fontSize: 11 },
            }}
          />

          {/* El ritmo que correspondería a hoy: más exigente que la meta
              de fin de mes y la referencia que de verdad importa. */}
          {referencias.map((r) => (
            <ReferenceLine
              key={r.texto}
              y={r.y}
              stroke="var(--border-strong)"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: r.texto,
                position: "right",
                offset: 8,
                style: { fill: "var(--text-muted)", fontSize: 11 },
              }}
            />
          ))}

          <Bar
            dataKey="avance"
            stackId="meta"
            radius={[0, 0, 4, 4]}
            maxBarSize={72}
            isAnimationActive={!reducido}
          >
            {filas.map((d) => (
              <Cell
                key={d.agrupacion}
                fill={d.enRitmo ? `url(#cu-${id})` : `url(#cb-${id})`}
                // Sobre el 100% no queda tramo gris encima: la barra
                // cierra por arriba en vez de quedar cortada en plano.
                {...(d.faltante === 0 ? { radius: 4 } : {})}
              />
            ))}
            <LabelList
              dataKey="asegurados"
              position="insideTop"
              offset={8}
              style={{ fill: "#fff", fontSize: 12, fontWeight: 700 }}
            />
          </Bar>

          <Bar
            dataKey="faltante"
            stackId="meta"
            radius={[4, 4, 0, 0]}
            maxBarSize={72}
            fill="color-mix(in srgb, var(--text-muted) 18%, transparent)"
            stroke="var(--border)"
            isAnimationActive={!reducido}
          >
            <LabelList
              dataKey="avance"
              position="top"
              offset={6}
              formatter={(v: unknown) => fmt.pct(Number(v ?? 0) / 100)}
              style={{ fill: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}
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
