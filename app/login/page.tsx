"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { createClient, hayCredenciales } from "@/lib/supabase/client";

const LOGO_ALTIUS = "https://www.altiusignite.com/o.svg";

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
    <main className="relative min-h-screen overflow-hidden bg-[#020506] text-white selection:bg-cyan-300/25">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-[18rem] top-[-24rem] size-[52rem] rounded-full bg-cyan-400/[0.09] blur-[140px]" />
        <div className="absolute bottom-[-26rem] right-[-18rem] size-[54rem] rounded-full bg-blue-600/[0.08] blur-[150px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.65)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.65)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1600px] lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,.85fr)]">
        <section className="flex min-h-[52vh] flex-col px-6 py-7 sm:px-10 sm:py-8 lg:min-h-screen lg:px-14 lg:py-6 xl:px-20 xl:py-8">
          <a
            href="https://www.altiusignite.com/"
            target="_blank"
            rel="noreferrer"
            className="relative block h-[62px] w-[124px] overflow-hidden sm:h-[68px] sm:w-[136px]"
            aria-label="Altius Ignite"
          >
            <img
              src={LOGO_ALTIUS}
              alt="Altius"
              className="absolute inset-0 size-full object-contain"
            />
          </a>

          <div className="my-auto max-w-[760px] py-12 lg:py-7">
            <div className="mb-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
              <span className="h-px w-8 bg-cyan-300/60" />
              Atlas Analytics · Control ejecutivo
            </div>

            <h1 className="max-w-[720px] text-[clamp(3rem,5vw,5.6rem)] font-semibold leading-[0.92] tracking-[-0.065em]">
              Claridad para decidir.
              <span className="mt-2 block bg-gradient-to-r from-cyan-200 via-sky-300 to-blue-400 bg-clip-text text-transparent">
                Ritmo para ejecutar.
              </span>
            </h1>

            <p className="mt-5 max-w-[600px] text-base leading-7 text-white/55 sm:text-lg sm:leading-8">
              Resultados, operación y equipo en una sola vista. La información
              que dirección necesita para anticipar desvíos y actuar a tiempo.
            </p>

            <div className="mt-6 hidden max-w-[650px] gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.08] sm:grid sm:grid-cols-3">
              {[
                ["01", "Resultado", "Lo crítico, primero"],
                ["02", "Causa", "Del dato al responsable"],
                ["03", "Acción", "Decisiones con seguimiento"],
              ].map(([numero, titulo, detalle]) => (
                <div key={numero} className="bg-[#071013]/90 px-5 py-3.5">
                  <span className="text-[10px] font-semibold tracking-[0.2em] text-cyan-300/55">
                    {numero}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-white/90">{titulo}</p>
                  <p className="mt-1 text-xs text-white/40">{detalle}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-white/25 sm:flex">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]" />
            Plataforma corporativa · Acceso seguro
          </div>
        </section>

        <section className="relative flex items-center justify-center border-t border-white/[0.08] bg-white/[0.025] px-6 py-10 backdrop-blur-sm lg:min-h-screen lg:border-l lg:border-t-0 lg:px-10 lg:py-8 xl:px-16">
          <div className="w-full max-w-[430px]">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200">
                  <BarChart3 size={20} strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-base font-semibold tracking-[-0.02em]">Atlas Analytics</p>
                  <p className="mt-0.5 text-xs text-white/38">Plataforma de control empresarial</p>
                </div>
              </div>
              <ShieldCheck className="text-white/20" size={21} strokeWidth={1.5} />
            </div>

            <div className="mb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/60">
                Acceso corporativo
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                Ingresa a tu operación
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/42">
                Utiliza las credenciales asignadas a tu organización.
              </p>
            </div>

            <form onSubmit={entrar} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-medium text-white/55">
                  Correo corporativo
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@empresa.com"
                  className="h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.055] px-4 text-sm text-white outline-none transition placeholder:text-white/20 hover:border-white/[0.16] focus:border-cyan-300/45 focus:bg-white/[0.075] focus:ring-4 focus:ring-cyan-300/[0.06]"
                />
              </div>

              <div>
                <label htmlFor="clave" className="mb-2 block text-xs font-medium text-white/55">
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
                    placeholder="Ingresa tu contraseña"
                    className="h-12 w-full rounded-xl border border-white/[0.1] bg-white/[0.055] px-4 pr-12 text-sm text-white outline-none transition placeholder:text-white/20 hover:border-white/[0.16] focus:border-cyan-300/45 focus:bg-white/[0.075] focus:ring-4 focus:ring-cyan-300/[0.06]"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarClave((actual) => !actual)}
                    className="absolute right-1 top-1 grid size-10 place-items-center rounded-lg text-white/35 transition hover:bg-white/[0.06] hover:text-white/70"
                    aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {mostrarClave ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-400/15 bg-red-400/[0.08] px-3.5 py-3 text-xs leading-5 text-red-200"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={cargando}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-sky-400 px-4 text-sm font-semibold text-[#031014] shadow-[0_12px_38px_rgba(56,189,248,.16)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
              >
                {cargando ? "Validando acceso…" : "Ingresar a la plataforma"}
                {!cargando ? (
                  <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                ) : null}
              </button>
            </form>

            <p className="mt-6 border-t border-white/[0.08] pt-5 text-center text-[11px] leading-5 text-white/28">
              Acceso restringido a usuarios autorizados. La actividad de esta
              plataforma puede ser registrada para fines de seguridad.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
