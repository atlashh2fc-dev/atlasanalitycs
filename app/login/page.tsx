"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
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
    <main className="min-h-screen bg-[#f4f6fa] text-[#111827] selection:bg-[#cbd5ff]">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[500px_minmax(0,1fr)] xl:grid-cols-[540px_minmax(0,1fr)]">
        <section className="relative flex min-h-screen flex-col bg-white px-6 py-7 sm:px-10 lg:px-12 lg:py-8 xl:px-16">
          <header className="flex items-center justify-between">
            <a
              href="https://www.altiusignite.com/"
              target="_blank"
              rel="noreferrer"
              className="grid size-[72px] place-items-center overflow-hidden rounded-[3px] bg-black shadow-[0_8px_24px_rgba(15,23,42,.12)]"
              aria-label="Altius Ignite"
            >
              <img
                src={LOGO_ALTIUS}
                alt="Altius"
                className="size-[68px] object-contain"
              />
            </a>
            <div className="text-right">
              <p className="text-sm font-semibold tracking-[-0.02em] text-[#172033]">
                Atlas Analytics
              </p>
              <p className="mt-0.5 text-[11px] text-[#8a93a3]">Enterprise Edition</p>
            </div>
          </header>

          <div className="my-auto w-full max-w-[380px] self-center py-10 lg:py-6">
            <div className="mb-8">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#526078]">
                Acceso corporativo
              </p>
              <h1 className="text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.045em] text-[#111827]">
                Bienvenido a tu centro de control
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#687386]">
                Ingresa con las credenciales asignadas a tu organización.
              </p>
            </div>

            <form onSubmit={entrar} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-xs font-semibold text-[#344054]"
                >
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
                  className="h-[50px] w-full rounded-lg border border-[#d7dce5] bg-white px-3.5 text-sm text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,.03)] outline-none transition placeholder:text-[#a6adba] hover:border-[#b8c0ce] focus:border-[#5570dd] focus:ring-4 focus:ring-[#5570dd]/10"
                />
              </div>

              <div>
                <label
                  htmlFor="clave"
                  className="mb-2 block text-xs font-semibold text-[#344054]"
                >
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
                    className="h-[50px] w-full rounded-lg border border-[#d7dce5] bg-white px-3.5 pr-12 text-sm text-[#111827] shadow-[0_1px_2px_rgba(16,24,40,.03)] outline-none transition placeholder:text-[#a6adba] hover:border-[#b8c0ce] focus:border-[#5570dd] focus:ring-4 focus:ring-[#5570dd]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarClave((actual) => !actual)}
                    className="absolute right-1 top-1 grid size-[42px] place-items-center rounded-md text-[#8a93a3] transition hover:bg-[#f2f4f8] hover:text-[#344054]"
                    aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {mostrarClave ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-[#f0c6c6] bg-[#fff7f7] px-3.5 py-3 text-xs leading-5 text-[#a83c3c]"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={cargando}
                className="group flex h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[#24365f] px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(36,54,95,.18)] transition hover:bg-[#1c2a4a] active:translate-y-px disabled:cursor-wait disabled:opacity-60"
              >
                {cargando ? "Validando acceso…" : "Ingresar a la plataforma"}
                {!cargando ? (
                  <ArrowRight
                    size={17}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                ) : null}
              </button>
            </form>

            <div className="mt-7 flex items-start gap-3 rounded-lg border border-[#e5e8ee] bg-[#f8f9fb] px-3.5 py-3">
              <LockKeyhole size={16} className="mt-0.5 shrink-0 text-[#5f6d84]" />
              <p className="text-[11px] leading-5 text-[#727d8f]">
                Acceso restringido. La sesión y la actividad están protegidas
                bajo las políticas de seguridad de tu organización.
              </p>
            </div>
          </div>

          <footer className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-[#a0a7b3]">
            <span>Altius Ignite</span>
            <span>Atlas Suite</span>
          </footer>
        </section>

        <section className="relative hidden min-h-screen overflow-hidden bg-[#11182b] p-6 text-white lg:flex lg:flex-col xl:p-8">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -right-32 -top-40 size-[540px] rounded-full bg-[#526ee8]/20 blur-[110px]" />
            <div className="absolute bottom-[-260px] left-[15%] size-[620px] rounded-full bg-[#394b9b]/18 blur-[130px]" />
            <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.035),transparent_35%)]" />
          </div>

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-[#9aabff]">
                <BarChart3 size={17} strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-xs font-semibold text-white/90">Atlas Analytics</p>
                <p className="mt-0.5 text-[10px] text-white/35">Control ejecutivo</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-medium text-white/55">
              <ShieldCheck size={13} />
              Entorno corporativo
            </div>
          </div>

          <div className="relative my-auto py-2 xl:py-4">
            <div className="mb-4 max-w-[650px]">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9aabff]">
                Business intelligence
              </p>
              <h2 className="max-w-[650px] text-[clamp(2.5rem,4.2vw,4.7rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
                Toda la operación.
                <span className="block text-white/50">Una sola lectura.</span>
              </h2>
              <p className="mt-3 max-w-[570px] text-sm leading-6 text-white/48 xl:text-base xl:leading-7">
                Resultados financieros, clientes, procesos y equipos conectados
                para decidir con contexto, no con intuición.
              </p>
            </div>

            <div className="max-w-[850px] overflow-hidden rounded-2xl border border-white/10 bg-[#f8f9fc] text-[#101828] shadow-[0_28px_70px_rgba(0,0,0,.28)]">
              <div className="flex items-center justify-between border-b border-[#e6e9ef] bg-white px-5 py-3.5">
                <div>
                  <p className="text-xs font-semibold">Resumen ejecutivo</p>
                  <p className="mt-0.5 text-[10px] text-[#8992a3]">Agosto 2026 · Actualizado hoy</p>
                </div>
                <div className="rounded-md border border-[#dfe3ea] bg-[#fafbfc] px-2.5 py-1.5 text-[10px] font-medium text-[#526078]">
                  Vista consolidada
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-[#e6e9ef] border-b border-[#e6e9ef] bg-white">
                {[
                  ["Ventas acumuladas", "$418,6M", "Meta 91,8%"],
                  ["Proyección de cierre", "$462,1M", "+6,8% vs. anterior"],
                  ["Conversión comercial", "24,7%", "+1,9 pts"],
                ].map(([etiqueta, valor, detalle]) => (
                  <div key={etiqueta} className="px-5 py-3">
                    <p className="text-[10px] font-medium text-[#7b8495]">{etiqueta}</p>
                    <p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#172033] xl:text-2xl">
                      {valor}
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-[#536bc7]">{detalle}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[1.45fr_.75fr] gap-4 p-4">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold text-[#344054]">Evolución de resultados</p>
                      <p className="mt-0.5 text-[9px] text-[#98a0ad]">Real vs. objetivo acumulado</p>
                    </div>
                    <div className="flex items-center gap-3 text-[9px] text-[#7b8495]">
                      <span className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-[#536bc7]" /> Real
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-[#b8bfcc]" /> Objetivo
                      </span>
                    </div>
                  </div>
                  <svg
                    viewBox="0 0 520 118"
                    className="h-[90px] w-full"
                    role="img"
                    aria-label="Gráfico de evolución de resultados"
                  >
                    {[20, 52, 84, 116].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="520"
                        y2={y}
                        stroke="#e6e9ef"
                        strokeWidth="1"
                      />
                    ))}
                    <path
                      d="M4 106 C70 98, 104 91, 152 81 S242 69, 292 61 S384 42, 516 25"
                      fill="none"
                      stroke="#b8bfcc"
                      strokeWidth="2"
                      strokeDasharray="5 5"
                    />
                    <path
                      d="M4 108 C52 103, 92 99, 132 89 S210 78, 250 73 S320 51, 362 48 S444 36, 516 15"
                      fill="none"
                      stroke="#536bc7"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <circle cx="516" cy="15" r="4" fill="#536bc7" />
                  </svg>
                </div>

                <div className="rounded-xl border border-[#e2e6ed] bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-medium text-[#7b8495]">Ritmo del mes</p>
                      <p className="mt-1 text-2xl font-semibold tracking-[-0.04em]">104,2%</p>
                    </div>
                    <span className="grid size-8 place-items-center rounded-lg bg-[#eef1ff] text-[#536bc7]">
                      <TrendingUp size={16} />
                    </span>
                  </div>
                  <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#edf0f4]">
                    <div className="h-full w-[78%] rounded-full bg-[#536bc7]" />
                  </div>
                  <p className="mt-3 text-[9px] leading-4 text-[#8a93a3]">
                    La operación avanza por sobre el ritmo necesario para alcanzar el objetivo.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="relative text-[10px] uppercase tracking-[0.14em] text-white/25">
            Información ejecutiva · Decisiones con contexto
          </p>
        </section>

        <section className="bg-[#11182b] px-6 py-12 text-white lg:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9aabff]">
            Atlas Analytics
          </p>
          <h2 className="mt-3 text-4xl font-semibold leading-[1.02] tracking-[-0.045em]">
            Toda la operación.
            <span className="block text-white/50">Una sola lectura.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/50">
            Resultados financieros, clientes, procesos y equipos conectados para
            decidir con contexto.
          </p>
        </section>
      </div>
    </main>
  );
}
