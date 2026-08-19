import type { Indicador } from "@/components/bsc/tablero";
import { fmt } from "@/lib/utils";

export interface SemanaComparacion {
  etiqueta: string;
  desde: string;
  hasta: string;
  indicadores: Indicador[];
}

const METRICAS = [
  "Ventas / contratos",
  "Asegurados",
  "Gestiones",
  "Contactabilidad",
  "Conversión gestión a venta",
  "Ejecutivos con venta",
  "Margen",
] as const;

const METRICAS_DE_GESTION = new Set<string>([
  "Gestiones",
  "Contactabilidad",
  "Conversión gestión a venta",
]);

function valor(semana: SemanaComparacion, indicador: string) {
  return semana.indicadores.find((i) => i.indicador === indicador) ?? null;
}

function formatea(indicador: Indicador | null) {
  if (!indicador || indicador.valor === null) return "—";
  if (indicador.unidad === "pct") return `${fmt.decimal(indicador.valor, 1)}%`;
  if (indicador.unidad === "clp") return fmt.clp(indicador.valor);
  if (indicador.unidad === "decimal") return fmt.decimal(indicador.valor, 1);
  return fmt.entero(indicador.valor);
}

function fechaCorta(fecha: string) {
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" })
    .format(new Date(`${fecha}T12:00:00`))
    .replace(".", "");
}

function sinCobertura(
  semana: SemanaComparacion,
  metrica: string,
  datosHasta: string,
  gestionesHasta: string | null,
) {
  if (semana.desde > datosHasta) return "Semana todavía no transcurrida";
  if (METRICAS_DE_GESTION.has(metrica) && (!gestionesHasta || semana.desde > gestionesHasta)) {
    return "Gestiones todavía no cargadas para esta semana";
  }
  return null;
}

export function ComparacionSemanal({
  semanas,
  datosHasta,
  gestionesHasta,
}: {
  semanas: SemanaComparacion[];
  datosHasta: string;
  gestionesHasta: string | null;
}) {
  if (semanas.length === 0) return null;

  return (
    <section className="mt-8 space-y-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Comparación semanal</h2>
        <span className="text-xs text-[var(--text-muted)]">
          Mes completo · datos hasta {fechaCorta(datosHasta)}
          {gestionesHasta ? ` · gestiones hasta ${fechaCorta(gestionesHasta)}` : " · sin gestiones cargadas"}
        </span>
        <span className="h-px flex-1 bg-[var(--vidrio-borde)]" />
      </div>

      <div className="vidrio overflow-x-auto rounded-2xl p-5">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="border-b border-[var(--vidrio-borde)] text-[var(--text-muted)]">
              <th className="pb-3 text-left font-medium">Indicador</th>
              {semanas.map((semana) => (
                <th key={semana.desde} className="pb-3 text-right font-medium">
                  <span className="block text-[var(--text-secondary)]">{semana.etiqueta}</span>
                  <span className="text-[11px] font-normal">
                    {fechaCorta(semana.desde)}–{fechaCorta(semana.hasta)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICAS.map((metrica) => (
              <tr key={metrica} className="border-b border-[var(--vidrio-borde)] last:border-0">
                <th className="py-3 text-left font-medium text-[var(--text-secondary)]">{metrica}</th>
                {semanas.map((semana) => {
                  const motivo = sinCobertura(semana, metrica, datosHasta, gestionesHasta);
                  return (
                    <td
                      key={semana.desde}
                      className={`tabular py-3 text-right font-semibold ${motivo ? "text-[var(--text-muted)]" : ""}`}
                      title={motivo ?? undefined}
                    >
                      {motivo ? "—" : formatea(valor(semana, metrica))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
