"use client";

import { SinDatos } from "./base";
import { Badge } from "@/components/ui/stat";
import { fmt } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EJE, ESTADO, SERIES, Tooltip } from "./base";

export interface FilaMovilidad {
  ejecutivoId: string;
  ejecutivo: string;
  periodoAnterior: string | null;
  periodoActual: string;
  cuartilAnterior: number | null;
  cuartilActual: number | null;
  ipD: number | null;
  deltaIpD: number | null;
  dg: number;
  cotizaciones: number;
  tasaCierre: number | null;
  profundidad: number | null;
  indiceVentaSana: number | null;
  rachaQ1: number;
  movimiento: string;
}

export interface PuntoTendenciaEquipo {
  periodo: string;
  fechaInicio: string;
  medianaIpD: number;
  q1IpD: number;
  q3IpD: number;
  ejecutivos: number;
}

const TONO: Record<string, "good" | "warning" | "serious" | "critical" | "neutro"> = {
  sube: "good",
  estable_alto: "good",
  estable_medio: "neutro",
  baja: "warning",
  estable_bajo: "critical",
  sin_historia: "neutro",
};

const TEXTO: Record<string, string> = {
  sube: "Sube",
  baja: "Baja",
  estable_alto: "Estable alto",
  estable_medio: "Estable medio",
  estable_bajo: "Estancado abajo",
  sin_historia: "Sin historia",
};

/**
 * Movilidad de cuartiles entre periodos.
 *
 * ntile(4) ordena ascendente: cuartil 4 es el mejor desempeño y 1 el peor.
 * Lo que importa no es el ranking de un mes, sino quién se mueve: un
 * ejecutivo estancado en el cuartil inferior varios periodos seguidos es
 * la señal de intervención más accionable.
 */
export function TablaMovilidad({
  datos,
  universo = datos,
}: {
  datos: FilaMovilidad[];
  universo?: FilaMovilidad[];
}) {
  if (datos.length === 0) {
    return (
      <SinDatos mensaje="Se necesitan al menos dos periodos calculados para medir movilidad. Carga los meses anteriores y el histórico aparece acá." />
    );
  }

  const orden = [...datos].sort((a, b) => {
    const pesos: Record<string, number> = {
      estable_bajo: 0, baja: 1, estable_medio: 2, sube: 3, estable_alto: 4, sin_historia: 5,
    };
    return (pesos[a.movimiento] ?? 9) - (pesos[b.movimiento] ?? 9);
  });

  // Los filtros sólo ocultan filas: nunca deben cambiar el benchmark contra
  // el cual se diagnostica a una persona.
  const medianaCierre = mediana(universo.map((d) => d.tasaCierre).filter(esNumero));
  const medianaActividad = mediana(
    universo.map((d) => (d.dg > 0 ? d.cotizaciones / d.dg : null)).filter(esNumero),
  );
  const medianaProfundidad = mediana(universo.map((d) => d.profundidad).filter(esNumero));
  const medianaIpD = mediana(universo.map((d) => d.ipD).filter(esNumero));

  return (
    <div className="overflow-x-auto">
    <table className="min-w-[980px] w-full text-[11px]">
      <thead>
        <tr className="h-7 border-b text-left text-[11px] text-[var(--text-muted)]">
          <th className="pb-2 font-medium">Ejecutivo</th>
          <th className="pb-2 text-left font-medium">Estado</th>
          <th className="pb-2 text-right font-medium">IP-D / Δ</th>
          <th className="pb-2 text-right font-medium">Cotiz. / día</th>
          <th className="pb-2 text-right font-medium">Cierre</th>
          <th className="pb-2 text-right font-medium">Venta sana</th>
          <th className="pb-2 text-right font-medium">Oportunidad</th>
          <th className="pb-2 pl-4 font-medium">Gestión sugerida</th>
        </tr>
      </thead>
      <tbody>
        {orden.map((d) => {
          const actividad = d.dg > 0 ? d.cotizaciones / d.dg : null;
          const oportunidad =
            d.ipD === null ? 0 : Math.max(0, medianaIpD - d.ipD) * d.dg;
          const gestion = diagnostico(d, {
            cierre: medianaCierre,
            actividad: medianaActividad,
            profundidad: medianaProfundidad,
          });
          return (
          <tr key={d.ejecutivoId} className="border-b last:border-0">
            <td className="h-10 pr-3 font-medium text-[var(--text-primary)]">
              <span className="block">{d.ejecutivo}</span>
              <span className="tabular text-[10px] font-normal text-[var(--text-muted)]">
                Q{d.cuartilAnterior ?? "—"} → Q{d.cuartilActual ?? "—"}
                {d.rachaQ1 >= 2 ? ` · ${d.rachaQ1} meses en Q1` : ""}
              </span>
            </td>
            <td>
              <Badge tono={TONO[d.movimiento] ?? "neutro"}>
                {TEXTO[d.movimiento] ?? d.movimiento}
              </Badge>
            </td>
            <td className="tabular text-right font-medium">
              {fmt.decimal(d.ipD)}
              <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
                {d.deltaIpD === null ? "" : `${d.deltaIpD > 0 ? "+" : ""}${fmt.decimal(d.deltaIpD)}`}
              </span>
            </td>
            <td className="tabular text-right">{fmt.decimal(actividad, 1)}</td>
            <td className="tabular text-right">{fmt.pct(d.tasaCierre, 0)}</td>
            <td className="tabular text-right">{fmt.pct(d.indiceVentaSana, 0)}</td>
            <td className="tabular text-right font-medium">
              {oportunidad >= 0.5 ? `+${fmt.entero(Math.round(oportunidad))} aseg.` : "—"}
            </td>
            <td className="pl-4">
              <span className="block font-medium text-[var(--text-primary)]">{gestion.accion}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{gestion.causa}</span>
            </td>
          </tr>
        )})}
      </tbody>
    </table>
    </div>
  );
}

