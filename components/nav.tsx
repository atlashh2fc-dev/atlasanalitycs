"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Database, LogOut, Settings2, Target, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectorTema } from "./tema";

const LINKS = [
  { href: "/bsc", label: "Control", detalle: "Resultado ejecutivo", icono: Target, rutas: ["/bsc"] },
  { href: "/analisis", label: "Análisis", detalle: "Causas y tendencias", icono: BarChart3, rutas: ["/analisis", "/dashboard"] },
  { href: "/datos", label: "Datos", detalle: "Cobertura y calidad", icono: Database, rutas: ["/datos"] },
  { href: "/cargar", label: "Cargar", detalle: "Ingesta e historial", icono: Upload, rutas: ["/cargar"] },
  { href: "/equipo", label: "Equipo", detalle: "Desempeño y movilidad", icono: Users, rutas: ["/equipo"] },
  { href: "/administracion", label: "Administración", detalle: "Reglas y accesos", icono: Settings2, rutas: ["/administracion", "/mantenedor"] },
];

function Marca() {
  return (
    <Link href="/bsc" className="flex items-center gap-2">
      <span className="grid size-7 place-items-center rounded-lg bg-[var(--series-1)] text-xs font-bold text-white shadow-sm">A</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[13px] font-semibold tracking-tight">Atlas</span>
        <span className="text-[13px] font-light text-[var(--text-secondary)]">Analytics</span>
      </span>
    </Link>
  );
}

export function Nav({ email }: { email: string | null }) {
  const path = usePathname();
  const actual = LINKS.find((item) => item.rutas.some((ruta) => path === ruta || path.startsWith(`${ruta}/`)));

  return (
    <>
      <aside className="atlas-sidebar fixed inset-y-0 left-0 z-50 hidden w-[156px] flex-col border-r border-[var(--vidrio-borde)] bg-[var(--plano-alto)] px-2 py-3 lg:flex">
        <div className="px-2"><Marca /></div>
        <p className="etiqueta mb-1 mt-4 px-2">Navegación</p>
        <nav className="space-y-0.5">
          {LINKS.map((l) => {
            const activo = l.rutas.some((ruta) => path === ruta || path.startsWith(`${ruta}/`));
            const Icono = l.icono;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "group flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 transition-colors",
                  activo ? "bg-[var(--vidrio-alto)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-0)] hover:text-[var(--text-primary)]",
                )}
              >
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", activo ? "bg-[color-mix(in_srgb,var(--series-1)_16%,transparent)] text-[var(--series-1)]" : "bg-[var(--surface-0)]")}>
                  <Icono className="size-3.5" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">{l.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--vidrio-borde)] px-2 pt-3">
          <div className="mb-3 flex items-center justify-between"><SelectorTema /></div>
          {email ? <p className="mb-2 truncate text-[11px] text-[var(--text-muted)]">{email}</p> : null}
          <form action="/api/salir" method="post">
            <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-0)] hover:text-[var(--text-primary)]">
              <LogOut className="size-3.5" /> Salir
            </button>
          </form>
        </div>
      </aside>

      <div className="atlas-topbar fixed left-[156px] right-0 top-0 z-40 hidden h-[44px] items-center border-b border-[var(--vidrio-borde)] bg-[var(--plano-alto)] px-4 lg:flex">
        <span className="text-xs text-[var(--text-muted)]">Atlas Analytics</span>
        <span className="mx-2 text-[var(--border-strong)]">/</span>
        <span className="text-xs font-semibold">{actual?.label ?? "Producto"}</span>
        <span className="ml-auto rounded-full border border-[var(--vidrio-borde)] bg-[var(--surface-0)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Producción</span>
      </div>

      <header className="sticky top-0 z-40 border-b border-[var(--vidrio-borde)] bg-[color-mix(in_srgb,var(--plano)_90%,transparent)] px-4 py-2 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3">
          <Marca />
          <nav className="ml-auto flex items-center gap-1">
            {LINKS.map((l) => {
              const activo = l.rutas.some((ruta) => path === ruta || path.startsWith(`${ruta}/`));
              const Icono = l.icono;
              return <Link key={l.href} href={l.href} aria-label={l.label} className={cn("grid size-9 place-items-center rounded-lg", activo ? "bg-[var(--vidrio-alto)] text-[var(--series-1)]" : "text-[var(--text-secondary)]")}><Icono className="size-4" /></Link>;
            })}
          </nav>
        </div>
      </header>
    </>
  );
}
