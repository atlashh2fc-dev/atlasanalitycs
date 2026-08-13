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
        "superficie rounded-xl border p-5",
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
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{children}</h3>
      {hint ? (
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
