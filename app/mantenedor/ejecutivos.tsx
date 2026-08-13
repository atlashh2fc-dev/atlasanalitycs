"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/stat";
import { fmt } from "@/lib/utils";

export interface EjecutivoFila {
  id: string;
  nombre: string;
  rut: string | null;
  jornada: number | null;
  activo: boolean;
  campanas: string[];
  alias: string[];
  registros: number;
}

const input =
  "w-full rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--series-1)]";

/**
 * Mantenedor de ejecutivos, agrupados por campaña.
 *
 * Los ejecutivos se crean solos al cargar un Excel, pero eso deja
 * duplicados cuando el mismo nombre viene escrito de dos formas y no
 * calzó la conciliación de alias. Acá se corrigen, se fusionan y se dan
 * de baja. No son usuarios del sistema: casi ninguno entra a la
 * aplicación.
 */
export function Ejecutivos({
  ejecutivos,
  campanas,
}: {
  ejecutivos: EjecutivoFila[];
  campanas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [jornada, setJornada] = useState("42");
  const [asignadas, setAsignadas] = useState<string[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [editandoJornada, setEditandoJornada] = useState<string | null>(null);
  const [fusionando, setFusionando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [campanaVista, setCampanaVista] = useState<string>("todas");

  async function llamar(metodo: string, cuerpo?: unknown, query = "") {
    setOcupado(true);
    setError(null);

    const res = await fetch(`/api/ejecutivos${query}`, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });

    const json = await res.json();
    setOcupado(false);

    if (!res.ok) {
      setError(json.error ?? "No se pudo completar la acción.");
      return null;
    }

    router.refresh();
    return json;
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const r = await llamar("POST", {
      nombre,
      rut: rut || undefined,
      jornada: Number(jornada),
      campanas: asignadas,
    });
    if (r) {
      setNombre("");
      setRut("");
      setAsignadas([]);
    }
  }

  const visibles =
    campanaVista === "todas"
      ? ejecutivos
      : campanaVista === "sin"
        ? ejecutivos.filter((e) => e.campanas.length === 0)
        : ejecutivos.filter((e) => e.campanas.includes(campanaVista));

  return (
    <div>
      {/* Filtro por campaña: la campaña manda sobre el ejecutivo */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setCampanaVista("todas")}
          className={`rounded-md border px-2.5 py-1 text-xs ${
            campanaVista === "todas"
              ? "border-[var(--series-1)] font-medium"
              : "text-[var(--text-secondary)]"
          }`}
        >
          Todas · {ejecutivos.length}
        </button>
        {campanas.map((c) => {
          const n = ejecutivos.filter((e) => e.campanas.includes(c.id)).length;
          return (
            <button
              key={c.id}
              onClick={() => setCampanaVista(c.id)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                campanaVista === c.id
                  ? "border-[var(--series-1)] font-medium"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {c.nombre} · {n}
            </button>
          );
        })}
        {ejecutivos.some((e) => e.campanas.length === 0) ? (
          <button
            onClick={() => setCampanaVista("sin")}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              campanaVista === "sin"
                ? "border-[var(--serious)] font-medium"
                : "text-[var(--text-secondary)]"
            }`}
            style={{ color: campanaVista === "sin" ? "var(--serious)" : undefined }}
          >
            Sin campaña · {ejecutivos.filter((e) => e.campanas.length === 0).length}
          </button>
        ) : null}
      </div>

      {/* Alta manual */}
      <form onSubmit={crear} className="mb-4 grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-[var(--text-secondary)]">
          <span className="mb-1 block font-medium">Nombre</span>
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Paula Guerra"
            className={input}
          />
        </label>
        <label className="text-xs text-[var(--text-secondary)]">
          <span className="mb-1 block font-medium">RUT (opcional)</span>
          <input
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            placeholder="12345678-5"
            className={input}
          />
        </label>
        <label className="text-xs text-[var(--text-secondary)]">
          <span className="mb-1 block font-medium">Jornada (horas)</span>
          <input
            type="number"
            value={jornada}
            onChange={(e) => setJornada(e.target.value)}
            className={input}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={ocupado}
            className="rounded-xl bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            Agregar ejecutivo
          </button>
        </div>

        <div className="sm:col-span-4 flex flex-wrap gap-3">
          {campanas.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={asignadas.includes(c.id)}
                onChange={(e) =>
                  setAsignadas((prev) =>
                    e.target.checked
                      ? [...prev, c.id]
                      : prev.filter((x) => x !== c.id),
                  )
                }
              />
              {c.nombre}
            </label>
          ))}
        </div>
      </form>

      {error ? (
        <p className="mb-3 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-[var(--text-muted)]">
            <th className="pb-1.5 font-medium">Ejecutivo</th>
            <th className="pb-1.5 font-medium">Campañas</th>
            <th className="pb-1.5 text-right font-medium">Jornada</th>
            <th className="pb-1.5 text-right font-medium">Registros</th>
            <th className="pb-1.5 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((e) => (
            <tr key={e.id} className="border-b align-top last:border-0">
              <td className="py-2">
                {editando === e.id ? (
                  <input
                    autoFocus
                    defaultValue={e.nombre}
                    onBlur={async (ev) => {
                      const v = ev.target.value.trim();
                      if (v && v !== e.nombre) {
                        await llamar("PATCH", { id: e.id, nombre: v });
                      }
                      setEditando(null);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") ev.currentTarget.blur();
                    }}
                    className="w-full rounded border bg-[var(--surface-2)] px-1.5 py-1"
                  />
                ) : (
                  <>
                    <span className="text-[var(--text-primary)]">{e.nombre}</span>
                    {!e.activo ? (
                      <Badge tono="neutro" className="ml-1.5">
                        inactivo
                      </Badge>
                    ) : null}
                    {e.alias.length > 1 ? (
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        también: {e.alias.filter((a) => a !== e.nombre).join(" · ")}
                      </span>
                    ) : null}
                  </>
                )}
              </td>

              <td className="py-2">
                <div className="flex flex-wrap gap-2">
                  {campanas.map((c) => (
                    <label key={c.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={e.campanas.includes(c.id)}
                        disabled={ocupado}
                        onChange={(ev) =>
                          llamar("PATCH", {
                            id: e.id,
                            campanas: ev.target.checked
                              ? [...e.campanas, c.id]
                              : e.campanas.filter((x) => x !== c.id),
                          })
                        }
                      />
                      {c.nombre}
                    </label>
                  ))}
                  {campanas.length === 0 ? (
                    <span className="text-[var(--text-muted)]">
                      Crea una campaña primero
                    </span>
                  ) : null}
                </div>
              </td>

              <td className="tabular py-2 text-right">
                {editandoJornada === e.id ? (
                  <input
                    autoFocus
                    type="number"
                    step="0.5"
                    min="1"
                    max="60"
                    defaultValue={e.jornada ?? 42}
                    onBlur={async (ev) => {
                      const v = Number(ev.target.value);
                      if (v > 0 && v !== Number(e.jornada)) {
                        await llamar("PATCH", { id: e.id, jornada: v });
                      }
                      setEditandoJornada(null);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") ev.currentTarget.blur();
                      if (ev.key === "Escape") setEditandoJornada(null);
                    }}
                    className="w-20 rounded border bg-[var(--surface-2)] px-1.5 py-1 text-right"
                  />
                ) : (
                  <button
                    onClick={() => setEditandoJornada(e.id)}
                    title="Clic para editar la jornada"
                    className="rounded px-1.5 py-0.5 hover:bg-[var(--surface-0)] hover:underline"
                  >
                    {e.jornada ? `${Number(e.jornada)} h` : "—"}
                  </button>
                )}
              </td>

              <td className="tabular py-2 text-right text-[var(--text-secondary)]">
                {fmt.entero(e.registros)}
              </td>

              <td className="py-2 text-right">
                {fusionando === e.id ? (
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={async (ev) => {
                      if (!ev.target.value) return;
                      await llamar(
                        "DELETE",
                        undefined,
                        `?id=${e.id}&destino=${ev.target.value}`,
                      );
                      setFusionando(null);
                    }}
                    onBlur={() => setFusionando(null)}
                    className="rounded border bg-[var(--surface-2)] px-1.5 py-1 text-xs"
                  >
                    <option value="">Fusionar con…</option>
                    {ejecutivos
                      .filter((o) => o.id !== e.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nombre}
                        </option>
                      ))}
                  </select>
                ) : (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditando(e.id)}
                      className="text-[var(--series-1)] hover:underline"
                    >
                      Renombrar
                    </button>
                    <button
                      onClick={() => setFusionando(e.id)}
                      title="Une este ejecutivo con otro y le traspasa toda su historia"
                      className="text-[var(--text-secondary)] hover:underline"
                    >
                      Fusionar
                    </button>
                    <button
                      onClick={() => llamar("PATCH", { id: e.id, activo: !e.activo })}
                      className="text-[var(--text-secondary)] hover:underline"
                    >
                      {e.activo ? "Desactivar" : "Reactivar"}
                    </button>
                    <button
                      onClick={() => llamar("DELETE", undefined, `?id=${e.id}`)}
                      className="text-[var(--text-muted)] hover:text-[var(--critical)] hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}

          {visibles.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-[var(--text-muted)]">
                No hay ejecutivos en esta vista.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <p className="mt-3 border-t pt-3 text-[11px] text-[var(--text-muted)]">
        La jornada se edita con un clic sobre el valor. Si la planilla de
        asistencia trae la jornada contractual, la carga la actualiza sola;
        mientras tanto, o cuando el archivo no la traiga, se corrige acá.
      </p>

      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Un ejecutivo con historial no se elimina en silencio: o se fusiona con
        otro —que le traspasa ventas, cotizaciones y asistencia— o se
        desactiva conservando sus datos. Borrarlo dejaría ventas huérfanas y
        rompería el ranking.
      </p>
    </div>
  );
}
