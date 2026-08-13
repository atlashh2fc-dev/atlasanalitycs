"use client";

import { useMemo, useState } from "react";
import {
  FUENTES,
  TIPO_NOMBRE,
  tiposSugeridos,
  type ConfigWidget,
  type TipoWidget,
} from "@/lib/widgets";
import { ContenidoTarjeta, type Filtros } from "./tarjeta";

/**
 * Asistente de nueva tarjeta.
 *
 * Tres decisiones, en el orden en que las toma una persona:
 * qué medir, cómo desglosarlo y cómo verlo. La forma de visualización se
 * propone en función de la combinación elegida —tiempo pide línea,
 * categorías piden barra, una cifra sola pide tarjeta— y se previsualiza
 * con datos reales antes de guardar.
 */
export function Asistente({
  filtros,
  fuentesDisponibles,
  onCancelar,
  onCrear,
}: {
  filtros: Filtros;
  fuentesDisponibles: Record<string, number>;
  onCancelar: () => void;
  onCrear: (t: {
    tipo: TipoWidget;
    titulo: string;
    config: ConfigWidget;
  }) => Promise<void>;
}) {
  const [paso, setPaso] = useState(1);
  const [fuenteClave, setFuenteClave] = useState<string | null>(null);
  const [metrica, setMetrica] = useState<string | null>(null);
  const [dimension, setDimension] = useState<string | null>(null);
  const [granularidad, setGranularidad] = useState<"dia" | "semana" | "mes">("dia");
  const [tipo, setTipo] = useState<TipoWidget | null>(null);
  const [titulo, setTitulo] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const fuente = FUENTES.find((f) => f.clave === fuenteClave);
  const met = fuente?.metricas.find((m) => m.clave === metrica);
  const dim = fuente?.dimensiones.find((d) => d.clave === dimension);

  const config: ConfigWidget | null = useMemo(() => {
    if (!fuente || !metrica) return null;
    return {
      fuente: fuente.clave,
      metrica,
      dimension: dimension ?? undefined,
      granularidad: dim?.temporal ? granularidad : undefined,
      limite: dim?.temporal ? undefined : 12,
      orden: "desc",
      objetivo: objetivo ? Number(objetivo) : undefined,
    };
  }, [fuente, metrica, dimension, granularidad, objetivo, dim]);

  const sugeridos = fuente ? tiposSugeridos({ dimension: dimension ?? undefined }, fuente, 10) : [];

  const tituloAuto =
    met && dim
      ? `${met.nombre} por ${dim.nombre.toLowerCase()}`
      : (met?.nombre ?? "Nueva tarjeta");

  async function guardar() {
    if (!config || !tipo) return;
    setGuardando(true);
    await onCrear({
      tipo,
      titulo: titulo.trim() || tituloAuto,
      config,
    });
    setGuardando(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onCancelar}
    >
      <div
        className="w-full max-w-4xl rounded-xl border bg-[var(--surface-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera con pasos */}
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">Nueva tarjeta</h2>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className="h-1 w-7 rounded-full transition-colors"
                  style={{
                    background:
                      n <= paso ? "var(--series-1)" : "var(--border)",
                  }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={onCancelar}
            className="rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-0)]"
          >
            Cerrar
          </button>
        </div>

        <div className="p-5">
          {/* ---------------- Paso 1: qué medir ---------------- */}
          {paso === 1 ? (
            <>
              <p className="mb-3 text-sm font-medium">¿Qué quieres medir?</p>

              <div className="grid gap-2 sm:grid-cols-2">
                {FUENTES.filter((f) => (fuentesDisponibles[f.clave] ?? 0) > 0).map(
                  (f) => (
                    <button
                      key={f.clave}
                      onClick={() => {
                        setFuenteClave(f.clave);
                        setMetrica(null);
                        setDimension(null);
                        setTipo(null);
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        fuenteClave === f.clave
                          ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_6%,transparent)]"
                          : "hover:bg-[var(--surface-0)]"
                      }`}
                    >
                      <p className="text-sm font-medium">{f.nombre}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {f.descripcion}
                      </p>
                      <p className="tabular mt-1 text-[11px] text-[var(--text-muted)]">
                        {fuentesDisponibles[f.clave]?.toLocaleString("es-CL")} registros
                      </p>
                    </button>
                  ),
                )}
              </div>

              {Object.values(fuentesDisponibles).every((n) => !n) ? (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Todavía no hay datos cargados. Sube un Excel y vuelve acá.
                </p>
              ) : null}

              {fuente ? (
                <>
                  <p className="mb-2 mt-5 text-sm font-medium">Indicador</p>
                  <div className="flex flex-wrap gap-2">
                    {fuente.metricas.map((m) => (
                      <button
                        key={m.clave}
                        onClick={() => setMetrica(m.clave)}
                        title={m.descripcion}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          metrica === m.clave
                            ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_6%,transparent)] font-medium"
                            : "hover:bg-[var(--surface-0)]"
                        }`}
                      >
                        {m.nombre}
                        {m.descripcion ? (
                          <span className="block text-[11px] font-normal text-[var(--text-muted)]">
                            {m.descripcion}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {/* ---------------- Paso 2: desglose ---------------- */}
          {paso === 2 && fuente ? (
            <>
              <p className="mb-1 text-sm font-medium">¿Cómo quieres desglosarlo?</p>
              <p className="mb-3 text-xs text-[var(--text-secondary)]">
                Sin desglose queda una sola cifra. Con desglose se compara
                entre categorías o se ve la evolución en el tiempo.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setDimension(null);
                    setTipo("kpi");
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    dimension === null
                      ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_6%,transparent)] font-medium"
                      : "hover:bg-[var(--surface-0)]"
                  }`}
                >
                  Sin desglose · una cifra
                </button>

                {fuente.dimensiones.map((d) => (
                  <button
                    key={d.clave}
                    onClick={() => {
                      setDimension(d.clave);
                      setTipo(null);
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      dimension === d.clave
                        ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_6%,transparent)] font-medium"
                        : "hover:bg-[var(--surface-0)]"
                    }`}
                  >
                    {d.nombre}
                    {d.temporal ? (
                      <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">
                        tiempo
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>

              {dim?.temporal ? (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">
                    Agrupar por
                  </p>
                  <div className="flex gap-2">
                    {(["dia", "semana", "mes"] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setGranularidad(g)}
                        className={`rounded-md border px-2.5 py-1 text-xs ${
                          granularidad === g
                            ? "border-[var(--series-1)] font-medium"
                            : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {g === "dia" ? "Día" : g === "semana" ? "Semana" : "Mes"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {/* ---------------- Paso 3: cómo verlo ---------------- */}
          {paso === 3 && fuente && config ? (
            <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
              <div>
                <p className="mb-2 text-sm font-medium">¿Cómo lo ves mejor?</p>
                <div className="space-y-1.5">
                  {sugeridos.map((s) => (
                    <button
                      key={s.tipo}
                      onClick={() => setTipo(s.tipo)}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        tipo === s.tipo
                          ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_6%,transparent)]"
                          : "hover:bg-[var(--surface-0)]"
                      }`}
                    >
                      <p className="text-sm font-medium">{s.nombre}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {s.razon}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block text-xs text-[var(--text-secondary)]">
                    <span className="mb-1 block font-medium">Título</span>
                    <input
                      value={titulo}
                      onChange={(e) => setTitulo(e.target.value)}
                      placeholder={tituloAuto}
                      className="w-full rounded-md border bg-[var(--surface-2)] px-2.5 py-1.5 text-sm"
                    />
                  </label>

                  <label className="block text-xs text-[var(--text-secondary)]">
                    <span className="mb-1 block font-medium">
                      Meta (opcional)
                    </span>
                    <input
                      type="number"
                      value={objetivo}
                      onChange={(e) => setObjetivo(e.target.value)}
                      placeholder="250"
                      className="w-full rounded-md border bg-[var(--surface-2)] px-2.5 py-1.5 text-sm"
                    />
                    <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                      Dibuja la línea de referencia y el avance.
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Vista previa</p>
                <div className="rounded-lg border bg-[var(--surface-1)] p-4">
                  <p className="mb-3 text-sm font-semibold">
                    {titulo.trim() || tituloAuto}
                  </p>
                  <div className="h-[260px]">
                    {tipo ? (
                      <ContenidoTarjeta
                        tipo={tipo}
                        config={config as unknown as Record<string, unknown>}
                        filtros={filtros}
                        objetivo={objetivo ? Number(objetivo) : undefined}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <p className="text-xs text-[var(--text-muted)]">
                          Elige una forma de visualización.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                {tipo ? (
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    {TIPO_NOMBRE[tipo]} · datos reales del periodo seleccionado.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Pie */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          <button
            onClick={() => (paso === 1 ? onCancelar() : setPaso(paso - 1))}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-0)]"
          >
            {paso === 1 ? "Cancelar" : "Atrás"}
          </button>

          {paso < 3 ? (
            <button
              onClick={() => setPaso(paso + 1)}
              disabled={paso === 1 && !metrica}
              className="rounded-md bg-[var(--series-1)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Continuar
            </button>
          ) : (
            <button
              onClick={guardar}
              disabled={!tipo || guardando}
              className="rounded-md bg-[var(--series-1)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardando ? "Agregando…" : "Agregar al panel"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
