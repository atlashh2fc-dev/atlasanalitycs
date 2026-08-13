"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/stat";

export interface UsuarioFila {
  id: string;
  nombre: string;
  email: string;
  rol: "admin" | "supervisor";
  activo: boolean;
  campanas: string[];
}

const input =
  "w-full rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--series-1)]";
const boton =
  "rounded-xl bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-[var(--text-secondary)]">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

export function Usuarios({
  usuarios,
  campanas,
  huerfanos,
  yo,
}: {
  usuarios: UsuarioFila[];
  campanas: { id: string; nombre: string }[];
  huerfanos: { id: string; email: string }[];
  yo: string | null;
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<"admin" | "supervisor">("supervisor");
  const [asignadas, setAsignadas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<{
    email: string;
    clave?: string;
    vinculado?: boolean;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    setCredencial(null);

    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, nombre, rol, campanas: asignadas }),
    });

    const json = await res.json();
    setOcupado(false);

    if (!res.ok) {
      setError(json.error);
      return;
    }

    setCredencial({
      email: json.email,
      clave: json.clave,
      vinculado: json.vinculado,
    });
    setEmail("");
    setNombre("");
    setAsignadas([]);
    router.refresh();
  }

  async function actualizar(id: string, cambio: Record<string, unknown>) {
    setOcupado(true);
    setError(null);

    const res = await fetch("/api/usuarios", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...cambio }),
    });

    const json = await res.json();
    setOcupado(false);

    if (!res.ok) {
      setError(json.error);
      return;
    }
    if (json.clave) {
      const u = usuarios.find((x) => x.id === id);
      setCredencial({ email: u?.email ?? "", clave: json.clave });
    }
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={crear} className="grid gap-3 sm:grid-cols-4">
        <Campo label="Correo">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="paula@atlas.cl"
            className={input}
          />
        </Campo>
        <Campo label="Nombre">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Paula Rojas"
            className={input}
          />
        </Campo>
        <Campo label="Rol">
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as "admin" | "supervisor")}
            className={input}
          >
            <option value="supervisor">Supervisor</option>
            <option value="admin">Administrador</option>
          </select>
        </Campo>
        <div className="flex items-end">
          <button type="submit" disabled={ocupado} className={boton}>
            {ocupado ? "Creando…" : "Crear usuario"}
          </button>
        </div>

        {rol === "supervisor" ? (
          <div className="sm:col-span-4">
            <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
              Campañas que podrá ver
            </p>
            <div className="flex flex-wrap gap-3">
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
              {campanas.length === 0 ? (
                <span className="text-xs text-[var(--text-muted)]">
                  Crea una campaña primero.
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              Un supervisor sin campañas asignadas no ve datos. El
              administrador ve todo el tenant.
            </p>
          </div>
        ) : null}
      </form>

      {error ? (
        <p className="mt-3 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}

      {credencial ? (
        <div
          className="mt-3 rounded-md border p-3"
          style={{
            borderColor: "color-mix(in srgb, var(--good) 40%, transparent)",
            background: "color-mix(in srgb, var(--good) 8%, transparent)",
          }}
        >
          {credencial.vinculado ? (
            <>
              <p className="text-xs font-medium">Cuenta vinculada</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                <strong>{credencial.email}</strong> ya existía en Supabase. Se
                le dio acceso a esta organización y conserva su contraseña
                actual. Si no la recuerda, usa «Nueva clave» en la tabla.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium">Contraseña temporal</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Entrégasela a <strong>{credencial.email}</strong>. No se vuelve
                a mostrar; si se pierde, genera una nueva desde la tabla.
              </p>
              <code className="mt-2 block rounded bg-[var(--surface-2)] px-2 py-1.5 text-sm">
                {credencial.clave}
              </code>
            </>
          )}
        </div>
      ) : null}

      {huerfanos.length > 0 ? (
        <div
          className="mt-4 rounded-md border p-3"
          style={{
            borderColor: "color-mix(in srgb, var(--serious) 40%, transparent)",
            background: "color-mix(in srgb, var(--serious) 7%, transparent)",
          }}
        >
          <p className="text-xs font-medium">Cuentas sin acceso</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Existen en Supabase Auth pero no pertenecen a ninguna organización,
            así que pueden iniciar sesión y no ven nada. Dales acceso desde el
            formulario de arriba.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {huerfanos.map((h) => (
              <button
                key={h.id}
                onClick={() => {
                  setEmail(h.email);
                  setCredencial(null);
                  setError(null);
                }}
                className="rounded border bg-[var(--surface-2)] px-2 py-1 text-xs hover:border-[var(--series-1)]"
              >
                {h.email}
                <span className="ml-1.5 text-[var(--series-1)]">dar acceso</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <table className="mt-5 w-full text-xs">
        <thead>
          <tr className="border-b text-left text-[var(--text-muted)]">
            <th className="pb-1.5 font-medium">Usuario</th>
            <th className="pb-1.5 font-medium">Rol</th>
            <th className="pb-1.5 font-medium">Campañas</th>
            <th className="pb-1.5 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b last:border-0 align-top">
              <td className="py-2">
                <span className="block text-[var(--text-primary)]">{u.nombre}</span>
                <span className="text-[var(--text-muted)]">{u.email}</span>
                {!u.activo ? (
                  <Badge tono="critical" className="ml-1">
                    inactivo
                  </Badge>
                ) : null}
              </td>
              <td className="py-2">
                <select
                  value={u.rol}
                  disabled={ocupado || u.id === yo}
                  onChange={(e) => actualizar(u.id, { rol: e.target.value })}
                  className="rounded border bg-[var(--surface-2)] px-1.5 py-1 text-xs disabled:opacity-50"
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </td>
              <td className="py-2">
                {u.rol === "admin" ? (
                  <span className="text-[var(--text-muted)]">Todas</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {campanas.map((c) => (
                      <label key={c.id} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={u.campanas.includes(c.id)}
                          disabled={ocupado}
                          onChange={(e) =>
                            actualizar(u.id, {
                              campanas: e.target.checked
                                ? [...u.campanas, c.id]
                                : u.campanas.filter((x) => x !== c.id),
                            })
                          }
                        />
                        {c.nombre}
                      </label>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-2 text-right">
                <button
                  onClick={() => actualizar(u.id, { reiniciarClave: true })}
                  disabled={ocupado}
                  className="text-[var(--series-1)] hover:underline disabled:opacity-50"
                >
                  Nueva clave
                </button>
                {u.id !== yo ? (
                  <button
                    onClick={() => actualizar(u.id, { activo: !u.activo })}
                    disabled={ocupado}
                    className="ml-3 text-[var(--text-muted)] hover:underline disabled:opacity-50"
                  >
                    {u.activo ? "Desactivar" : "Reactivar"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
