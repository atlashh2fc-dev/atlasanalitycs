"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Congela el periodo: crea (o reutiliza) el registro de periodo y ejecuta
 * calcular_kpi_periodo. Los KPI quedan guardados como snapshot, así el
 * histórico no cambia cuando llegan correcciones — es lo que hace
 * auditable la movilidad de cuartiles.
 */
export function RecalcularPeriodo() {
  const router = useRouter();
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [estado, setEstado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function recalcular() {
    setCargando(true);
    setEstado(null);

    const res = await fetch("/api/recalcular", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mes }),
    });

    const json = await res.json();
    setEstado(res.ok ? `Listo: ${json.filas} ejecutivos calculados.` : json.error);
    setCargando(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex items-end gap-2">
      <label className="text-xs text-[var(--text-secondary)]">
        <span className="mb-1 block font-medium">Cerrar periodo</span>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2.5 py-1.5 text-sm"
        />
      </label>
      <button
        onClick={recalcular}
        disabled={cargando}
        className="rounded-xl bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {cargando ? "Calculando…" : "Calcular KPI"}
      </button>
      {estado ? (
        <p className="pb-1.5 text-xs text-[var(--text-secondary)]">{estado}</p>
      ) : null}
    </div>
  );
}
