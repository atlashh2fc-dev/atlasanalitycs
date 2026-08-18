"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { fmt } from "@/lib/utils";

export interface FilaTarifa {
  id: string;
  agrupacion_meta: string;
  criterio: "edad" | "cumplimiento";
  alcance: "titular" | "adicional" | "todos";
  desde: number;
  hasta: number | null;
  valor_uf: number;
  vigencia_desde: string;
  notas: string | null;
}

export interface FilaRemuneracion {
  id: string | null;
  ejecutivo_id: string;
  ejecutivo: string;
  sueldo_base_clp: number;
  comision_asegurado_clp: number;
  factor_leyes: number;
  factor_semana_corrida: number;
  vigencia_desde: string;
}

export interface FilaComision {
  id: string;
  agrupacion_meta: string;
  tipo: "escalonada" | "bono";
  base: "beneficiario" | "contrato";
  desde: number;
  hasta: number | null;
  monto_clp: number;
  acumulable: boolean;
  notas: string | null;
}

export interface FilaCosto {
  id: string;
  concepto: string;
  base: "mensual" | "por_posicion" | "por_gestion" | "por_hora";
  monto_clp: number;
  vigencia_desde: string;
}

const BASES: Record<FilaCosto["base"], string> = {
  mensual: "Mensual",
  por_posicion: "Por posición",
  por_gestion: "Por gestión",
  por_hora: "Por hora",
};

async function guarda(
  tabla: string,
  id: string,
  cambios: Record<string, unknown>,
) {
  await fetch("/api/economia", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tabla, id, cambios }),
  });
}

/* ------------------------------------------------------------------ */

function Celda({
  valor,
  onGuardar,
  ancho = "w-28",
  tipo = "number",
  paso = "1",
}: {
  valor: string | number;
  onGuardar: (v: string) => void;
  ancho?: string;
  tipo?: string;
  paso?: string;
}) {
  const [v, setV] = useState(String(valor ?? ""));
  return (
    <input
      type={tipo}
      step={paso}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => String(valor ?? "") !== v && onGuardar(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`tabular ${ancho} rounded-lg border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2 py-1 text-right text-xs outline-none focus:border-[var(--series-1)]`}
    />
  );
}

/* ------------------------------------------------------------------ */

