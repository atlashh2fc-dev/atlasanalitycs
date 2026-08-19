import { CalendarCheck2, Check, Minus, X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { GlassSelect } from "@/components/ui/glass-select";

export type CoberturaDia = {
  fecha: string;
  esHabil: boolean;
  esFeriado: boolean;
  esFuturo: boolean;
  gestiones: number;
  ventas: number;
  cotizaciones: number;
  asistencia: number;
};

const FUENTES = [
  ["ventas", "Ventas"],
  ["gestiones", "Gestiones"],
  ["cotizaciones", "Cotizaciones"],
  ["asistencia", "Asistencia"],
] as const;

const formatoMes = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function completa(dia: CoberturaDia) {
  return FUENTES.every(([clave]) => dia[clave] > 0);
}

export function MapaCobertura({
  dias,
  mes,
  campana,
  campanas,
}: {
  dias: CoberturaDia[];
  mes: string;
  campana: string;
  campanas: { id: string; nombre: string }[];
}) {
  const evaluables = dias.filter((dia) => dia.esHabil && !dia.esFeriado && !dia.esFuturo);
  const completos = evaluables.filter(completa).length;
  const primerDia = dias[0]
    ? new Date(`${dias[0].fecha}T12:00:00Z`).getUTCDay()
    : 1;
  const desplazamiento = (primerDia + 6) % 7;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <CardTitle
          impacto="Control de integridad"
          hint="Un check confirma que existe información de esa fuente para el día. Fines de semana, feriados y fechas futuras no se consideran atrasos."
        >
          Mapa diario de cobertura
        </CardTitle>

        <form className="flex flex-wrap items-center gap-2" action="/cargar">
          <GlassSelect
            name="campana"
            defaultValue={campana}
            ariaLabel="Campaña del mapa de cobertura"
            options={campanas.map((item) => ({ value: item.id, label: item.nombre }))}
          />
          <label className="pildora cursor-pointer">
            <span className="text-[var(--text-muted)]">Mes</span>
            <input type="month" name="mes" defaultValue={mes} aria-label="Mes de cobertura" />
          </label>
          <button
            type="submit"
            className="rounded-full bg-[var(--series-1)] px-4 py-2 text-xs font-semibold text-white"
          >
            Consultar
          </button>
        </form>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-[var(--surface-0)] px-3 py-2.5 text-xs">
        <CalendarCheck2 className="size-4 text-[var(--series-1)]" />
        <strong className="capitalize text-[var(--text-primary)]">
          {formatoMes.format(new Date(`${mes}-01T12:00:00Z`))}
        </strong>
        <span className={completos === evaluables.length && evaluables.length > 0 ? "text-[var(--good)]" : "text-[var(--warning)]"}>
          {completos} de {evaluables.length} días hábiles con las cuatro fuentes
        </span>
        <span className="ml-auto text-[11px] text-[var(--text-muted)]">
          ✓ con registros · × pendiente · — no exigible
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dia) => <span key={dia}>{dia}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: desplazamiento }).map((_, indice) => (
              <span key={`vacio-${indice}`} className="min-h-[94px]" />
            ))}
            {dias.map((dia) => {
              const noExigible = !dia.esHabil || dia.esFeriado || dia.esFuturo;
              const estaCompleto = !noExigible && completa(dia);
              return (
                <article
                  key={dia.fecha}
                  className={`min-h-[94px] rounded-lg border p-2 ${
                    noExigible
                      ? "bg-[var(--surface-0)] opacity-60"
                      : estaCompleto
                        ? "border-[color-mix(in_srgb,var(--good)_35%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--good)_5%,var(--surface-0))]"
                        : "border-[color-mix(in_srgb,var(--warning)_35%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--warning)_5%,var(--surface-0))]"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <strong className="tabular text-sm">{Number(dia.fecha.slice(-2))}</strong>
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                      noExigible
                        ? "text-[var(--text-muted)]"
                        : estaCompleto
                          ? "bg-[color-mix(in_srgb,var(--good)_12%,transparent)] text-[var(--good)]"
                          : "bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]"
                    }`}>
                      {dia.esFuturo ? "Futuro" : dia.esFeriado ? "Feriado" : !dia.esHabil ? "Libre" : estaCompleto ? "Completo" : "Incompleto"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {FUENTES.map(([clave, etiqueta]) => {
                      const cantidad = dia[clave];
                      const presente = cantidad > 0;
                      const Icono = presente ? Check : noExigible ? Minus : X;
                      return (
                        <div key={clave} className="flex items-center gap-1.5 text-[11px]">
                          <Icono className={`size-3 ${presente ? "text-[var(--good)]" : noExigible ? "text-[var(--text-muted)]" : "text-[var(--critical)]"}`} />
                          <span className="truncate text-[var(--text-secondary)]" title={etiqueta}>{etiqueta.slice(0, 3)}</span>
                          <span className="tabular ml-auto font-medium text-[var(--text-primary)]">
                            {presente ? cantidad.toLocaleString("es-CL") : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
