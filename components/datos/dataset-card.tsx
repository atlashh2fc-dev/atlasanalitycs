import Link from "next/link";
import { ArrowRight, BarChart3, Rows3, Settings2, Tags, Upload } from "lucide-react";

export interface CampanaResumen {
  id: string;
  nombre: string;
  tipo: string;
  descripcion: string | null;
  datasetId: string | null;
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

export function CampanaCard({ campana }: { campana: CampanaResumen }) {
  return (
    <article className="vidrio rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--series-1)_14%,transparent)] text-[var(--series-1)]">
          <Tags className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{campana.nombre}</h2>
            <span className="rounded-full border px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
              {campana.tipo}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 min-h-8 text-xs text-[var(--text-secondary)]">
            {campana.descripcion ||
              "Todas las cargas, usuarios e indicadores quedan reunidos en esta campaña."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <Rows3 className="size-3.5" />
          {numero.format(campana.filas)} filas
        </span>
        <span>
          {campana.cargas} {campana.cargas === 1 ? "carga" : "cargas"}
        </span>
        <span className="ml-auto">
          {campana.ultimaCarga
            ? fecha.format(new Date(campana.ultimaCarga))
            : "Sin cargas"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/cargar?campana=${campana.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--series-1)] px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Upload className="size-3.5" /> Cargar archivo
        </Link>
        {campana.datasetId ? (
          <Link
            href={`/datos/${campana.datasetId}`}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
          >
            <BarChart3 className="size-3.5" /> Datos y análisis
          </Link>
        ) : null}
        <Link
          href={`/mantenedor?campana=${campana.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
        >
          <Settings2 className="size-3.5" /> Configurar
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </article>
  );
}
