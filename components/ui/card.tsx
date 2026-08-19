import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "vidrio rounded-xl p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  hint,
  impacto,
}: {
  children: React.ReactNode;
  hint?: string;
  impacto?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{children}</h3>
        {impacto ? (
          <span className="rounded-md border border-[var(--vidrio-borde)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
            Impacta: {impacto}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{hint}</p>
      ) : null}
    </div>
  );
}
