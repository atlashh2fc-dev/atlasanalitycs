"use client";

import { useRef, useState } from "react";
import { CalendarCheck2, Check, LoaderCircle, Minus, Upload, X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { GlassSelect } from "@/components/ui/glass-select";
import { FUENTES_COBERTURA, type FuenteCobertura } from "@/lib/fuente-carga";

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

const formatoMes = new Intl.DateTimeFormat("es-CL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function completa(dia: CoberturaDia) {
  return FUENTES_COBERTURA.every(([clave]) => dia[clave] > 0);
}

export function MapaCobertura({
  dias,
  mes,
  campana,
  campanas,
  ocupado,
  onCargarFuente,
}: {
  dias: CoberturaDia[];
  mes: string;
  campana: string;
  campanas: { id: string; nombre: string }[];
  ocupado: boolean;
  onCargarFuente: (
    archivo: File,
    fuente: FuenteCobertura,
    fecha: string,
  ) => Promise<{ ok: boolean; mensaje: string }>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [solicitud, setSolicitud] = useState<{ fuente: FuenteCobertura; fecha: string } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const evaluables = dias.filter((dia) => dia.esHabil && !dia.esFeriado && !dia.esFuturo);
  const completos = evaluables.filter(completa).length;
  const primerDia = dias[0]
    ? new Date(`${dias[0].fecha}T12:00:00Z`).getUTCDay()
    : 1;
  const desplazamiento = (primerDia + 6) % 7;

  function elegir(fuente: FuenteCobertura, fecha: string) {
    if (ocupado || procesando) return;
    setSolicitud({ fuente, fecha });
    setAviso(null);
    input.current?.click();
  }

  async function archivoElegido(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo || !solicitud) return;

    setProcesando(true);
    const resultado = await onCargarFuente(archivo, solicitud.fuente, solicitud.fecha);
    setAviso(resultado);
    setProcesando(false);
    if (resultado.ok) setSolicitud(null);
  }

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

      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={archivoElegido}
        aria-label="Archivo para completar cobertura"
      />
      {aviso ? (
        <div className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
          aviso.ok
            ? "border-[color-mix(in_srgb,var(--good)_35%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--good)_7%,var(--surface-0))] text-[var(--good)]"
            : "border-[color-mix(in_srgb,var(--critical)_35%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--critical)_7%,var(--surface-0))] text-[var(--critical)]"
        }`}>
          {aviso.ok ? <Check className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
          <span>{aviso.mensaje}</span>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((dia) => <span key={dia}>{dia}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: desplazamiento }).map((_, indice) => (
              <span key={`vacio-${indice}`} className="min-h-[62px]" />
            ))}
            {dias.map((dia) => {
              const noExigible = !dia.esHabil || dia.esFeriado || dia.esFuturo;
              const estaCompleto = !noExigible && completa(dia);
              return (
                <article
                  key={dia.fecha}
                  className={`min-h-[62px] rounded-lg border p-1.5 ${
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
                    {FUENTES_COBERTURA.map(([clave, etiqueta]) => {
                      const cantidad = dia[clave];
                      const presente = cantidad > 0;
                      const cargandoEsta = procesando && solicitud?.fuente === clave && solicitud.fecha === dia.fecha;
                      const Icono = cargandoEsta ? LoaderCircle : presente ? Check : noExigible ? Minus : X;
                      if (!presente && !noExigible) {
                        return (
                          <button
                            key={clave}
                            type="button"
                            disabled={ocupado || procesando}
                            onClick={() => elegir(clave, dia.fecha)}
                            title={`Cargar ${etiqueta.toLowerCase()} del ${dia.fecha}`}
                            aria-label={`Cargar ${etiqueta.toLowerCase()} del ${dia.fecha}`}
                            className="group/fuente flex w-full items-center gap-1.5 rounded px-0.5 text-[11px] transition-colors hover:bg-[color-mix(in_srgb,var(--critical)_10%,transparent)] disabled:cursor-wait disabled:opacity-60"
                          >
                            <Icono className={`size-3 text-[var(--critical)] ${cargandoEsta ? "animate-spin" : ""}`} />
                            <span className="truncate text-[var(--text-secondary)]" title={etiqueta}>{etiqueta.slice(0, 3)}</span>
                            <span className="ml-auto flex items-center gap-1 font-medium text-[var(--critical)] opacity-75 transition-opacity group-hover/fuente:opacity-100">
                              <Upload className="size-3" />
                              Cargar
                            </span>
                          </button>
                        );
                      }
                      return (
                        <div key={clave} className="flex items-center gap-1.5 text-[11px]">
                          <Icono className={`size-3 ${presente ? "text-[var(--good)]" : "text-[var(--text-muted)]"}`} />
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