export function Economia({
  tarifas,
  comisiones,
  remuneraciones,
  costos,
  campanaId,
}: {
  tarifas: FilaTarifa[];
  comisiones: FilaComision[];
  remuneraciones: FilaRemuneracion[];
  costos: FilaCosto[];
  campanaId: string | null;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function refrescar() {
    setOcupado(true);
    router.refresh();
    setTimeout(() => setOcupado(false), 600);
  }

  /** La remuneración se crea la primera vez que se edita al ejecutivo. */
  async function guardaRemuneracion(
    f: FilaRemuneracion,
    campo: string,
    valor: number,
  ) {
    if (f.id) {
      await guarda("remuneracion", f.id, { [campo]: valor });
    } else {
      await fetch("/api/economia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tabla: "remuneracion",
          fila: {
            ejecutivo_id: f.ejecutivo_id,
            sueldo_base_clp: campo === "sueldo_base_clp" ? valor : 0,
            comision_asegurado_clp:
              campo === "comision_asegurado_clp" ? valor : 0,
            factor_leyes: campo === "factor_leyes" ? valor : 1.2,
            factor_semana_corrida:
              campo === "factor_semana_corrida" ? valor : 0.2,
          },
        }),
      });
    }
    refrescar();
  }

  async function agregaComision() {
    if (!campanaId) return;
    await fetch("/api/economia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tabla: "comision",
        fila: {
          campana_id: campanaId,
          agrupacion_meta: "ONCO",
          tipo: "escalonada",
          base: "beneficiario",
          desde: 0,
          monto_clp: 0,
        },
      }),
    });
    refrescar();
  }

  async function elimina(tabla: string, id: string) {
    await fetch(`/api/economia?tabla=${tabla}&id=${id}`, { method: "DELETE" });
    refrescar();
  }

  async function agregaCosto() {
    if (!campanaId) return;
    await fetch("/api/economia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tabla: "costo_operacion",
        fila: {
          campana_id: campanaId,
          concepto: "Nuevo costo",
          base: "mensual",
          monto_clp: 0,
        },
      }),
    });
    refrescar();
  }

  const totalMensual = costos
    .filter((c) => c.base === "mensual")
    .reduce((s, c) => s + Number(c.monto_clp), 0);

  return (
    <div className={`space-y-7 ${ocupado ? "opacity-70" : ""}`}>
      {/* ---------------------------------------------------------- */}
      <section>
        <h3 className="text-[13px] font-semibold">Tarifa del mandante</h3>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          Lo que paga UC Christus por cada venta. Complementario y
          catastrófico se pagan por el tramo etario del titular más un valor
          único por adicional. El oncológico paga lo mismo por cada
          beneficiario, pero el valor sube según el cumplimiento del mes —
          y sube para todos, no sólo para el excedente.
        </p>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[var(--text-muted)]">
              <th className="pb-1.5 font-medium">Línea</th>
              <th className="pb-1.5 font-medium">Se paga por</th>
              <th className="pb-1.5 font-medium">Aplica a</th>
              <th className="pb-1.5 text-right font-medium">Desde</th>
              <th className="pb-1.5 text-right font-medium">Hasta</th>
              <th className="pb-1.5 text-right font-medium">UF</th>
              <th className="pb-1.5 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            {tarifas.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="py-1.5 font-medium text-[var(--text-primary)]">
                  {t.agrupacion_meta}
                </td>
                <td className="py-1.5 text-[var(--text-secondary)]">
                  {t.criterio === "edad" ? "Edad del titular" : "% de cumplimiento"}
                </td>
                <td className="py-1.5 text-[var(--text-secondary)]">
                  {t.alcance === "titular"
                    ? "Titular"
                    : t.alcance === "adicional"
                      ? "Cada adicional"
                      : "Cada beneficiario"}
                </td>
                <td className="py-1.5 text-right">
                  <Celda
                    valor={t.desde}
                    ancho="w-20"
                    paso="0.1"
                    onGuardar={(v) =>
                      guarda("tarifa", t.id, { desde: Number(v) }).then(refrescar)
                    }
                  />
                </td>
                <td className="py-1.5 text-right">
                  <Celda
                    valor={t.hasta ?? ""}
                    ancho="w-20"
                    paso="0.1"
                    onGuardar={(v) =>
                      guarda("tarifa", t.id, {
                        hasta: v === "" ? null : Number(v),
                      }).then(refrescar)
                    }
                  />
                </td>
                <td className="py-1.5 text-right">
                  <Celda
                    valor={t.valor_uf}
                    ancho="w-20"
                    paso="0.01"
                    onGuardar={(v) =>
                      guarda("tarifa", t.id, { valor_uf: Number(v) }).then(refrescar)
                    }
                  />
                </td>
                <td className="py-1.5 text-[var(--text-muted)]">
                  {t.notas?.includes("CONFIRMAR") ? (
                    <span style={{ color: "var(--warning)" }}>{t.notas}</span>
                  ) : (
                    t.notas
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------------------------------------------------- */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Comisiones y bonos</h3>
          <button
            onClick={agregaComision}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--vidrio-borde)] px-2.5 py-1 text-[11px] hover:border-[var(--vidrio-borde-alto)]"
          >
            <Plus className="size-3" /> Agregar tramo
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          El tramo alcanzado se aplica a toda la producción del mes, no
          sólo al excedente: llegar a 20 beneficiarios paga los 20 a
          $11.000, no los primeros 19 a $9.000. Los bonos acumulables se
          suman entre sí, así que a las 30 ventas se ganan los dos.
        </p>

        {comisiones.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-[var(--text-muted)]">
            Sin esquema de comisiones. Sin esto el ejecutivo sólo cuesta su
            sueldo base.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[var(--text-muted)]">
                <th className="pb-1.5 font-medium">Línea</th>
                <th className="pb-1.5 font-medium">Concepto</th>
                <th className="pb-1.5 font-medium">Se cuenta por</th>
                <th className="pb-1.5 text-right font-medium">Desde</th>
                <th className="pb-1.5 text-right font-medium">Hasta</th>
                <th className="pb-1.5 text-right font-medium">Monto</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {comisiones.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5 font-medium text-[var(--text-primary)]">
                    {c.agrupacion_meta}
                  </td>
                  <td className="py-1.5 text-[var(--text-secondary)]">
                    {c.tipo === "escalonada"
                      ? "Comisión por tramo"
                      : c.acumulable
                        ? "Bono acumulable"
                        : "Bono"}
                  </td>
                  <td className="py-1.5 text-[var(--text-secondary)]">
                    {c.base === "beneficiario" ? "Beneficiarios" : "Ventas"}
                  </td>
                  <td className="py-1.5 text-right">
                    <Celda
                      valor={c.desde}
                      ancho="w-20"
                      onGuardar={(v) =>
                        guarda("comision", c.id, { desde: Number(v) }).then(refrescar)
                      }
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <Celda
                      valor={c.hasta ?? ""}
                      ancho="w-20"
                      onGuardar={(v) =>
                        guarda("comision", c.id, {
                          hasta: v === "" ? null : Number(v),
                        }).then(refrescar)
                      }
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <Celda
                      valor={c.monto_clp}
                      paso="1000"
                      onGuardar={(v) =>
                        guarda("comision", c.id, { monto_clp: Number(v) }).then(refrescar)
                      }
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      onClick={() => elimina("comision", c.id)}
                      aria-label={`Eliminar tramo de ${c.agrupacion_meta}`}
                      className="text-[var(--text-muted)] hover:text-[var(--critical)]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---------------------------------------------------------- */}
      <section>
        <h3 className="text-[13px] font-semibold">Remuneración por ejecutivo</h3>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          La semana corrida es la proporción de la comisión que se paga
          por el día de descanso: 0,20 es un día por cada cinco
          trabajados. Se aplica a la comisión y no a los bonos, porque el
          bono es mensual y no se devenga día a día. El factor de leyes
          sociales lleva el bruto a costo empresa y se aplica sobre todo,
          incluidas comisiones y semana corrida, porque son imponibles.
        </p>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[var(--text-muted)]">
              <th className="pb-1.5 font-medium">Ejecutivo</th>
              <th className="pb-1.5 text-right font-medium">Sueldo base</th>
              <th className="pb-1.5 text-right font-medium">Comisión por asegurado</th>
              <th className="pb-1.5 text-right font-medium">Semana corrida</th>
              <th className="pb-1.5 text-right font-medium">Factor leyes</th>
              <th className="pb-1.5 text-right font-medium">Costo empresa base</th>
            </tr>
          </thead>
          <tbody>
            {remuneraciones.map((r) => (
              <tr key={r.ejecutivo_id} className="border-b last:border-0">
                <td className="py-1.5 font-medium text-[var(--text-primary)]">
                  {r.ejecutivo}
                </td>
                <td className="py-1.5 text-right">
                  <Celda
                    valor={r.sueldo_base_clp}
                    paso="1000"
                    onGuardar={(v) =>
                      guardaRemuneracion(r, "sueldo_base_clp", Number(v))
                    }
                  />
                </td>
                <td className="py-1.5 text-right">
                  <Celda
                    valor={r.comision_asegurado_clp}
                    paso="1000"
                    onGuardar={(v) =>
                      guardaRemuneracion(r, "comision_asegurado_clp", Number(v))
                    }
                  />
                </td>
                <td className="py-1.5 text-right">
                  <Celda
                    valor={r.factor_semana_corrida}
                    ancho="w-20"
                    paso="0.01"
                    onGuardar={(v) =>
                      guardaRemuneracion(r, "factor_semana_corrida", Number(v))
                    }
                  />
                </td>
                <td className="py-1.5 text-right">
                  <Celda
                    valor={r.factor_leyes}
                    ancho="w-20"
                    paso="0.01"
                    onGuardar={(v) => guardaRemuneracion(r, "factor_leyes", Number(v))}
                  />
                </td>
                <td className="tabular py-1.5 text-right text-[var(--text-secondary)]">
                  {fmt.clp(r.sueldo_base_clp * r.factor_leyes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------------------------------------------------- */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Otros costos de operación</h3>
          <button
            onClick={agregaCosto}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--vidrio-borde)] px-2.5 py-1 text-[11px] hover:border-[var(--vidrio-borde-alto)]"
          >
            <Plus className="size-3" /> Agregar
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          La base define cómo se prorratea. Un arriendo es mensual; un
          puesto de trabajo va por posición ocupada; el discador suele
          cobrarse por gestión. Sin esa distinción, comparar meses con
          dotación distinta da un margen falso.
        </p>

        {costos.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-[var(--text-muted)]">
            Sin costos cargados. Supervisión, telefonía, puesto de trabajo e
            infraestructura van acá.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[var(--text-muted)]">
                <th className="pb-1.5 font-medium">Concepto</th>
                <th className="pb-1.5 font-medium">Base</th>
                <th className="pb-1.5 text-right font-medium">Monto</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {costos.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-1.5">
                    <input
                      defaultValue={c.concepto}
                      onBlur={(e) =>
                        e.target.value !== c.concepto &&
                        guarda("costo_operacion", c.id, {
                          concepto: e.target.value,
                        }).then(refrescar)
                      }
                      className="w-full rounded-lg border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2 py-1 text-xs outline-none focus:border-[var(--series-1)]"
                    />
                  </td>
                  <td className="py-1.5">
                    <select
                      defaultValue={c.base}
                      onChange={(e) =>
                        guarda("costo_operacion", c.id, {
                          base: e.target.value,
                        }).then(refrescar)
                      }
                      className="rounded-lg border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2 py-1 text-xs outline-none"
                    >
                      {Object.entries(BASES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 text-right">
                    <Celda
                      valor={c.monto_clp}
                      paso="1000"
                      onGuardar={(v) =>
                        guarda("costo_operacion", c.id, {
                          monto_clp: Number(v),
                        }).then(refrescar)
                      }
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      onClick={() => elimina("costo_operacion", c.id)}
                      aria-label={`Eliminar ${c.concepto}`}
                      className="text-[var(--text-muted)] hover:text-[var(--critical)]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-2 text-[var(--text-muted)]">
                  Suma de los costos mensuales
                </td>
                <td className="tabular pt-2 text-right font-semibold">
                  {fmt.clp(totalMensual)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}
