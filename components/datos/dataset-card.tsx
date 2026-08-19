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
  const alDia = campana.cobertura.length > 0 && campana.cobertura.every((fila) => fila.diasAtraso === 0);

  return (
    <article className="vidrio overflow-hidden rounded-lg">
      <div className="grid items-center gap-2 px-3 py-2 lg:grid-cols-[minmax(220px,1.4fr)_90px_70px_125px_auto]">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--surface-0)] text-[var(--series-1)]"><Tags className="size-3.5" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h2 className="truncate text-[13px] font-semibold">{campana.nombre}</h2><span className="rounded-full border px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{campana.tipo}</span></div>
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">{campana.descripcion || "Contenedor permanente de datos e indicadores"}</p>
          </div>
        </div>
        <div><p className="etiqueta">Registros</p><p className="mt-1 flex items-center gap-1.5 text-xs font-semibold"><Rows3 className="size-3.5" />{numero.format(campana.filas)}</p></div>
        <div><p className="etiqueta">Cargas</p><p className="mt-1 text-xs font-semibold">{campana.cargas}</p></div>
        <div><p className="etiqueta">Actualización</p><p className="mt-1 text-xs font-semibold">{campana.ultimaCarga ? fecha.format(new Date(campana.ultimaCarga)) : "Sin cargas"}</p></div>
        <div className="flex items-center justify-end gap-2">
          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${alDia ? "bg-[color-mix(in_srgb,var(--good)_10%,transparent)] text-[var(--good)]" : "bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)]"}`}>{alDia ? "Al día" : "Revisar cobertura"}</span>
          <Link href={`/cargar?campana=${campana.id}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 text-[11px] font-semibold text-white"><Upload className="size-3.5" /> Agregar</Link>
        </div>
      </div>

      {campana.cobertura.length > 0 ? <div className="grid border-t border-[var(--vidrio-borde)] sm:grid-cols-2 xl:grid-cols-4">
        {campana.cobertura.map((fila) => {
          const meta = FUENTES[fila.fuente] ?? { nombre: fila.fuente, impacto: "indicadores relacionados" };
          const fuenteAlDia = fila.diasAtraso === 0;
          return <div key={fila.fuente} title={`Afecta: ${meta.impacto}`} className="flex min-h-9 items-center gap-2 border-r border-[var(--vidrio-borde)] px-3 text-[11px] last:border-r-0">
            <span className={fuenteAlDia ? "text-[var(--good)]" : "text-[var(--warning)]"}>●</span>
            <strong>{meta.nombre}</strong>
            <span className="ml-auto text-[var(--text-secondary)]">{fila.ultimaFecha ? fecha.format(new Date(`${fila.ultimaFecha}T12:00:00`)) : "Sin datos"}</span>
          </div>;
        })}
      </div> : null}

      <div className="flex items-center gap-2 border-t border-[var(--vidrio-borde)] px-3 py-1.5">
        <Link
          href={`/administracion?campana=${campana.id}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"
        ><Settings2 className="size-3.5" /> Administrar reglas</Link>
        {campana.datasetId ?
          <Link
            href={`/datos/${campana.datasetId}`}
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--series-1)]"
          ><BarChart3 className="size-3.5" /> Abrir detalle de calidad</Link> : null}
      </div>
    </article>
  );
}
