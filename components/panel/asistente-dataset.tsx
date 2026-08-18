"use client";

import { useMemo, useState } from "react";
import { ContenidoTarjeta, type Filtros } from "./tarjeta";
import type { TipoWidget } from "@/lib/widgets";
import type {
  AgregacionDataset,
  CatalogoDataset,
  ConfigWidgetDataset,
  NuevoWidgetDataset,
} from "@/lib/panel-dataset";

const AGREGACIONES: { clave: AgregacionDataset; nombre: string }[] = [
  { clave: "count", nombre: "Contar registros" },
  { clave: "count_distinct", nombre: "Contar valores únicos" },
  { clave: "sum", nombre: "Sumar" },
  { clave: "avg", nombre: "Promediar" },
  { clave: "min", nombre: "Mínimo" },
  { clave: "max", nombre: "Máximo" },
];

export function AsistenteDataset({
  catalogo,
  filtros,
  onCancelar,
  onCrear,
}: {
  catalogo: CatalogoDataset;
  filtros: Filtros;
  onCancelar: () => void;
  onCrear: (widget: NuevoWidgetDataset) => Promise<void>;
}) {
  const [metricaId, setMetricaId] = useState("");
  const [dimensionId, setDimensionId] = useState("");
  const [agregacion, setAgregacion] = useState<AgregacionDataset>("count");
  const [tipo, setTipo] = useState<TipoWidget>("kpi");
  const [titulo, setTitulo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const metrica = catalogo.metricas.find((c) => c.id === metricaId);
  const dimension = catalogo.dimensiones.find((c) => c.id === dimensionId);
  const temporal = dimension?.rol === "fecha" || dimension?.tipo === "fecha";
  const agregacionesDisponibles = metrica
    ? metrica.rol === "identificador" ||
      ["texto", "categoria", "rut", "email", "telefono"].includes(metrica.tipo)
      ? AGREGACIONES.filter((a) => ["count", "count_distinct"].includes(a.clave))
      : AGREGACIONES
    : AGREGACIONES.filter((a) => a.clave === "count");

  const config = useMemo<ConfigWidgetDataset>(
    () => ({
      fuente: "dataset",
      datasetId: catalogo.dataset.id,
      metricaId: metricaId || null,
      dimensionId: dimensionId || null,
      agregacion,
      granularidad: temporal ? "dia" : undefined,
      limite: temporal ? undefined : 12,
      orden: temporal ? "asc" : "desc",
      tieneFecha: catalogo.campos.some((campo) => campo.rol === "fecha" || campo.tipo === "fecha"),
    }),
    [agregacion, catalogo.campos, catalogo.dataset.id, dimensionId, metricaId, temporal],
  );

  const tituloSugerido = dimension
    ? `${metrica?.nombre ?? "Registros"} por ${dimension.nombre.toLowerCase()}`
    : (metrica?.nombre ?? "Total de registros");

  function cambiarMetrica(id: string) {
    setMetricaId(id);
    const campo = catalogo.metricas.find((c) => c.id === id);
    setAgregacion(campo?.agregacion ?? (id ? "sum" : "count"));
  }

  function cambiarDimension(id: string) {
    setDimensionId(id);
    const campo = catalogo.dimensiones.find((c) => c.id === id);
    const esFecha = campo?.rol === "fecha" || campo?.tipo === "fecha";
    setTipo(id ? (esFecha ? "area" : "barras") : "kpi");
  }

  async function guardar() {
    setGuardando(true);
    await onCrear({ tipo, titulo: titulo.trim() || tituloSugerido, config });
    setGuardando(false);
  }

  const tipos: TipoWidget[] = dimensionId
    ? temporal
      ? ["area", "lineas", "tabla"]
      : ["barras", "barras_horizontal", "dona", "tabla"]
    : ["kpi"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onCancelar}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border bg-[var(--surface-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Nueva tarjeta</h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {catalogo.dataset.nombre} · elige indicador, desglose y visualización.
            </p>
          </div>
          <button onClick={onCancelar} className="text-sm text-[var(--text-muted)]">Cerrar</button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[300px_1fr]">
          <div className="space-y-4">
            <label className="block text-xs text-[var(--text-secondary)]">
              <span className="mb-1 block font-medium">Indicador</span>
              <select
                value={metricaId}
                onChange={(e) => cambiarMetrica(e.target.value)}
                className="w-full rounded-xl border bg-[var(--vidrio-alto)] px-3 py-2 text-sm"
              >
                <option value="">Cantidad de registros</option>
                {catalogo.metricas.map((campo) => (
                  <option key={campo.id} value={campo.id}>{campo.nombre}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-[var(--text-secondary)]">
              <span className="mb-1 block font-medium">Cálculo</span>
              <select
                value={agregacion}
                onChange={(e) => setAgregacion(e.target.value as AgregacionDataset)}
                className="w-full rounded-xl border bg-[var(--vidrio-alto)] px-3 py-2 text-sm"
              >
                {agregacionesDisponibles.map((a) => (
                  <option key={a.clave} value={a.clave}>{a.nombre}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-[var(--text-secondary)]">
              <span className="mb-1 block font-medium">Desglosar por</span>
              <select
                value={dimensionId}
                onChange={(e) => cambiarDimension(e.target.value)}
                className="w-full rounded-xl border bg-[var(--vidrio-alto)] px-3 py-2 text-sm"
              >
                <option value="">Sin desglose</option>
                {catalogo.dimensiones.map((campo) => (
                  <option key={campo.id} value={campo.id}>{campo.nombre}</option>
                ))}
              </select>
            </label>

            <div>
              <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">Visualización</p>
              <div className="flex flex-wrap gap-1.5">
                {tipos.map((opcion) => (
                  <button
                    key={opcion}
                    onClick={() => setTipo(opcion)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                      tipo === opcion ? "border-[var(--series-1)] font-semibold" : ""
                    }`}
                  >
                    {opcion.replace("barras_horizontal", "barras horizontales")}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-xs text-[var(--text-secondary)]">
              <span className="mb-1 block font-medium">Título</span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder={tituloSugerido}
                className="w-full rounded-xl border bg-[var(--vidrio-alto)] px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Vista previa</p>
            <div className="vidrio h-[360px] rounded-2xl p-4">
              <p className="mb-3 text-sm font-semibold">{titulo.trim() || tituloSugerido}</p>
              <div className="h-[300px]">
                <ContenidoTarjeta
                  tipo={tipo}
                  config={config as unknown as Record<string, unknown>}
                  filtros={filtros}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onCancelar} className="rounded-xl px-4 py-2 text-sm">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="rounded-xl bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Agregar al panel"}
          </button>
        </div>
      </div>
    </div>
  );
}
