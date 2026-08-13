import Link from "next/link";
import { ArrowRight, Database, Rows3 } from "lucide-react";

export interface DatasetResumen {
  id: string;
  nombre: string;
  descripcion: string | null;
  cargas: number;
  filas: number;
  ultimaCarga: string | null;
  estado: string | null;
}

const fecha = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const numero = new Intl.NumberFormat("es-CL");

export function DatasetCard({ dataset }: { dataset: DatasetResumen }) {
  return (
    <Link
      href={`/datos/${dataset.id}`}
      className="vidrio group rounded-2xl p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--series-1)_14%,transparent)] text-[var(--series-1)]">
          <Database className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{dataset.nombre}</h2>
            {dataset.estado ? (
              <span className="rounded-full border px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                {dataset.estado}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 min-h-8 text-xs text-[var(--text-secondary)]">
            {dataset.descripcion || "Base lista para explorar y actualizar."}
          </p>
        </div>
        <ArrowRight className="mt-1 size-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <Rows3 className="size-3.5" />
          {numero.format(dataset.filas)} filas
        </span>
        <span>
          {dataset.cargas} {dataset.cargas === 1 ? "carga" : "cargas"}
        </span>
        <span className="ml-auto">
          {dataset.ultimaCarga
            ? fecha.format(new Date(dataset.ultimaCarga))
            : "Sin cargas"}
        </span>
      </div>
    </Link>
  );
}
