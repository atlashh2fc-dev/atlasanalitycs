import Link from "next/link";
import { BarChart3, Rows3, Settings2, Tags, Upload } from "lucide-react";

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
  cobertura: {
    fuente: string;
    ultimaFecha: string | null;
    fechaEsperada: string;
    diasAtraso: number | null;
  }[];
}

const fecha = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const numero = new Intl.NumberFormat("es-CL");

const FUENTES: Record<string, { nombre: string; impacto: string }> = {
  ventas: { nombre: "Ventas", impacto: "ingreso, margen, meta y ejecutivos" },
  gestiones: { nombre: "Gestiones", impacto: "contactabilidad y productividad" },
  cotizaciones: { nombre: "Cotizaciones", impacto: "conversión comercial" },
  asistencia: { nombre: "Asistencia", impacto: "capacidad y gestión por hora" },
};

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
          <p className="mt-2 text-[11px] font-medium text-[var(--series-1)]">
            Los archivos nuevos se suman a esta misma campaña.
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

      {campana.cobertura.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--vidrio-borde)] bg-[var(--surface-0)] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold">Cobertura diaria</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              campana.cobertura.every((f) => (f.diasAtraso ?? 999) === 0)
                ? "bg-[color-mix(in_srgb,var(--good)_12%,transparent)] text-[var(--good)]"
                : "bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]"
            }`}>
              {campana.cobertura.every((f) => (f.diasAtraso ?? 999) === 0) ? "Al día" : "Información incompleta"}
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {campana.cobertura.map((fila) => {
              const meta = FUENTES[fila.fuente] ?? { nombre: fila.fuente, impacto: "indicadores relacionados" };
              const alDia = fila.diasAtraso === 0;
              return (
                <div key={fila.fuente} className="grid gap-x-3 text-[11px] sm:grid-cols-[105px_1fr]">
                  <span className="font-medium text-[var(--text-primary)]">
                    <span className="mr-1.5" style={{ color: alDia ? "var(--good)" : "var(--warning)" }}>●</span>
                    {meta.nombre}
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {fila.ultimaFecha
                      ? alDia
                        ? `al día hasta ${fecha.format(new Date(`${fila.ultimaFecha}T12:00:00`))}`
                        : `cargadas hasta ${fecha.format(new Date(`${fila.ultimaFecha}T12:00:00`))}; falta completar hasta ${fecha.format(new Date(`${fila.fechaEsperada}T12:00:00`))}`
                      : "sin datos cargados"}
                    {" · afecta "}{meta.impacto}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 border-t border-[var(--vidrio-borde)] pt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Se recalcula al abrir esta vista usando el último día hábil esperado. Sábados, domingos y feriados no generan atraso.
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Link
          href={`/cargar?campana=${campana.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--series-1)] px-3 py-2.5 text-xs font-semibold text-white sm:col-span-2"
        >
          <Upload className="size-3.5" /> Agregar datos a {campana.nombre}
        </Link>
        {campana.datasetId ? (
          <Link
            href={`/datos/${campana.datasetId}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
          >
            <BarChart3 className="size-3.5" /> Revisar calidad
          </Link>
        ) : null}
        <Link
          href={`/administracion?campana=${campana.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium"
        >
          <Settings2 className="size-3.5" /> Cambiar reglas
        </Link>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
        Agregar datos actualiza los KPI. Cambiar reglas modifica metas, costos, equipo o accesos; no altera los archivos cargados.
      </p>
    </article>
  );
}
