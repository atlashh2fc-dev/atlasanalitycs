"use client";

import { motion } from "framer-motion";
import { ESTADO, SERIES } from "@/components/charts/base";
import { usaMovimientoReducido } from "@/lib/animacion";
import { fmt } from "@/lib/utils";

export interface EtapaEmbudo {
  orden: number;
  etapa: string;
  valor: number;
  tasa_pct: number | null;
  detalle: string;
}

export function Embudo({ etapas }: { etapas: EtapaEmbudo[] }) {
  const reducido = usaMovimientoReducido();
  const maximo = Math.max(...etapas.map((e) => e.valor), 1);
  const tasasValidas = etapas.filter((e) => e.tasa_pct !== null && e.orden > 1);
  const fuga = tasasValidas.reduce<EtapaEmbudo | null>((peor, etapa) => {
    if (!peor || (etapa.tasa_pct ?? 100) < (peor.tasa_pct ?? 100)) return etapa;
    return peor;
  }, null);

  return (
    <div
      data-tono
      style={{ "--tono": "var(--tono-agendamiento)" } as React.CSSProperties}
      className="vidrio rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold">Embudo operativo</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-[var(--text-secondary)]">
            Volumen de cada etapa y conversión respecto de la anterior.
          </p>
        </div>
        {fuga ? (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ color: ESTADO.serious, background: "color-mix(in srgb, var(--serious) 12%, transparent)" }}
          >
            Mayor fuga: {fuga.etapa} · {fmt.decimal(fuga.tasa_pct ?? 0, 1)}%
          </span>
        ) : null}
      </div>

      {etapas.length === 0 ? (
        <p className="py-12 text-center text-xs text-[var(--text-muted)]">
          Sin actividad para construir el embudo.
        </p>
      ) : (
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {etapas.map((e, indice) => (
            <li key={e.orden} className="relative min-w-0">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="truncate text-xs font-medium">{e.etapa}</span>
                <span className="shrink-0 text-right">
                  <strong className="tabular block text-xs">{fmt.entero(e.valor)}</strong>
                  {indice > 0 ? (
                    <span className="tabular block text-[10px] text-[var(--text-muted)]">
                      {e.tasa_pct === null ? "—" : `${fmt.decimal(e.tasa_pct, 1)}%`}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="h-20 overflow-hidden rounded-xl border border-[var(--vidrio-borde)] bg-[var(--surface-0)]">
                <motion.div
                  initial={reducido ? false : { height: 0 }}
                  animate={{ height: `${Math.max((e.valor / maximo) * 100, e.valor > 0 ? 8 : 0)}%` }}
                  transition={{ delay: indice * 0.05, type: "spring", stiffness: 220, damping: 25 }}
                  className="mt-auto w-full"
                  style={{
                    background: `linear-gradient(to top, color-mix(in srgb, ${SERIES[indice % SERIES.length]} 55%, transparent), color-mix(in srgb, ${SERIES[indice % SERIES.length]} 12%, transparent))`,
                  }}
                  title={e.detalle}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-muted)]" title={e.detalle}>
                {e.detalle}
              </p>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
        Lectura orientativa: discador, cotizaciones y ventas se agregan por el mismo
        periodo, pero todavía no están enlazados como una cohorte única. Una tasa puede
        superar 100% si una etapa proviene de actividad iniciada antes del rango.
      </p>
    </div>
  );
}
