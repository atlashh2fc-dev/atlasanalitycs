"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Plus } from "lucide-react";
import type { FilaControl } from "@/components/bsc/control";
import type { PuntoProyeccion } from "@/components/bsc/proyeccion";
import { ESTADO } from "@/components/charts/base";
import { fmt } from "@/lib/utils";

export interface ControlCalidad {
  codigo: string;
  indicador: string;
  valor: number | null;
  unidad: string;
  estado: "bien" | "advertencia" | "critico" | "sin_datos";
  detalle: string;
  ultima_fecha: string | null;
}

interface Accion {
  id: string;
  titulo: string;
  descripcion: string | null;
  prioridad: Prioridad;
  estado: "pendiente" | "en curso" | "resuelta" | "descartada";
  responsable: string | null;
  vencimiento: string | null;
}

type Prioridad = "critica" | "alta" | "media" | "baja";

interface Alerta {
  clave: string;
  titulo: string;
  detalle: string;
  prioridad: Prioridad;
  ejecutivoId?: string;
}

const PESO: Record<Prioridad, number> = { critica: 4, alta: 3, media: 2, baja: 1 };
const COLOR: Record<Prioridad, string> = {
  critica: "var(--critical)",
  alta: ESTADO.serious,
  media: "var(--warning)",
  baja: "var(--tono-venta)",
};

