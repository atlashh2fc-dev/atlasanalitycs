"use client";

import { useMemo, useState } from "react";
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
  ritmo_proyeccion?: number | null;
  metodo_proyeccion?: "tendencia_ultima_semana" | "promedio_periodo";
}

const FORMATO_DIA = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
});

const FORMATO_MES = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
});

function diaMes(fecha: string): string {
  return FORMATO_DIA.format(new Date(`${fecha}T12:00:00`)).replace(".", "");
}

export function Proyeccion({
  puntos,
  puntosAnterior = [],
  titulo = "Trayectoria de cierre",
}: {
  puntos: PuntoProyeccion[];
  puntosAnterior?: PuntoProyeccion[];
  titulo?: string;
}) {
  const [mostrarAnterior, setMostrarAnterior] = useState(false);
  const etiquetaAnterior = puntosAnterior[0]
    ? FORMATO_MES.format(new Date(`${puntosAnterior[0].fecha}T12:00:00`))
    : "mes anterior";

  const comparacionAnterior = useMemo(() => {
    const anterioresHabiles = puntosAnterior.filter((p) => p.es_habil && !p.es_futuro);
    const cierreAnterior = puntosAnterior.findLast((p) => !p.es_futuro)?.acumulado ?? null;
    const habilesAlCorte = puntos.filter((p) => !p.es_futuro && p.es_habil).length;
    const anteriorComparable = habilesAlCorte > 0
      ? anterioresHabiles[habilesAlCorte - 1]?.acumulado ?? null
      : 0;
    let indiceHabil = 0;
    const datos = puntos.map((p) => {
      if (p.es_habil) indiceHabil += 1;
      return {
        ...p,
        anterior_visible: indiceHabil === 0
          ? 0
          : anterioresHabiles[indiceHabil - 1]?.acumulado ?? null,
      };
    });
    return { datos, cierreAnterior, anteriorComparable };
  }, [puntos, puntosAnterior]);

  const resumen = useMemo(() => {
    const ultimo = puntos.at(-1);
    const corte = puntos.findLast((p) => !p.es_futuro) ?? puntos[0];
    const habilesRestantes = puntos.filter((p) => p.es_futuro && p.es_habil).length;
    const habilesTranscurridos = puntos.filter((p) => !p.es_futuro && p.es_habil).length;
    const cierre = ultimo?.proyectado ?? corte?.acumulado ?? 0;
    const usaTendencia = ultimo?.metodo_proyeccion === "tendencia_ultima_semana";
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
      ritmoProyeccion: ultimo?.ritmo_proyeccion ??
        (habilesTranscurridos > 0 ? (corte?.acumulado ?? 0) / habilesTranscurridos : 0),
      usaTendencia,
      ritmoNecesario:
        meta !== null && habilesRestantes > 0
          ? Math.max(0, (meta - (corte?.acumulado ?? 0)) / habilesRestantes)
          : null,
      fechaCorte: corte?.fecha ?? null,
      fechaCierre: ultimo?.fecha ?? null,
      cierreAnterior: comparacionAnterior.cierreAnterior,
      anteriorComparable: comparacionAnterior.anteriorComparable,
      desviacionAnterior: comparacionAnterior.anteriorComparable === null
        ? null
        : (corte?.acumulado ?? 0) - comparacionAnterior.anteriorComparable,
    };
  }, [comparacionAnterior, puntos]);

  const datosGrafico = useMemo(() => {
    const corte = puntos.findLastIndex((p) => !p.es_futuro);
    return comparacionAnterior.datos.map((p, indice) => ({
      ...p,
      real_visible: p.es_futuro ? null : p.acumulado,
      proyeccion_visible: p.es_futuro || indice === corte ? p.proyectado : null,
    }));
  }, [comparacionAnterior.datos, puntos]);

  if (puntos.length === 0) {
    return (
      <div className="vidrio rounded-2xl p-5">
        <h3 className="text-[13px] font-semibold">{titulo}</h3>
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
          <h3 className="text-[13px] font-semibold">{titulo}</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-[var(--text-secondary)]">
            Datos reales hasta {resumen.fechaCorte ? diaMes(resumen.fechaCorte) : "el corte"}; horizonte de cierre {resumen.fechaCierre ? diaMes(resumen.fechaCierre) : "—"}.
          </p>
          <button
            type="button"
            aria-pressed={mostrarAnterior}
            disabled={puntosAnterior.length === 0}
            onClick={() => setMostrarAnterior((valor) => !valor)}
            className="mt-2 rounded-full border border-[var(--vidrio-borde)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition disabled:cursor-not-allowed disabled:opacity-45"
            style={mostrarAnterior ? { borderColor: "var(--tono-cliente)", color: "var(--tono-cliente)", background: "color-mix(in srgb, var(--tono-cliente) 10%, transparent)" } : undefined}
          >
            {puntosAnterior.length === 0
              ? "Mes anterior sin datos"
              : mostrarAnterior
                ? `Ocultar real de ${etiquetaAnterior}`
                : `Agregar real de ${etiquetaAnterior}`}
          </button>
        </div>
        <div className={`grid grid-cols-2 gap-x-6 gap-y-2 text-right ${mostrarAnterior ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
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
            <p className="etiqueta">Cierre proyectado</p>
            <p
              className="cifra mt-1 text-xl"
              style={{ color: resumen.meta === null ? SERIES[0] : cumple ? ESTADO.good : ESTADO.serious }}
            >
              {fmt.decimal(resumen.cierre, 1)}
            </p>
          </div>
          {mostrarAnterior && resumen.cierreAnterior !== null ? (
            <div>
              <p className="etiqueta">Real mes anterior</p>
              <p className="cifra mt-1 text-xl" style={{ color: "var(--tono-cliente)" }}>
                {fmt.entero(resumen.cierreAnterior)}
              </p>
              {resumen.desviacionAnterior !== null ? (
                <p className="text-[10px]" style={{ color: resumen.desviacionAnterior >= 0 ? ESTADO.good : ESTADO.serious }}>
                  actual {resumen.desviacionAnterior > 0 ? "+" : ""}{fmt.entero(resumen.desviacionAnterior)} al mismo día hábil
                </p>
              ) : null}
            </div>
          ) : null}
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
                cierre proyectado {resumen.brecha > 0 ? "+" : ""}{fmt.decimal(resumen.brecha, 1)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 rounded" style={{ background: SERIES[0] }} /> Real hasta el corte</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 border-t-2 border-dashed" style={{ borderColor: "var(--tono-cotizacion)" }} /> Proyección adaptativa al cierre</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 border-t border-dashed border-[var(--text-muted)]" /> Ideal/meta acumulada</span>
        {mostrarAnterior ? (
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 border-t-2 border-dotted" style={{ borderColor: "var(--tono-cliente)" }} /> Real {etiquetaAnterior}, alineado por día hábil</span>
        ) : null}
      </div>

      <div className="mt-2 h-[230px]" role="img" aria-label={`${titulo}: asegurados acumulados, proyección y trayectoria de meta por día`}>
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
                const d = payload[0].payload as PuntoProyeccion & { anterior_visible?: number | null };
                return (
                  <Tooltip
                    titulo={diaMes(d.fecha)}
                    filas={[
                      { etiqueta: "Acumulado real", valor: d.es_futuro ? "—" : fmt.entero(d.acumulado), color: SERIES[0] },
                      { etiqueta: "Proyección", valor: fmt.decimal(d.proyectado, 1), color: "var(--tono-cotizacion)" },
                      { etiqueta: "Meta a la fecha", valor: d.linea_meta === null ? "—" : fmt.decimal(d.linea_meta, 1) },
                      { etiqueta: "Venta del día", valor: fmt.entero(d.asegurados_dia) },
                      ...(mostrarAnterior ? [{ etiqueta: `Real ${etiquetaAnterior}`, valor: d.anterior_visible === null || d.anterior_visible === undefined ? "—" : fmt.entero(d.anterior_visible), color: "var(--tono-cliente)" }] : []),
                    ]}
                  />
                );
              }}
            />
            {resumen.fechaCorte ? (
              <ReferenceLine x={resumen.fechaCorte} stroke="var(--text-muted)" strokeDasharray="2 4" />
            ) : null}
            <Line type="monotone" dataKey="linea_meta" name="Meta" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="2 5" dot={false} connectNulls />
            {mostrarAnterior ? (
              <Line type="monotone" dataKey="anterior_visible" name={`Real ${etiquetaAnterior}`} stroke="var(--tono-cliente)" strokeWidth={2} strokeDasharray="3 4" dot={false} connectNulls={false} />
            ) : null}
            <Line type="monotone" dataKey="proyeccion_visible" name="Proyección" stroke="var(--tono-cotizacion)" strokeWidth={2} strokeDasharray="7 5" dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="real_visible" name="Real" stroke={SERIES[0]} strokeWidth={2.5} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-[var(--surface-0)] px-3.5 py-2.5 text-xs">
        <span>Ritmo real: <strong className="tabular">{fmt.decimal(resumen.ritmoActual, 2)}/día hábil</strong></span>
        <span>Ritmo proyectado: <strong className="tabular">{fmt.decimal(resumen.ritmoProyeccion, 2)}/día hábil</strong></span>
        <span>Ritmo necesario: <strong className="tabular" style={{ color: resumen.ritmoNecesario !== null && resumen.ritmoNecesario > resumen.ritmoActual ? ESTADO.serious : ESTADO.good }}>{resumen.ritmoNecesario === null ? "—" : `${fmt.decimal(resumen.ritmoNecesario, 2)}/día hábil`}</strong></span>
        <span className="text-[var(--text-muted)]">Quedan {fmt.entero(resumen.habilesRestantes)} días hábiles.</span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        {resumen.usaTendencia
          ? "Se detectó crecimiento sostenido en tres ventanas de cinco días hábiles; el forecast prolonga el ritmo de la última semana."
          : "Sin una tendencia semanal sostenida, el forecast usa el promedio del periodo."}{" "}
        El ideal distribuye la meta por jornada y no supone cambios futuros de dotación.
      </p>
    </div>
  );
}
