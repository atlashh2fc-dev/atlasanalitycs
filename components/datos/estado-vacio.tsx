import Link from "next/link";
import { ArrowRight, Database, Upload } from "lucide-react";

export function EstadoVacioDatos({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="vidrio rounded-2xl border-dashed px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] text-[var(--series-1)]">
        <Database className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold">
        Tu primera lectura empieza con una base
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">
        {compacto
          ? "Carga un Excel o CSV y Atlas organizará sus campos antes de crear el análisis."
          : "No necesitas configurar campañas, productos ni indicadores antes. Atlas detecta la estructura y te pregunta sólo cuando hay una duda."}
      </p>
      <Link
        href="/cargar"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Upload className="size-4" />
        Cargar una base
        <ArrowRight className="size-3.5" />
      </Link>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Excel, CSV o XLS · puedes corregir la interpretación antes de guardar
      </p>
    </div>
  );
}
