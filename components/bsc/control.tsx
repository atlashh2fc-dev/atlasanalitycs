"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ESTADO } from "@/components/charts/base";
import { usaMovimientoReducido } from "@/lib/animacion";
import { fmt } from "@/lib/utils";

export interface FilaControl {
  ejecutivo_id: string;
  ejecutivo: string;
  jornada_horas: number;
  gestiones: number;
  contactos: number;
  contactabilidad_pct: number | null;
  conversion_pct: number | null;
  contratos: number;
  asegurados: number;
  meta_asignada: number;
  meta_es_propia: boolean;
  cumplimiento_pct: number | null;
  ritmo_esperado: number;
  proyeccion: number | null;
  ingreso_clp: number;
  costo_fijo_clp: number;
  costo_variable_clp: number;
  costo_total_clp: number;
  margen_clp: number;
  equilibrio_aseg: number | null;
  estado: string;
}

const COLOR: Record<string, string> = {
  "en meta": ESTADO.good,
  "en ritmo": "var(--tono-venta)",
  "bajo ritmo": "var(--warning)",
  "no cubre su costo": ESTADO.serious,
  "sin produccion": "var(--critical)",
};

const ETIQUETA: Record<string, string> = {
  "en meta": "En meta",
  "en ritmo": "En ritmo",
  "bajo ritmo": "Bajo ritmo",
  "no cubre su costo": "No cubre su costo",
  "sin produccion": "Sin producción",
};

/**
 * Barra de avance con las dos referencias que un supervisor necesita
 * antes de decidir nada: dónde deja de costar plata este ejecutivo, y
 * dónde debería ir hoy.
 *
 * La escala es la meta, así que todas las barras son comparables entre
 * personas con jornada distinta.
 */
