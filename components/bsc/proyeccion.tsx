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
    const habilesTranscurridos = puntos.filter((p) => !p.es_futuro && p.es_habil).length;
    const cierre = ultimo?.proyectado ?? corte?.acumulado ?? 0;
    const meta = ultimo?.linea_meta ?? null;
    const idealHoy = corte?.linea_meta ?? null;
    return {
      real: corte?.acumulado ?? 0,
      cierre,
      meta,
      idealHoy,
      brecha: meta === null ? null : cierre - meta,
      brechaHoy: idealHoy === null ? null : (corte?.acumulado ?? 0) - idealHoy,
      habilesRestantes,
      ritmoActual: habilesTranscurridos > 0 ? (corte?.acumulado ?? 0) / habilesTranscurridos : 0,
      ritmoNecesario:
        meta !== null && habilesRestantes > 0
          ? Math.max(0, (meta - (corte?.acumulado ?? 0)) / habilesRestantes)
          : null,
      fechaCorte: corte?.fecha ?? null,
      fechaCierre: ultimo?.fecha ?? null,
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
            Datos reales hasta {resumen.fechaCorte ? diaMes(resumen.fechaCorte) : "el corte"}; horizonte de cierre {resumen.fechaCierre ? diaMes(resumen.fechaCierre) : "—"}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right lg:grid-cols-4">
          <div>
            <p className="etiqueta">Real a hoy</p>
            <p className="cifra mt-1 text-xl">{fmt.entero(resumen.real)}</p>
          </div>
          <div>
            <p className="etiqueta">Ideal a hoy</p>
            <p className="cifra mt-1 text-xl">{resumen.idealHoy === null ? "—" : fmt.decimal(resumen.idealHoy, 1)}</p>
            {resumen.brechaHoy !== null ? (
              <p className="text-[10px]" style={{ color: resumen.brechaHoy >= 0 ? ESTADO.good : ESTADO.serious }}>
                {resumen.brechaHoy > 0 ? "+" : ""}{fmt.decimal(resumen.brechaHoy, 1)} vs. ritmo ideal
              </p>
            ) : null}
          </div>
          <div>
            <p className="etiqueta">Cierre lineal</p>
            <p
              className="cifra mt-1 text-xl"
              style={{ color: resumen.meta === null ? SERIES[0] : cumple ? ESTADO.good : ESTADO.serious }}
            >
              {fmt.decimal(resumen.cierre, 1)}
            </p>
          </div>
          {resumen.brecha !== null ? (
            <div>
              <p className="etiqueta">Ideal al cierre</p>
              <p
                className="cifra mt-1 text-xl"
                style={{ color: "var(--text-primary)" }}
              >
                {fmt.decimal(resumen.meta ?? 0, 1)}
              </p>
              <p className="text-[10px]" style={{ color: resumen.brecha >= 0 ? ESTADO.good : ESTADO.serious }}>
                cierre lineal {resumen.brecha > 0 ? "+" : ""}{fmt.decimal(resumen.brecha, 1)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 rounded" style={{ background: SERIES[0] }} /> Real hasta el corte</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 border-t-2 border-dashed" style={{ borderColor: "var(--tono-cotizacion)" }} /> Proyección lineal al cierre</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 border-t border-dashed border-[var(--text-muted)]" /> Ideal/meta acumulada</span>
      </div>

      <div className="mt-2 h-[290px]" role="img" aria-label="Asegurados acumulados, proyección y trayectoria de meta por día">
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
                      { etiqueta: "Acumulado real", valor: d.es_futuro ? "—" : fmt.entero(d.acumulado), color: SERIES[0] },
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

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-[var(--surface-0)] px-3.5 py-2.5 text-xs">
        <span>Ritmo real: <strong className="tabular">{fmt.decimal(resumen.ritmoActual, 2)}/día hábil</strong></span>
        <span>Ritmo necesario: <strong className="tabular" style={{ color: resumen.ritmoNecesario !== null && resumen.ritmoNecesario > resumen.ritmoActual ? ESTADO.serious : ESTADO.good }}>{resumen.ritmoNecesario === null ? "—" : `${fmt.decimal(resumen.ritmoNecesario, 2)}/día hábil`}</strong></span>
        <span className="text-[var(--text-muted)]">Quedan {fmt.entero(resumen.habilesRestantes)} días hábiles.</span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        El cierre lineal prolonga el ritmo observado sólo por días hábiles; el ideal distribuye la meta por jornada. No incorpora estacionalidad ni cambios futuros de dotación.
      </p>
    </div>
  );
}