export function EvolucionEquipo({ datos }: { datos: PuntoTendenciaEquipo[] }) {
  if (datos.length < 2) {
    return <SinDatos mensaje="Se necesitan al menos dos meses para mostrar la evolución del equipo." />;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={205}>
        <LineChart data={datos} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="periodo" tick={EJE.tick} tickLine={false} axisLine={EJE.line} />
          <YAxis tick={EJE.tick} tickLine={false} axisLine={false} />
          <RTooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as PuntoTendenciaEquipo;
              return (
                <Tooltip
                  titulo={String(label)}
                  filas={[
                    { etiqueta: "Mediana IP-D", valor: fmt.decimal(d.medianaIpD), color: SERIES[0] },
                    { etiqueta: "Cuartil superior", valor: fmt.decimal(d.q3IpD) },
                    { etiqueta: "Cuartil inferior", valor: fmt.decimal(d.q1IpD) },
                    { etiqueta: "Ejecutivos", valor: fmt.entero(d.ejecutivos) },
                  ]}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="q3IpD" stroke={ESTADO.good} strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="medianaIpD" stroke={SERIES[0]} dot={{ r: 3 }} strokeWidth={3} />
          <Line type="monotone" dataKey="q1IpD" stroke={ESTADO.serious} strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-[var(--text-secondary)]">
        <LeyendaLinea color={ESTADO.good} texto="Cuartil superior" />
        <LeyendaLinea color={SERIES[0]} texto="Mediana del equipo" />
        <LeyendaLinea color={ESTADO.serious} texto="Cuartil inferior" />
      </div>
    </div>
  );
}

export function DiagnosticoGestion({ datos }: { datos: FilaMovilidad[] }) {
  if (datos.length === 0) return <SinDatos mensaje="Sin equipo para diagnosticar." />;
  const referencias = {
    cierre: mediana(datos.map((d) => d.tasaCierre).filter(esNumero)),
    actividad: mediana(datos.map((d) => (d.dg > 0 ? d.cotizaciones / d.dg : null)).filter(esNumero)),
    profundidad: mediana(datos.map((d) => d.profundidad).filter(esNumero)),
  };
  const cuentas = new Map<string, { cantidad: number; causa: string }>();
  for (const d of datos.filter((fila) => fila.movimiento === "baja" || fila.movimiento === "estable_bajo")) {
    const g = diagnostico(d, referencias);
    const actual = cuentas.get(g.accion) ?? { cantidad: 0, causa: g.causa };
    actual.cantidad += 1;
    cuentas.set(g.accion, actual);
  }
  const orden = [...cuentas.entries()].sort((a, b) => b[1].cantidad - a[1].cantidad);
  const max = Math.max(1, ...orden.map(([, v]) => v.cantidad));

  if (orden.length === 0) {
    return <SinDatos mensaje="No hay ejecutivos en baja ni estancados en el cuartil inferior." />;
  }

  return (
    <div className="space-y-3 pt-1">
      {orden.map(([accion, valor]) => (
        <div key={accion}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[11px]">
            <span className="font-medium text-[var(--text-primary)]">{accion}</span>
            <span className="tabular font-semibold">{valor.cantidad}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-1)]">
            <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(valor.cantidad / max) * 100}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">{valor.causa}</p>
        </div>
      ))}
      <p className="border-t pt-2 text-[11px] leading-tight text-[var(--text-secondary)]">
        Diagnóstico orientativo sobre quienes bajan o siguen en Q1. Sirve para asignar coaching; no reemplaza la revisión individual.
      </p>
    </div>
  );
}

