"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, Database, FolderPlus } from "lucide-react";
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
  datasetId: string | null;
  puedeUsar: boolean;
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
  datasets,
  esAdmin,
}: {
  cargas: CargaPendiente[];
  datasets: { id: string; nombre: string }[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [avance, setAvance] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("nuevo");
  const [nombreBase, setNombreBase] = useState("");

  function alternar(carga: CargaPendiente) {
    if (carga.estado !== "procesada" || !carga.puedeUsar) return;
    setSeleccionadas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(carga.id)) siguiente.delete(carga.id);
      else siguiente.add(carga.id);
      return siguiente;
    });

    if (!nombreBase) {
      setNombreBase(
        carga.archivo
          .replace(/\.(xlsx?|csv)$/i, "")
          .replace(/[_-]+/g, " ")
          .trim(),
      );
    }
  }

  async function usarEnAnalisis() {
    if (seleccionadas.size === 0) return;
    setTrabajando("organizando");
    setError(null);

    try {
      const res = await fetch("/api/carga/usar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cargaIds: [...seleccionadas],
          datasetId: destino === "nuevo" ? null : destino,
          nombre: destino === "nuevo" ? nombreBase : null,
        }),
      });
      const json = (await res.json()) as { datasetId?: string; error?: string };
      if (!res.ok || !json.datasetId) {
        setError(json.error ?? "No se pudieron preparar las cargas.");
        return;
      }
      router.push(`/analisis?dataset=${json.datasetId}`);
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setTrabajando(null);
    }
  }

  async function reanudar(id: string) {
    setTrabajando(id);
    setError(null);

    try {
      for (let i = 0; i < 500; i++) {
        const res = await fetch("/api/carga/procesar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cargaId: id }),
        });

        const texto = await res.text();
        let json: {
          error?: string;
          total?: number;
          procesadas?: number;
          terminado?: boolean;
        } = {};
        try {
          json = JSON.parse(texto);
        } catch {
          json = { error: `El servidor respondió ${res.status}.` };
        }

        if (!res.ok) {
          setError(json.error ?? "No se pudo reanudar.");
          break;
        }

        setAvance((a) => ({
          ...a,
          [id]: (json.total ?? 0) > 0 ? json.procesadas! / json.total! : 1,
        }));

        if (json.terminado) break;
      }
    } catch {
      setError("Se cortó la conexión. Puedes reanudar de nuevo.");
    } finally {
      setTrabajando(null);
      router.refresh();
    }
  }

  /**
   * Deshace una carga: borra todo lo que derivó y la deja marcada. Es la
   * salida cuando un archivo entró con el mapeo equivocado.
   */
  async function revertir(id: string) {
    setTrabajando(id);
    setError(null);

    // Todo dentro de try/finally: si la respuesta no es JSON —una página
    // de error, un timeout— el spinner igual se apaga. Antes la
    // excepción se tragaba el finally y quedaba girando para siempre.
    try {
      const res = await fetch("/api/carga/revertir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cargaId: id }),
      });

      const texto = await res.text();
      let json: { error?: string } = {};
      try {
        json = JSON.parse(texto);
      } catch {
        json = { error: `El servidor respondió ${res.status}.` };
      }

      if (!res.ok) setError(json.error ?? "No se pudo revertir.");
    } catch {
      setError("No se pudo contactar al servidor.");
    } finally {
      setTrabajando(null);
      setConfirmando(null);
      router.refresh();
    }
  }

  if (cargas.length === 0) return null;

  const incompletas = cargas.filter(
    (c) => c.estado !== "procesada" && c.estado !== "revertida",
  );
  const elegibles = cargas.filter(
    (c) => c.estado === "procesada" && c.puedeUsar,
  );
  const todasElegidas =
    elegibles.length > 0 && elegibles.every((c) => seleccionadas.has(c.id));
  const nombreDataset = new Map(datasets.map((d) => [d.id, d.nombre]));

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

      <div className="mb-4 rounded-xl border bg-[var(--surface-0)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Database className="size-4 text-[var(--series-1)]" />
              Analizar datos que ya cargaste
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Selecciona una o varias cargas completas y únelas en una base
              analizable. No necesitas volver a subir los archivos.
            </p>
          </div>
          {elegibles.length > 1 ? (
            <button
              type="button"
              onClick={() =>
                setSeleccionadas(
                  todasElegidas ? new Set() : new Set(elegibles.map((c) => c.id)),
                )
              }
              className="text-xs font-medium text-[var(--series-1)] hover:underline"
            >
              {todasElegidas ? "Quitar selección" : "Seleccionar todas"}
            </button>
          ) : null}
        </div>

        {seleccionadas.size > 0 ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
            <label className="min-w-[220px] text-xs text-[var(--text-secondary)]">
              <span className="mb-1 block font-medium">Guardar en</span>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="w-full rounded-xl border bg-[var(--vidrio-alto)] px-3 py-2 text-sm"
              >
                <option value="nuevo">Crear una base nueva</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>

            {destino === "nuevo" ? (
              <label className="min-w-[220px] flex-1 text-xs text-[var(--text-secondary)]">
                <span className="mb-1 block font-medium">Nombre de la base</span>
                <input
                  value={nombreBase}
                  onChange={(e) => setNombreBase(e.target.value)}
                  placeholder="Ej. Ventas agosto"
                  className="w-full rounded-xl border bg-[var(--vidrio-alto)] px-3 py-2 text-sm"
                />
              </label>
            ) : null}

            <button
              type="button"
              onClick={usarEnAnalisis}
              disabled={
                trabajando !== null ||
                (destino === "nuevo" && !nombreBase.trim())
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <FolderPlus className="size-4" />
              {trabajando === "organizando"
                ? "Preparando…"
                : `Analizar ${seleccionadas.size} carga${seleccionadas.size === 1 ? "" : "s"}`}
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-xs">
          <thead>
            <tr className="border-b text-left text-[var(--text-muted)]">
              <th className="w-9 pb-1.5 font-medium">
                <span className="sr-only">Seleccionar</span>
              </th>
              <th className="pb-1.5 font-medium">Archivo</th>
              <th className="pb-1.5 font-medium">Hoja</th>
              <th className="pb-1.5 font-medium">Base</th>
              <th className="pb-1.5 font-medium">Avance</th>
              <th className="pb-1.5 font-medium">Estado</th>
              <th className="pb-1.5 text-right font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
          {cargas.map((c) => {
            // Las cargas del flujo anterior no llevaban contador, así
            // que una completa se mostraba en 0 / 83. El estado manda.
            const pct =
              avance[c.id] ??
              (c.estado === "procesada"
                ? 1
                : c.filasTotales && c.filasTotales > 0
                  ? c.filasProcesadas / c.filasTotales
                  : 0);

            return (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(c.id)}
                    disabled={c.estado !== "procesada" || !c.puedeUsar}
                    onChange={() => alternar(c)}
                    aria-label={`Seleccionar ${c.archivo}, hoja ${c.hoja ?? "principal"}`}
                    title={
                      !c.puedeUsar
                        ? "Sólo el administrador o quien realizó la carga puede organizarla"
                        : c.estado !== "procesada"
                          ? "Termina esta carga antes de analizarla"
                          : "Seleccionar para análisis"
                    }
                    className="size-4 accent-[var(--series-1)] disabled:opacity-30"
                  />
                </td>
                <td className="max-w-[220px] truncate py-2 text-[var(--text-primary)]">
                  {c.archivo}
                </td>
                <td className="py-2 text-[var(--text-secondary)]">{c.hoja}</td>
                <td className="py-2 text-[var(--text-secondary)]">
                  {c.datasetId ? (
                    <Link
                      href={`/analisis?dataset=${c.datasetId}`}
                      className="inline-flex items-center gap-1 font-medium text-[var(--series-1)] hover:underline"
                    >
                      <BarChart3 className="size-3" />
                      {nombreDataset.get(c.datasetId) ?? "Ver análisis"}
                    </Link>
                  ) : (
                    <span className="text-[var(--text-muted)]">Sin organizar</span>
                  )}
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--surface-0)]">
                      <div
                        className="h-full rounded-full bg-[var(--series-1)] transition-[width] duration-300"
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                    <span className="tabular text-[11px] text-[var(--text-secondary)]">
                      {c.estado === "procesada"
                        ? fmt.entero(c.filasTotales ?? c.filasProcesadas)
                        : `${fmt.entero(c.filasProcesadas)}${
                            c.filasTotales ? ` / ${fmt.entero(c.filasTotales)}` : ""
                          }`}
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
      </div>

      {error ? (
        <p className="mt-2 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
