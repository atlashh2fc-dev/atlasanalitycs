"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  LineChart,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { createClient, hayCredenciales } from "@/lib/supabase/client";

const LOGO_ALTIUS = "https://www.altiusignite.com/o.svg";

const CAPACIDADES = [
  {
    icon: BarChart3,
    text: "Resultados, metas y proyección en una sola lectura.",
  },
  {
    icon: LineChart,
    text: "Del indicador al desvío, sin perder contexto.",
  },
  {
    icon: UsersRound,
    text: "Visibilidad por equipo, responsable y línea de negocio.",
  },
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mostrarClave, setMostrarClave] = useState(false);

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
    <main className="flex min-h-screen w-full flex-col bg-[#f7f7f8] text-[#1d1d1f] lg:flex-row">
      <aside className="flex shrink-0 flex-col justify-between gap-9 bg-[#09090a] px-6 py-7 text-white sm:px-9 lg:min-h-screen lg:w-[390px] lg:px-10 lg:py-11">
        <div>
          <div className="flex items-center gap-3.5">
            <a
              href="https://www.altiusignite.com/"
              target="_blank"
              rel="noreferrer"
              className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-black"
              aria-label="Altius Ignite"
            >
              <img
                src={LOGO_ALTIUS}
                alt="Altius"
                className="size-[54px] object-contain"
              />
            </a>
            <div>
              <p className="text-[17px] font-semibold tracking-[-0.025em]">Atlas Analytics</p>
              <p className="mt-0.5 text-[11px] text-white/45">Control ejecutivo</p>
            </div>
          </div>

          <div className="mt-9 border-l-2 border-[#7188dd] pl-4 lg:mt-12">
            <p className="max-w-[260px] text-xl font-medium leading-snug tracking-[-0.025em] lg:text-[22px]">
              La información que dirección necesita, sin ruido.
            </p>
          </div>

          <ul className="mt-7 hidden space-y-4 lg:block">
            {CAPACIDADES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-[13px] leading-5 text-white/62">
                <Icon
                  size={15}
                  strokeWidth={1.7}
                  className="mt-0.5 shrink-0 text-[#91a2e9]"
                  aria-hidden
                />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden border-t border-white/12 pt-4 lg:block">
          <div className="flex items-center gap-2 text-xs text-white/58">
            <ShieldCheck size={14} strokeWidth={1.7} aria-hidden />
            Acceso protegido por organización y rol
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-white/28">
            Altius Ignite · Atlas Suite
          </p>
        </div>
      </aside>

      <section className="relative flex flex-1 items-center justify-center px-5 py-12 sm:px-8 lg:min-h-screen">
        <div className="w-full max-w-[360px]">
          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[#1d1d1f]">
              Inicia sesión
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-[#73737a]">
              Usa el correo con el que te dieron acceso a Atlas.
            </p>
          </div>

          <form onSubmit={entrar} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#353539]">
                Correo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="h-11 w-full rounded-lg border border-[#d8d8dc] bg-white px-3 text-sm text-[#1d1d1f] outline-none transition placeholder:text-[#a1a1a8] hover:border-[#bdbdc3] focus:border-[#667bd1] focus:ring-2 focus:ring-[#667bd1]/15"
              />
            </div>

            <div>
              <label htmlFor="clave" className="mb-1.5 block text-sm font-medium text-[#353539]">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="clave"
                  type={mostrarClave ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-lg border border-[#d8d8dc] bg-white px-3 pr-11 text-sm text-[#1d1d1f] outline-none transition placeholder:text-[#a1a1a8] hover:border-[#bdbdc3] focus:border-[#667bd1] focus:ring-2 focus:ring-[#667bd1]/15"
                />
                <button
                  type="button"
                  onClick={() => setMostrarClave((actual) => !actual)}
                  className="absolute inset-y-0 right-1.5 grid w-9 place-items-center rounded-md text-[#86868b] transition hover:text-[#1d1d1f] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#667bd1]/30"
                  aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={mostrarClave}
                >
                  {mostrarClave ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-[#fff1f1] px-3 py-2.5 text-sm leading-5 text-[#a12d2d]"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={cargando}
              className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#1d1d1f] px-3 text-sm font-medium text-white transition hover:bg-[#343438] active:translate-y-px disabled:cursor-wait disabled:opacity-60"
            >
              {cargando ? "Entrando…" : "Entrar"}
              {!cargando ? (
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              ) : null}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-[#86868b]">
            Acceso restringido a usuarios autorizados.
            <br />
            Si no puedes entrar, avisa a tu administrador.
          </p>
        </div>

        <p className="absolute bottom-5 hidden text-[10px] uppercase tracking-[0.14em] text-[#b0b0b5] sm:block">
          Atlas Analytics · Enterprise Edition
        </p>
      </section>
    </main>
  );
}