function diagnostico(
  d: FilaMovilidad,
  referencia: { cierre: number; actividad: number; profundidad: number },
) {
  const actividad = d.dg > 0 ? d.cotizaciones / d.dg : 0;
  if (d.indiceVentaSana !== null && d.indiceVentaSana < 0.85) {
    return { accion: "Auditar calidad", causa: "Venta sana bajo 85%" };
  }
  if (actividad < referencia.actividad * 0.85) {
    return { accion: "Activar pipeline", causa: "Cotizaciones por día bajo la mediana" };
  }
  if (d.tasaCierre !== null && d.tasaCierre < referencia.cierre * 0.85) {
    return { accion: "Coaching de cierre", causa: "Conversión bajo la mediana" };
  }
  if (d.profundidad !== null && d.profundidad < referencia.profundidad * 0.9) {
    return { accion: "Profundizar venta", causa: "Menos asegurados por contrato" };
  }
  if (d.movimiento === "sube" || d.movimiento === "estable_alto") {
    return { accion: "Replicar práctica", causa: "Desempeño favorable" };
  }
  return { accion: "Revisión 1:1", causa: "Sin palanca dominante en el embudo" };
}

function esNumero(n: number | null): n is number {
  return n !== null && Number.isFinite(n);
}

function mediana(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function LeyendaLinea({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-4 rounded" style={{ background: color }} />
      {texto}
    </span>
  );
}

/**
 * Matriz de transición. Rampa secuencial de un solo tono: más oscuro =
 * más ejecutivos hicieron ese movimiento.
 */
export function MatrizTransicion({
  celdas,
}: {
  celdas: { de: number; a: number; ejecutivos: number }[];
}) {
  if (celdas.length === 0) {
    return <SinDatos mensaje="Sin transiciones registradas todavía." />;
  }

  const max = Math.max(...celdas.map((c) => c.ejecutivos));
  const valor = (de: number, a: number) =>
    celdas.find((c) => c.de === de && c.a === a)?.ejecutivos ?? 0;

  return (
    <div>
      <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-1 text-[11px]">
        <div />
        {[1, 2, 3, 4].map((a) => (
          <div key={a} className="pb-1 text-center text-[var(--text-muted)]">
            a Q{a}
          </div>
        ))}
        {[4, 3, 2, 1].map((de) => (
          <>
            <div key={`l${de}`} className="pr-2 text-right leading-7 text-[var(--text-muted)]">
              de Q{de}
            </div>
            {[1, 2, 3, 4].map((a) => {
              const n = valor(de, a);
              const intensidad = max > 0 ? n / max : 0;
              return (
                <div
                  key={`${de}-${a}`}
                  className="tabular flex h-7 items-center justify-center rounded-sm font-medium"
                  style={{
                    background:
                      n === 0
                        ? "var(--surface-1)"
                        : `color-mix(in srgb, #2a78d6 ${12 + intensidad * 76}%, #ffffff)`,
                    color: intensidad > 0.55 ? "#ffffff" : "var(--text-primary)",
                    outline: n === 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  {n || ""}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-tight text-[var(--text-muted)]">
        La diagonal es el equipo congelado. Lo que se busca mover es la
        columna izquierda hacia la derecha.
      </p>
    </div>
  );
}
