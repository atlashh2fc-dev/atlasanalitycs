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
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="vidrio w-full max-w-[380px] rounded-3xl p-8">
        <div className="mb-7">
          <span
            className="mb-4 grid size-10 place-items-center rounded-xl text-base font-bold text-white"
            style={{
              background:
                "linear-gradient(140deg, color-mix(in srgb, var(--tono-venta) 92%, white), color-mix(in srgb, var(--tono-cotizacion) 85%, black))",
              boxShadow: "0 6px 22px color-mix(in srgb, var(--tono-venta) 45%, transparent)",
            }}
          >
            A
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold tracking-tight">Atlas</span>
            <span className="text-[22px] font-light text-[var(--text-secondary)]">
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
              className="w-full rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--series-1)]"
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
              className="w-full rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[var(--series-1)]"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl px-3 py-2 text-xs"
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
            className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--tono-venta) 92%, white), color-mix(in srgb, var(--tono-cotizacion) 80%, black))",
              boxShadow: "0 8px 24px color-mix(in srgb, var(--tono-venta) 38%, transparent)",
            }}
          >
            {cargando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