function Barra({ fila }: { fila: FilaControl }) {
  const reducido = usaMovimientoReducido();

  // El eje llega hasta la meta, salvo que alguien la haya superado.
  const techo = Math.max(fila.meta_asignada, fila.asegurados, 1) * 1.02;
  const pos = (v: number) => `${Math.min((v / techo) * 100, 100)}%`;
  const color = COLOR[fila.estado] ?? "var(--text-muted)";

  return (
    <div className="relative h-5 w-full">
      <div className="absolute inset-y-1.5 left-0 right-0 rounded-full bg-[var(--vidrio-borde)]" />

      <motion.div
        className="absolute inset-y-1.5 left-0 rounded-full"
        initial={reducido ? false : { width: 0 }}
        animate={{ width: pos(fila.asegurados) }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
        }}
      />

      {/* Punto de equilibrio: desde acá el ejecutivo se paga solo. */}
      {fila.equilibrio_aseg !== null ? (
        <span
          className="absolute inset-y-0 w-px"
          style={{
            left: pos(fila.equilibrio_aseg),
            background: "var(--text-primary)",
            opacity: 0.85,
          }}
          title={`Equilibrio: ${fmt.decimal(fila.equilibrio_aseg, 1)} asegurados`}
        />
      ) : null}

      {/* Ritmo que correspondería a hoy. */}
      <span
        className="absolute inset-y-1 w-px"
        style={{
          left: pos(fila.ritmo_esperado),
          background: "var(--text-muted)",
          opacity: 0.9,
        }}
        title={`Ritmo a hoy: ${fmt.decimal(fila.ritmo_esperado, 1)}`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Control({ filas }: { filas: FilaControl[] }) {
  const reducido = usaMovimientoReducido();
  const [soloProblemas, setSoloProblemas] = useState(false);

  const visibles = soloProblemas
    ? filas.filter((f) => f.margen_clp < 0)
    : filas;

  const cubren = filas.filter((f) => f.margen_clp >= 0).length;
  const sinProduccion = filas.filter((f) => f.asegurados === 0).length;
  const perdida = filas
    .filter((f) => f.margen_clp < 0)
    .reduce((s, f) => s + f.margen_clp, 0);

  return (
    <motion.div
      initial={reducido ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      data-tono
      style={{ "--tono": "var(--tono-cliente)" } as React.CSSProperties}
      className="vidrio rounded-2xl p-5"
    >
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold">Control por ejecutivo</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-[var(--text-secondary)]">
            La barra llega hasta la meta de cada uno. La marca blanca es su
            punto de equilibrio —desde ahí se paga solo— y la gris, el ritmo
            que corresponde a hoy. La meta se reparte por jornada, así que
            30 y 42 horas no compiten con la misma vara.
          </p>
        </div>
        <button
          onClick={() => setSoloProblemas((v) => !v)}
          className="pildora shrink-0 text-[11px]"
          style={
            soloProblemas
              ? {
                  borderColor: "color-mix(in srgb, var(--serious) 55%, transparent)",
                  color: "var(--serious)",
                }
              : undefined
          }
        >
          {soloProblemas ? "Ver a todos" : "Sólo los que no cubren"}
        </button>
      </div>

      <div className="mb-4 mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-[var(--text-secondary)]">
          Se pagan solos{" "}
          <strong className="tabular text-[var(--text-primary)]">
            {cubren} de {filas.length}
          </strong>
        </span>
        <span className="text-[var(--text-secondary)]">
          Sin producción{" "}
          <strong className="tabular" style={{ color: "var(--critical)" }}>
            {sinProduccion}
          </strong>
        </span>
        <span className="text-[var(--text-secondary)]">
          Costo no cubierto{" "}
          <strong className="tabular" style={{ color: ESTADO.serious }}>
            {fmt.clp(perdida)}
          </strong>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-xs">
          <thead>
            <tr className="border-b text-left text-[var(--text-muted)]">
              <th className="pb-1.5 pr-2 font-medium">Ejecutivo</th>
              <th className="px-2 pb-1.5 text-right font-medium">Jorn.</th>
              <th className="px-2 pb-1.5 text-right font-medium">Gest.</th>
              <th className="pb-1.5 text-right font-medium" title="De cada cien intentos, en cuántos se habló con la persona">
                Contacto
              </th>
              <th className="pb-1.5 text-right font-medium" title="De cada cien conversaciones reales, cuántas terminaron en venta">
                Cierre
              </th>
              <th className="px-2 pb-1.5 text-right font-medium">Ventas</th>
              <th className="px-2 pb-1.5 text-right font-medium">Aseg.</th>
              <th className="w-[24%] px-3 pb-1.5 font-medium">Avance sobre su meta</th>
              <th className="px-2 pb-1.5 text-right font-medium">Meta</th>
              <th className="px-2 pb-1.5 text-right font-medium">Equilibrio</th>
              <th className="px-2 pb-1.5 text-right font-medium">Margen</th>
              <th className="pl-2 pb-1.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {visibles.map((f) => (
              <tr key={f.ejecutivo_id} className="border-b last:border-0">
                <td className="max-w-[190px] truncate py-2 pr-2 font-medium text-[var(--text-primary)]">
                  {f.ejecutivo}
                </td>
                <td className="px-2 py-2 text-right text-[var(--text-secondary)]">
                  {fmt.entero(f.jornada_horas)}
                </td>
                <td className="px-2 py-2 text-right text-[var(--text-secondary)]">
                  {f.gestiones === 0 ? "—" : fmt.entero(f.gestiones)}
                </td>
                <td className="px-2 py-2 text-right text-[var(--text-secondary)]">
                  {f.contactabilidad_pct === null
                    ? "—"
                    : `${fmt.decimal(f.contactabilidad_pct, 0)}%`}
                </td>
                <td className="px-2 py-2 text-right text-[var(--text-secondary)]">
                  {f.conversion_pct === null
                    ? "—"
                    : `${fmt.decimal(f.conversion_pct, 1)}%`}
                </td>
                <td className="px-2 py-2 text-right">{fmt.entero(f.contratos)}</td>
                <td className="px-2 py-2 text-right font-semibold">
                  {fmt.entero(f.asegurados)}
                </td>
                <td className="px-3 py-2">
                  <Barra fila={f} />
                </td>
                <td className="px-2 py-2 text-right text-[var(--text-secondary)]">
                  {fmt.decimal(f.meta_asignada, 1)}
                  {f.meta_es_propia ? null : (
                    <span className="ml-0.5 text-[var(--text-muted)]" title="Prorrateada por jornada">
                      *
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-[var(--text-secondary)]">
                  {f.equilibrio_aseg === null
                    ? "—"
                    : fmt.decimal(f.equilibrio_aseg, 1)}
                </td>
                <td
                  className="py-2 text-right font-semibold"
                  style={{
                    color: f.margen_clp >= 0 ? ESTADO.good : ESTADO.serious,
                  }}
                >
                  {fmt.clp(f.margen_clp)}
                </td>
                <td className="pl-2 py-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      color: COLOR[f.estado],
                      background: `color-mix(in srgb, ${COLOR[f.estado]} 13%, transparent)`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-1.5 rounded-full"
                      style={{ background: COLOR[f.estado] }}
                    />
                    {ETIQUETA[f.estado] ?? f.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Contacto y cierre salen del archivo del discador y separan tres
        problemas distintos: quien marca poco, quien marca mucho y no
        alcanza a nadie, y quien conversa pero no cierra. El asterisco
        marca las metas repartidas por jornada. El equilibrio se calcula al
        mix y al tramo de comisión de hoy: al cambiar de tramo se mueve,
        por eso el margen en pesos es el número exacto.
      </p>
    </motion.div>
  );
}
