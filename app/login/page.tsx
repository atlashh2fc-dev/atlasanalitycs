"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, hayCredenciales } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);

    if (!hayCredenciales()) {
      setError(
        "El despliegue no tiene configuradas las variables de Supabase. Revisa /configuracion.",
      );
      setCargando(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: clave,
    });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : error.message,
      );
      setCargando(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight">Atlas</span>
            <span className="text-2xl font-light text-[var(--text-secondary)]">
              Analytics
            </span>
          </div>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Sube tu Excel y obtén el dashboard.
          </p>
        </div>

        <form onSubmit={entrar} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
            >
              Correo
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
            />
          </div>

          <div>
            <label
              htmlFor="clave"
              className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
            >
              Contraseña
            </label>
            <input
              id="clave"
              type="password"
              required
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="w-full rounded-md border bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md px-3 py-2 text-xs"
              style={{
                color: "var(--critical)",
                background: "color-mix(in srgb, var(--critical) 10%, transparent)",
              }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-md bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {cargando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