export function Decisiones({
  calidad,
  control,
  proyeccion,
  campanaId,
}: {
  calidad: ControlCalidad[];
  control: FilaControl[];
  proyeccion: PuntoProyeccion[];
  campanaId: string | null;
}) {
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = campanaId ? `?campana=${encodeURIComponent(campanaId)}` : "";
    fetch(`/api/acciones${query}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("No fue posible cargar las acciones.");
        return r.json() as Promise<Accion[]>;
      })
      .then(setAcciones)
      .catch((e: Error) => setError(e.message));
  }, [campanaId]);

  const alertas = useMemo(() => {
    const lista: Alerta[] = [];
    const cierre = proyeccion.at(-1);
    if (cierre?.linea_meta && cierre.proyectado < cierre.linea_meta) {
      lista.push({
        clave: "brecha-proyeccion",
        titulo: `La proyección cierra ${fmt.decimal(cierre.linea_meta - cierre.proyectado, 1)} asegurados bajo la meta`,
        detalle: "Reasignar base y coaching hacia quienes combinan contactabilidad alta con bajo cierre.",
        prioridad: cierre.proyectado / cierre.linea_meta < 0.8 ? "critica" : "alta",
      });
    }
    for (const q of calidad.filter((x) => x.estado !== "bien")) {
      lista.push({
        clave: `calidad-${q.codigo}`,
        titulo: q.indicador,
        detalle: `${q.detalle}${q.valor === null ? "" : ` Resultado: ${fmt.decimal(q.valor, 0)} ${q.unidad}.`}`,
        prioridad: q.estado === "critico" ? "critica" : q.estado === "sin_datos" ? "alta" : "media",
      });
    }
    for (const f of control) {
      if (f.contactos >= 20 && f.contratos === 0) {
        lista.push({
          clave: `cierre-${f.ejecutivo_id}`,
          titulo: `${f.ejecutivo}: conversa, pero no cierra`,
          detalle: `${fmt.entero(f.contactos)} contactos y ninguna venta. Revisar escucha, argumentario y objeciones.`,
          prioridad: "alta",
          ejecutivoId: f.ejecutivo_id,
        });
      } else if (f.gestiones >= 20 && (f.contactabilidad_pct ?? 100) < 40) {
        lista.push({
          clave: `contacto-${f.ejecutivo_id}`,
          titulo: `${f.ejecutivo}: contactabilidad baja`,
          detalle: `${fmt.entero(f.gestiones)} gestiones y ${fmt.decimal(f.contactabilidad_pct ?? 0, 0)}% de contacto. Revisar calidad y horario de la base.`,
          prioridad: "media",
          ejecutivoId: f.ejecutivo_id,
        });
      }
      if (f.costo_total_clp > 0 && f.asegurados === 0 && f.gestiones === 0) {
        lista.push({
          clave: `inactivo-${f.ejecutivo_id}`,
          titulo: `${f.ejecutivo}: activo sin gestión ni producción`,
          detalle: "Confirmar asignación a campaña o dar de baja en el mantenedor.",
          prioridad: "alta",
          ejecutivoId: f.ejecutivo_id,
        });
      }
    }
    return lista.sort((a, b) => PESO[b.prioridad] - PESO[a.prioridad]).slice(0, 12);
  }, [calidad, control, proyeccion]);

  async function crear(alerta: Alerta) {
    setOcupado(alerta.clave);
    setError(null);
    try {
      const respuesta = await fetch("/api/acciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: alerta.titulo,
          descripcion: alerta.detalle,
          prioridad: alerta.prioridad,
          ejecutivoId: alerta.ejecutivoId,
          campanaId,
        }),
      });
      const dato = await respuesta.json();
      if (!respuesta.ok) throw new Error(dato.error ?? "No fue posible crear la acción.");
      setAcciones((actuales) => [dato as Accion, ...actuales]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible crear la acción.");
    } finally {
      setOcupado(null);
    }
  }

  async function cambiarEstado(id: string, estado: Accion["estado"]) {
    setAcciones((actuales) => actuales.map((a) => (a.id === id ? { ...a, estado } : a)));
    const respuesta = await fetch("/api/acciones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estado }),
    });
    if (!respuesta.ok) setError("No se pudo guardar el cambio de estado.");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
      <div className="vidrio rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[13px] font-semibold">Prioridades sugeridas</h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Hallazgos ordenados por impacto. Conviértelos en acciones para cerrar el ciclo de gestión.
            </p>
          </div>
          <span className="pildora text-[11px]">{alertas.length} hallazgos</span>
        </div>
        <ul className="mt-4 space-y-2">
          {alertas.length === 0 ? (
            <li className="flex items-center gap-2 py-8 text-center text-xs text-[var(--text-muted)]">
              <CheckCircle2 className="size-4" style={{ color: ESTADO.good }} /> Sin alertas relevantes en el rango.
            </li>
          ) : alertas.map((a) => (
            <li key={a.clave} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--vidrio-borde)] p-3">
              <AlertTriangle className="size-4 shrink-0" style={{ color: COLOR[a.prioridad] }} />
              <div className="min-w-[220px] flex-1">
                <p className="text-xs font-semibold">{a.titulo}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{a.detalle}</p>
              </div>
              <button
                type="button"
                onClick={() => crear(a)}
                disabled={ocupado === a.clave || acciones.some((x) => x.titulo === a.titulo && x.estado !== "resuelta")}
                className="pildora inline-flex items-center gap-1.5 text-[11px] disabled:opacity-40"
              >
                <Plus className="size-3" /> {ocupado === a.clave ? "Guardando…" : "Crear acción"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="vidrio rounded-2xl p-5">
        <h3 className="text-[13px] font-semibold">Plan de acción</h3>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Seguimiento persistente de acuerdos y responsables.</p>
        {error ? <p className="mt-3 text-xs" style={{ color: ESTADO.serious }}>{error}</p> : null}
        <ul className="mt-4 space-y-2">
          {acciones.length === 0 ? (
            <li className="py-8 text-center text-xs text-[var(--text-muted)]">Aún no hay acciones registradas.</li>
          ) : acciones.slice(0, 12).map((a) => (
            <li key={a.id} className="rounded-xl border border-[var(--vidrio-borde)] p-3">
              <div className="flex items-start gap-2">
                <CircleDot className="mt-0.5 size-3.5 shrink-0" style={{ color: COLOR[a.prioridad] }} />
                <p className="flex-1 text-xs font-medium">{a.titulo}</p>
                <select
                  value={a.estado}
                  onChange={(e) => cambiarEstado(a.id, e.target.value as Accion["estado"])}
                  aria-label={`Estado de ${a.titulo}`}
                  className="rounded-lg border border-[var(--vidrio-borde)] bg-transparent px-2 py-1 text-[10px]"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en curso">En curso</option>
                  <option value="resuelta">Resuelta</option>
                  <option value="descartada">Descartada</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
