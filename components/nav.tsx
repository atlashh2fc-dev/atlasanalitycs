"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Database, Settings2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectorTema } from "./tema";

const LINKS = [
  { href: "/dashboard", label: "Panel", icono: BarChart3 },
  { href: "/equipo", label: "Equipo", icono: Users },
  { href: "/cargar", label: "Cargar datos", icono: Database },
  { href: "/mantenedor", label: "Mantenedor", icono: Settings2 },
];

export function Nav({ email }: { email: string | null }) {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--vidrio-borde)] bg-[color-mix(in_srgb,var(--plano)_72%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1560px] items-center gap-6 px-6">
        <Link href="/dashboard" className="group flex items-center gap-2.5">
          {/* La marca: un cuadrado de vidrio con la A y el punto de
              acento de la suite. Es lo que hace que Analytics se lea
              como hermano de Atlas 360 y no como otro producto. */}
          <span
            className="grid size-7 place-items-center rounded-lg text-[13px] font-bold text-white"
            style={{
              background:
                "linear-gradient(140deg, color-mix(in srgb, var(--tono-venta) 92%, white), color-mix(in srgb, var(--tono-cotizacion) 85%, black))",
              boxShadow: "0 3px 12px color-mix(in srgb, var(--tono-venta) 45%, transparent)",
            }}
          >
            A
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight">Atlas</span>
            <span className="text-[15px] font-light text-[var(--text-secondary)]">
              Analytics
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {LINKS.map((l) => {
            const activo = path === l.href;
            const Icono = l.icono;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                  activo
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {activo ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-[var(--vidrio-borde-alto)] bg-[var(--vidrio-alto)]"
                  />
                ) : null}
                <Icono className="relative size-3.5" strokeWidth={2} />
                <span className="relative font-medium">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <SelectorTema />
          {email ? (
            <span className="hidden text-xs text-[var(--text-muted)] sm:block">
              {email}
            </span>
          ) : null}
          <form action="/api/salir" method="post">
            <button
              type="submit"
              className="rounded-full border border-[var(--vidrio-borde)] px-3 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--vidrio-borde-alto)] hover:text-[var(--text-primary)]"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
