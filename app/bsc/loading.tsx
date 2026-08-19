export default function LoadingControl() {
  return (
    <main className="mx-auto max-w-[1400px] px-6 py-4" aria-label="Cargando Control">
      <div className="mb-3 h-6 w-64 animate-pulse rounded-lg bg-[var(--surface-1)]" />
      <div className="h-44 animate-pulse rounded-[10px] border border-[var(--vidrio-borde)] bg-[var(--surface-1)]" />
    </main>
  );
}
