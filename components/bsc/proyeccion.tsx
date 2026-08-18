"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ESTADO, SERIES, Tooltip } from "@/components/charts/base";
import { fmt } from "@/lib/utils";

export interface PuntoProyeccion {
  fecha: string;
  es_habil: boolean;
  asegurados_dia: number;
  acumulado: number;
  proyectado: number;
  linea_meta: number | null;
  es_futuro: boolean;
}

const FORMATO_DIA = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
});

function diaMes(fecha: string): string {
  return FORMATO_DIA.format(new Date(`${fecha}T12:00:00`)).replace(".", "");
}

export function Proyeccion({ puntos }: { puntos: PuntoProyeccion[] }) {
  const resumen = useMemo(() => {
    const ultimo = puntos.at(-1);
    const corte = puntos.findLast((p) => !p.es_futuro) ?? puntos[0];
    const habilesRestantes = puntos.filter((p) => p.es_futuro && p.es_habil).length;
    const cierre = ultimo?.proyectado ?? corte?.acumulado ?? 0;
    const meta = ultimo?.linea_meta ?? null;
    return {
      real: corte?.acumulado ?? 0,
      cierre,
      meta,
      brecha: meta === null ? null : cierre - meta,
      habilesRestantes,
      fechaCorte: corte?.fecha ?? null,
    };
  }, [puntos]);

  const datosGrafico = useMemo(() => {
    const corte = puntos.findLastIndex((p) => !p.es_futuro);
    return puntos.map((p, indice) => ({
      ...p,
      real_visible: p.es_futuro ? null : p.acumulado,
      proyeccion_visible: p.es_futuro || indice === corte ? p.proyectado : null,
    }));
  }, [puntos]);

  if (puntos.length === 0) {
    return (
      <div className="vidrio rounded-2xl p-5">
        <h3 className="text-[13px] font-semibold">Trayectoria de cierre</h3>
        <p className="py-12 text-center text-xs text-[var(--text-muted)]">
          Sin datos suficientes para proyectar el periodo.
        </p>
      </div>
    );
  }

  const cumple = resumen.meta !== null && resumen.cierre >= resumen.meta;

  return (
    <div
      data-tono
      style={{ "--tono": "var(--tono-venta)" } as React.CSSProperties}
      className="vidrio rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[13px] font-semibold">Trayectoria de cierre</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-[var(--text-secondary)]">
            La línea continua es producción real; la discontinua prolonga el ritmo
            observado sólo por los días hábiles que quedan.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-right">
          <div>
            <p className="etiqueta">Real a hoy</p>
            <p className="cifra mt-1 text-xl">{fmt.entero(resumen.real)}</p>
          </div>
          <div>
            <p className="etiqueta">Cierre estimado</p>
            <p
              className="cifra mt-1 text-xl"
              style={{ color: resumen.meta === null ? SERIES[0] : cumple ? ESTADO.good : ESTADO.serious }}
            >
              {fmt.decimal(resumen.cierre, 1)}
            </p>
          </div>
          {resumen.brecha !== null ? (
            <div>
              <p className="etiqueta">Brecha vs. meta</p>
              <p
                className="cifra mt-1 text-xl"
                style={{ color: resumen.brecha >= 0 ? ESTADO.good : ESTADO.serious }}
              >
                {resumen.brecha > 0 ? "+" : ""}{fmt.decimal(resumen.brecha, 1)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 h-[290px]" role="img" aria-label="Asegurados acumulados, proyección y trayectoria de meta por día">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datosGrafico} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--vidrio-borde)" strokeDasharray="3 4" />
            <XAxis
              dataKey="fecha"
              tickFormatter={diaMes}
              minTickGap={28}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            />
            <YAxis
              width={40}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            />
            <RTooltip
              cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as PuntoProyeccion;
                return (
                  <Tooltip
                    titulo={diaMes(d.fecha)}
                    filas={[
                      { etiqueta: "Acumulado real", valor: fmt.entero(d.acumulado), color: SERIES[0] },
                      { etiqueta: "Proyección", valor: fmt.decimal(d.proyectado, 1), color: "var(--tono-cotizacion)" },
                      { etiqueta: "Meta a la fecha", valor: d.linea_meta === null ? "—" : fmt.decimal(d.linea_meta, 1) },
                      { etiqueta: "Venta del día", valor: fmt.entero(d.asegurados_dia) },
                    ]}
                  />
                );
              }}
            />
            {resumen.fechaCorte ? (
              <ReferenceLine x={resumen.fechaCorte} stroke="var(--text-muted)" strokeDasharray="2 4" />
            ) : null}
            <Line type="monotone" dataKey="linea_meta" name="Meta" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="2 5" dot={false} connectNulls />
            <Line type="monotone" dataKey="proyeccion_visible" name="Proyección" stroke="var(--tono-cotizacion)" strokeWidth={2} strokeDasharray="7 5" dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="real_visible" name="Real" stroke={SERIES[0]} strokeWidth={2.5} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Quedan {fmt.entero(resumen.habilesRestantes)} días hábiles. La estimación
        supone que el ritmo medio observado se mantiene; no incorpora estacionalidad
        ni cambios futuros de dotación.
      </p>
    </div>
  );
}
