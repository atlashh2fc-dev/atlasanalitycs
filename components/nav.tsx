"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Database, LogOut, Settings2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectorTema } from "./tema";

const LINKS = [
  { href: "/bsc", label: "Control", detalle: "Resultado ejecutivo", icono: Target, rutas: ["/bsc"] },
  { href: "/analisis", label: "Análisis", detalle: "Causas y responsables", icono: BarChart3, rutas: ["/analisis", "/dashboard", "/equipo"] },
  { href: "/datos", label: "Datos", detalle: "Cobertura y calidad", icono: Database, rutas: ["/datos", "/cargar"] },
  { href: "/administracion", label: "Administración", detalle: "Reglas y accesos", icono: Settings2, rutas: ["/administracion", "/mantenedor"] },
];

function Marca() {
  return (
    <Link href="/bsc" className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-[var(--series-1)] text-sm font-bold text-white shadow-sm">A</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[15px] font-semibold tracking-tight">Atlas</span>
        <span className="text-[15px] font-light text-[var(--text-secondary)]">Analytics</span>
      </span>
    </Link>
  );
}

export function Nav({ email }: { email: string | null }) {
  const path = usePathname();

  return (
    <>
      <aside className="atlas-sidebar fixed inset-y-0 left-0 z-50 hidden w-[196px] flex-col border-r border-[var(--vidrio-borde)] bg-[color-mix(in_srgb,var(--plano-alto)_94%,transparent)] px-2.5 py-3.5 backdrop-blur-xl lg:flex">
        <div className="px-2"><Marca /></div>
        <p className="etiqueta mb-1.5 mt-6 px-2.5">Navegación</p>
        <nav className="space-y-1">
          {LINKS.map((l) => {
            const activo = l.rutas.some((ruta) => path === ruta || path.startsWith(`${ruta}/`));
            const Icono = l.icono;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                  activo ? "bg-[var(--vidrio-alto)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-0)] hover:text-[var(--text-primary)]",
                )}
              >
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", activo ? "bg-[color-mix(in_srgb,var(--series-1)_16%,transparent)] text-[var(--series-1)]" : "bg-[var(--surface-0)]")}>
                  <Icono className="size-4" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{l.label}</span>
                  <span className="block truncate text-[10px] text-[var(--text-muted)]">{l.detalle}</span>
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
