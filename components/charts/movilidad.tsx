"use client";

import { SinDatos } from "./base";
import { Badge } from "@/components/ui/stat";
import { fmt } from "@/lib/utils";

export interface FilaMovilidad {
  ejecutivo: string;
  periodoAnterior: string | null;
  periodoActual: string;
  cuartilAnterior: number | null;
  cuartilActual: number | null;
  deltaIpD: number | null;
  movimiento: string;
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
export function TablaMovilidad({ datos }: { datos: FilaMovilidad[] }) {
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

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-[var(--text-muted)]">
          <th className="pb-2 font-medium">Ejecutivo</th>
          <th className="pb-2 text-center font-medium">Cuartil anterior</th>
          <th className="pb-2 text-center font-medium">Cuartil actual</th>
          <th className="pb-2 text-right font-medium">Δ IP-D</th>
          <th className="pb-2 text-right font-medium">Movimiento</th>
        </tr>
      </thead>
      <tbody>
        {orden.map((d) => (
          <tr key={d.ejecutivo} className="border-b last:border-0">
            <td className="py-2 text-[var(--text-primary)]">{d.ejecutivo}</td>
            <td className="tabular py-2 text-center text-[var(--text-secondary)]">
              {d.cuartilAnterior ?? "—"}
            </td>
            <td className="tabular py-2 text-center font-medium">
              {d.cuartilActual ?? "—"}
            </td>
            <td className="tabular py-2 text-right text-[var(--text-secondary)]">
              {d.deltaIpD === null
                ? "—"
                : `${d.deltaIpD > 0 ? "+" : ""}${fmt.decimal(d.deltaIpD)}`}
            </td>
            <td className="py-2 text-right">
              <Badge tono={TONO[d.movimiento] ?? "neutro"}>
                {TEXTO[d.movimiento] ?? d.movimiento}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
      <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-1 text-xs">
        <div />
        {[1, 2, 3, 4].map((a) => (
          <div key={a} className="pb-1 text-center text-[var(--text-muted)]">
            a Q{a}
          </div>
        ))}
        {[4, 3, 2, 1].map((de) => (
          <>
            <div key={`l${de}`} className="pr-2 text-right leading-8 text-[var(--text-muted)]">
              de Q{de}
            </div>
            {[1, 2, 3, 4].map((a) => {
              const n = valor(de, a);
              const intensidad = max > 0 ? n / max : 0;
              return (
                <div
                  key={`${de}-${a}`}
                  className="tabular flex h-8 items-center justify-center rounded-sm font-medium"
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
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        La diagonal es el equipo congelado. Lo que se busca mover es la
        columna izquierda hacia la derecha.
      </p>
    </div>
  );
}
