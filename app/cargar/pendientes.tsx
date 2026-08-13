"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/stat";
import { fmt } from "@/lib/utils";

export interface CargaPendiente {
  id: string;
  archivo: string;
  hoja: string | null;
  estado: string;
  filasProcesadas: number;
  filasTotales: number | null;
  error: string | null;
  fecha: string;
}

const TONO: Record<string, "good" | "warning" | "critical" | "neutro"> = {
  procesada: "good",
  mapeada: "warning",
  perfilada: "warning",
  recibida: "warning",
  error: "critical",
  revertida: "neutro",
};

const TEXTO: Record<string, string> = {
  procesada: "Completa",
  mapeada: "A medio procesar",
  perfilada: "A medio procesar",
  recibida: "A medio procesar",
  error: "Con error",
  revertida: "Revertida",
};

/**
 * Cargas registradas en la base.
 *
 * El avance vive en el servidor, así que esta lista sobrevive a que el
 * usuario navegue a otra pantalla o cierre el navegador: al volver ve
 * dónde quedó cada archivo y puede reanudarlo.
 */
export function Pendientes({
  cargas,
  esAdmin,
}: {
  cargas: CargaPendiente[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [avance, setAvance] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  async function reanudar(id: string) {
    setTrabajando(id);
    setError(null);

    for (let i = 0; i < 500; i++) {
      const res = await fetch("/api/carga/procesar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cargaId: id }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "No se pudo reanudar.");
        break;
      }

      setAvance((a) => ({
        ...a,
        [id]: json.total > 0 ? json.procesadas / json.total : 1,
      }));

      if (json.terminado) break;
    }

    setTrabajando(null);
    router.refresh();
  }

  /**
   * Deshace una carga: borra todo lo que derivó y la deja marcada. Es la
   * salida cuando un archivo entró con el mapeo equivocado.
   */
  async function revertir(id: string) {
    setTrabajando(id);
    setError(null);

    const res = await fetch("/api/carga/revertir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cargaId: id }),
    });

    const json = await res.json();
    if (!res.ok) setError(json.error ?? "No se pudo revertir.");

    setTrabajando(null);
    setConfirmando(null);
    router.refresh();
  }

  if (cargas.length === 0) return null;

  const incompletas = cargas.filter(
    (c) => c.estado !== "procesada" && c.estado !== "revertida",
  );

  return (
    <div>
      {incompletas.length > 0 ? (
        <p
          className="mb-3 rounded-md px-3 py-2 text-xs"
          style={{
            color: "var(--serious)",
            background: "color-mix(in srgb, var(--serious) 10%, transparent)",
          }}
        >
          Hay {incompletas.length} carga{incompletas.length === 1 ? "" : "s"} sin
          terminar. El archivo está guardado y el avance también: reanudar
          continúa exactamente donde quedó, sin duplicar nada.
        </p>
      ) : null}

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-[var(--text-muted)]">
            <th className="pb-1.5 font-medium">Archivo</th>
            <th className="pb-1.5 font-medium">Hoja</th>
            <th className="pb-1.5 font-medium">Avance</th>
            <th className="pb-1.5 font-medium">Estado</th>
            <th className="pb-1.5 text-right font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {cargas.map((c) => {
            const pct =
              avance[c.id] ??
              (c.filasTotales && c.filasTotales > 0
                ? c.filasProcesadas / c.filasTotales
                : c.estado === "procesada"
                  ? 1
                  : 0);

            return (
              <tr key={c.id} className="border-b last:border-0">
                <td className="max-w-[220px] truncate py-2 text-[var(--text-primary)]">
                  {c.archivo}
                </td>
                <td className="py-2 text-[var(--text-secondary)]">{c.hoja}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-0)]">
                      <div
                        className="h-full rounded-full bg-[var(--series-1)] transition-[width] duration-300"
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                    <span className="tabular text-[11px] text-[var(--text-secondary)]">
                      {fmt.entero(c.filasProcesadas)}
                      {c.filasTotales ? ` / ${fmt.entero(c.filasTotales)}` : ""}
                    </span>
                  </div>
                </td>
                <td className="py-2">
                  <Badge tono={TONO[c.estado] ?? "neutro"}>
                    {TEXTO[c.estado] ?? c.estado}
                  </Badge>
                  {c.error ? (
                    <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">
                      {c.error.slice(0, 60)}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-right">
                  {confirmando === c.id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        ¿Borrar lo que cargó?
                      </span>
                      <button
                        onClick={() => revertir(c.id)}
                        disabled={trabajando !== null}
                        className="font-medium text-[var(--critical)] hover:underline disabled:opacity-50"
                      >
                        Sí, revertir
                      </button>
                      <button
                        onClick={() => setConfirmando(null)}
                        className="text-[var(--text-muted)] hover:underline"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-3">
                      {c.estado !== "procesada" && c.estado !== "revertida" ? (
                        <button
                          onClick={() => reanudar(c.id)}
                          disabled={trabajando !== null}
                          className="font-medium text-[var(--series-1)] hover:underline disabled:opacity-50"
                        >
                          {trabajando === c.id ? "Procesando…" : "Reanudar"}
                        </button>
                      ) : null}

                      {esAdmin && c.estado !== "revertida" ? (
                        <button
                          onClick={() => setConfirmando(c.id)}
                          title="Borra las ventas, cotizaciones y asistencia que generó esta carga"
                          className="text-[var(--text-muted)] hover:text-[var(--critical)] hover:underline"
                        >
                          Revertir
                        </button>
                      ) : null}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {error ? (
        <p className="mt-2 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
