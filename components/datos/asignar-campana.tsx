"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Tags } from "lucide-react";

export function AsignarCampana({
  datasetId,
  campanas,
  campanaInicial,
}: {
  datasetId: string;
  campanas: { id: string; nombre: string }[];
  campanaInicial: string | null;
}) {
  const router = useRouter();
  const [campanaId, setCampanaId] = useState(campanaInicial ?? "");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const cambio = campanaId !== (campanaInicial ?? "");

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch(`/api/datasets/${datasetId}/campana`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campanaId: campanaId || null }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMensaje(json.error ?? "No se pudo guardar.");
        return;
      }
      setMensaje("Campaña actualizada");
      router.refresh();
    } catch {
      setMensaje("No se pudo contactar al servidor.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-xl border bg-[var(--surface-0)] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 text-xs text-[var(--text-secondary)]">
          <span className="mb-1 flex items-center gap-1.5 font-medium">
            <Tags className="size-3.5" /> Campaña asociada
          </span>
          <select
            value={campanaId}
            onChange={(event) => {
              setCampanaId(event.target.value);
              setMensaje(null);
            }}
            className="w-full rounded-xl border bg-[var(--vidrio-alto)] px-3 py-2 text-sm"
          >
            <option value="">Sin campaña</option>
            {campanas.map((campana) => (
              <option key={campana.id} value={campana.id}>
                {campana.nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={guardar}
          disabled={!cambio || guardando}
          className="rounded-xl bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
        >
          {guardando ? "Guardando…" : "Guardar asignación"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Se aplica a esta base, sus cargas históricas y los registros derivados
        de ellas. No cambia otras bases.
      </p>
      {mensaje ? (
        <p
          className={`mt-2 flex items-center gap-1 text-xs ${mensaje === "Campaña actualizada" ? "text-[var(--good)]" : "text-[var(--critical)]"}`}
        >
          {mensaje === "Campaña actualizada" ? (
            <Check className="size-3.5" />
          ) : null}
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
