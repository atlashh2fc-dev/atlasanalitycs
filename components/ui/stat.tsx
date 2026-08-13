import { cn } from "@/lib/utils";

type Estado = "good" | "warning" | "serious" | "critical" | "neutro";

const COLOR: Record<Estado, string> = {
  good: "var(--good)",
  warning: "var(--warning)",
  serious: "var(--serious)",
  critical: "var(--critical)",
  neutro: "var(--text-muted)",
};

/** Los estados nunca se comunican sólo por color: siempre llevan etiqueta. */
const ETIQUETA: Record<Estado, string> = {
  good: "En meta",
  warning: "En riesgo",
  serious: "Bajo ritmo",
  critical: "Crítico",
  neutro: "Sin dato",
};

export function Stat({
  label,
  valor,
  sub,
  estado = "neutro",
  mostrarEstado = false,
}: {
  label: string;
  valor: string;
  sub?: string;
  estado?: Estado;
  mostrarEstado?: boolean;
}) {
  return (
    <div className="superficie rounded-xl border p-5">
      <p className="etiqueta">{label}</p>
      <p className="cifra mt-2.5 text-[2rem] text-[var(--text-primary)]">{valor}</p>
      <div className="mt-2 flex items-center gap-2">
        {mostrarEstado && estado !== "neutro" ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ color: COLOR[estado], background: `color-mix(in srgb, ${COLOR[estado]} 12%, transparent)` }}
          >
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full"
              style={{ background: COLOR[estado] }}
            />
            {ETIQUETA[estado]}
          </span>
        ) : null}
        {sub ? (
          <p className="text-xs text-[var(--text-secondary)]">{sub}</p>
        ) : null}
      </div>
    </div>
  );
}

export function estadoPorCumplimiento(pct: number | null): Estado {
  if (pct === null || Number.isNaN(pct)) return "neutro";
  if (pct >= 1) return "good";
  if (pct >= 0.85) return "warning";
  if (pct >= 0.6) return "serious";
  return "critical";
}

export function Badge({
  children,
  tono = "neutro",
  className,
}: {
  children: React.ReactNode;
  tono?: Estado;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={{
        color: COLOR[tono],
        background: `color-mix(in srgb, ${COLOR[tono]} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
