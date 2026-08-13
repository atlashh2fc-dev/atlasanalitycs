"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/equipo", label: "Equipo" },
  { href: "/cargar", label: "Cargar datos" },
  { href: "/mantenedor", label: "Mantenedor" },
];

export function Nav({ email }: { email: string | null }) {
  const path = usePathname();

  return (
    <header className="border-b bg-[var(--surface-2)]">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-8 px-6">
        <Link href="/dashboard" className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold tracking-tight">Atlas</span>
          <span className="text-[15px] font-light text-[var(--text-secondary)]">
            Analytics
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                path === l.href
                  ? "bg-[var(--surface-0)] font-medium text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-0)]",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {email ? (
            <span className="text-xs text-[var(--text-muted)]">{email}</span>
          ) : null}
          <form action="/api/salir" method="post">
            <button
              type="submit"
              className="rounded-md border px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-0)]"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
