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
    <Link href="/bsc" className="group flex min-w-0 items-center gap-3 rounded-xl px-2 py-1.5">
      <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[var(--series-1)] text-base font-bold tracking-[-0.08em] text-white shadow-[0_8px_22px_color-mix(in_srgb,var(--series-1)_28%,transparent)]">
        A
        <span className="absolute inset-x-1.5 bottom-1 h-px rotate-[-12deg] bg-white/55" aria-hidden="true" />
      </span>
      <span className="min-w-0 leading-none">
        <span className="block truncate text-[15px] font-semibold tracking-[-0.025em]">Atlas</span>
        <span className="mt-1 block truncate text-[11px] font-medium tracking-[0.02em] text-[var(--text-muted)]">Analytics</span>
      </span>
    </Link>
  );
}

export function Nav({ email }: { email: string | null }) {
  const path = usePathname();
  const actual = LINKS.find((item) => item.rutas.some((ruta) => path === ruta || path.startsWith(`${ruta}/`)));

  return (
    <>
      <aside className="atlas-sidebar fixed inset-y-0 left-0 z-50 hidden w-[var(--atlas-sidebar-width)] flex-col border-r border-[var(--vidrio-borde)] bg-[var(--plano-alto)] px-3 py-4 lg:flex">
        <Marca />
        <p className="etiqueta mb-2 mt-6 px-2.5">Navegación</p>
        <nav className="space-y-1">
          {LINKS.map((l) => {
            const activo = l.rutas.some((ruta) => path === ruta || path.startsWith(`${ruta}/`));
            const Icono = l.icono;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-[50px] items-center gap-3 rounded-xl border px-2.5 py-1.5 transition-[background-color,border-color,color,transform] duration-200",
                  activo
                    ? "border-[color-mix(in_srgb,var(--series-1)_24%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--series-1)_9%,var(--vidrio-alto))] text-[var(--text-primary)] shadow-[inset_3px_0_0_var(--series-1)]"
                    : "border-transparent text-[var(--text-secondary)] hover:border-[var(--vidrio-borde)] hover:bg-[var(--surface-0)] hover:text-[var(--text-primary)]",
                )}
              >
                <span className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-[9px] border transition-colors",
                  activo
                    ? "border-[color-mix(in_srgb,var(--series-1)_45%,transparent)] bg-[var(--series-1)] text-white shadow-[0_5px_14px_color-mix(in_srgb,var(--series-1)_22%,transparent)]"
                    : "border-[var(--vidrio-borde)] bg-[var(--surface-0)] text-[var(--text-secondary)] group-hover:border-[var(--vidrio-borde-alto)] group-hover:text-[var(--text-primary)]",
                )}>
                  <Icono className="size-[17px]" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[13px] font-semibold tracking-[-0.01em]">{l.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-medium text-[var(--text-muted)]">{l.detalle}</span>
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

      <div className="atlas-topbar fixed left-[var(--atlas-sidebar-width)] right-0 top-0 z-40 hidden h-[44px] items-center border-b border-[var(--vidrio-borde)] bg-[var(--plano-alto)] px-4 lg:flex">
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
