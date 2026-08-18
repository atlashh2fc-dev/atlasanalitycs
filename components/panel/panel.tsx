"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { motion } from "framer-motion";
import { CalendarRange, Check, Lock, LockOpen, Plus, Target } from "lucide-react";
import { Asistente } from "./asistente";
import { ContenidoTarjeta, type Filtros } from "./tarjeta";
import { usaMovimientoReducido } from "@/lib/animacion";
import { tonoDe } from "@/lib/tonos";
import type { ConfigWidget, TipoWidget } from "@/lib/widgets";

const Grid = WidthProvider(Responsive);

export interface WidgetGuardado {
  id: string;
  tipo: TipoWidget;
  titulo: string;
  config: ConfigWidget;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Panel({
  panelId,
  widgetsIniciales,
  campanas,
  fuentesDisponibles,
  rangoInicial,
}: {
  panelId: string;
  widgetsIniciales: WidgetGuardado[];
  campanas: { id: string; nombre: string }[];
  fuentesDisponibles: Record<string, number>;
  rangoInicial: { desde: string; hasta: string };
}) {
  const [widgets, setWidgets] = useState<WidgetGuardado[]>(widgetsIniciales);
  // Las tarjetas se arrastran siempre. El candado existe para quien
  // ya dejó su panel como quiere y no desea moverlo sin querer.
  const [bloqueado, setBloqueado] = useState(false);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [asistente, setAsistente] = useState(false);
  const [montado, setMontado] = useState(false);
  const [guardado, setGuardado] = useState<string | null>(null);
  const reducido = usaMovimientoReducido();
  const [filtros, setFiltros] = useState<Filtros>({
    desde: rangoInicial.desde,
    hasta: rangoInicial.hasta,
    campanaId: null,
  });

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // react-grid-layout mide el ancho del contenedor, así que sólo puede
  // renderizarse en el navegador. Sin esta guarda, la primera pintura
  // del servidor no coincide con la del cliente.
  useEffect(() => setMontado(true), []);

  const layout: Layout[] = useMemo(
    () =>
      widgets.map((w) => ({
        i: w.id,
        x: w.x,
        y: w.y,
        w: w.w,
        h: w.h,
        // Bajo estos mínimos la tarjeta deja de ser legible
        minW: 3,
        minH: w.tipo === "kpi" ? 3 : 4,
      })),
    [widgets],
  );

  /** La disposición se guarda con retardo: arrastrar dispara muchos eventos. */
  function guardarLayout(nuevo: Layout[]) {
    setWidgets((prev) =>
      prev.map((w) => {
        const l = nuevo.find((n) => n.i === w.id);
        return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
      }),
    );

    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      await fetch("/api/panel", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          layout: nuevo.map((l) => ({ id: l.i, x: l.x, y: l.y, w: l.w, h: l.h })),
        }),
      });
      setGuardado("Disposición guardada");
      setTimeout(() => setGuardado(null), 2000);
    }, 700);
  }

  async function crear(t: {
    tipo: TipoWidget;
    titulo: string;
    config: ConfigWidget;
  }) {
    // El KPI necesita alto para la mini-serie; la tabla, para varias filas
    const alto = t.tipo === "kpi" ? 4 : t.tipo === "tabla" ? 6 : 5;
    const ancho = t.tipo === "kpi" ? 3 : 6;

    const res = await fetch("/api/panel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ panelId, ...t, w: ancho, h: alto }),
    });

    const json = await res.json();
    if (res.ok) {
      setWidgets((prev) => [
        ...prev,
        {
          id: json.id,
          tipo: t.tipo,
          titulo: t.titulo,
          config: t.config,
          x: 0,
          y: Infinity as unknown as number,
          w: ancho,
          h: alto,
        },
      ]);
      setAsistente(false);
    }
  }

  async function eliminar(id: string) {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    await fetch(`/api/panel?id=${id}`, { method: "DELETE" });
  }

  async function renombrar(id: string, titulo: string) {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, titulo } : w)));
    await fetch("/api/panel", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ widget: { id, titulo } }),
    });
  }

  return (
    <div>
      {/* Barra de filtros: píldoras de vidrio, no formularios sueltos.
          Lo que está filtrado se lee de un vistazo. */}
      <div className="mb-6 flex flex-wrap items-center gap-2.5">
        <label className="pildora cursor-pointer">
          <CalendarRange className="size-3.5 text-[var(--text-muted)]" />
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
            aria-label="Desde"
            className="tabular"
          />
          <span className="text-[var(--text-muted)]">→</span>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
            aria-label="Hasta"
            className="tabular"
          />
        </label>

        <label className="pildora cursor-pointer">
          <Target className="size-3.5 text-[var(--text-muted)]" />
          <select
            value={filtros.campanaId ?? ""}
            onChange={(e) =>
              setFiltros({ ...filtros, campanaId: e.target.value || null })
            }
            aria-label="Campaña"
            className="cursor-pointer"
          >
            <option value="">Todas las campañas</option>
            {campanas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-2">
          {guardado ? (
            <span className="flex items-center gap-1 text-xs text-[var(--good)]">
              <Check className="size-3.5" /> {guardado}
            </span>
          ) : null}

          <button
            onClick={() => setBloqueado((v) => !v)}
            title={
              bloqueado
                ? "Las tarjetas están fijas"
                : "Fijar las tarjetas para no moverlas sin querer"
            }
            className="pildora"
            style={
              bloqueado
                ? {
                    borderColor: "color-mix(in srgb, var(--tono-venta) 55%, transparent)",
                    color: "var(--tono-venta)",
                  }
                : undefined
            }
          >
            {bloqueado ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            {bloqueado ? "Fijado" : "Fijar"}
          </button>

          <button
            onClick={() => setAsistente(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--tono-venta) 92%, white), color-mix(in srgb, var(--tono-cotizacion) 80%, black))",
              boxShadow: "0 6px 20px color-mix(in srgb, var(--tono-venta) 40%, transparent)",
            }}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Nueva tarjeta
          </button>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div className="vidrio rounded-2xl border-dashed py-16 text-center">
          <p className="text-sm font-semibold">Tu panel está vacío</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--text-secondary)]">
            Crea tu primera tarjeta: eliges qué medir, cómo desglosarlo y
            Atlas te propone la mejor forma de verlo.
          </p>
          <button
            onClick={() => setAsistente(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--tono-venta) 92%, white), color-mix(in srgb, var(--tono-cotizacion) 80%, black))",
            }}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Crear tarjeta
          </button>
        </div>
      ) : null}

      {montado && widgets.length > 0 ? (
        <Grid
          className="-mx-2"
          layouts={{ lg: layout, md: layout, sm: layout }}
          breakpoints={{ lg: 1200, md: 900, sm: 640, xs: 0 }}
          cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
          rowHeight={64}
          margin={[18, 18]}
          isDraggable={!bloqueado}
          isResizable={!bloqueado}
          draggableHandle=".arrastrar"
          onLayoutChange={(l) => {
            if (!bloqueado) guardarLayout(l);
          }}
        >
          {widgets.map((w, i) => {
            const t = tonoDe((w.config as { fuente?: string })?.fuente);
            const Icono = t.icono;
            return (
              <div key={w.id} className="group">
                {/* La animación va en un hijo y no en el elemento de la
                    grilla: react-grid-layout escribe transform ahí, y dos
                    dueños del mismo transform se pisan. */}
                <motion.div
                  initial={reducido ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: reducido ? 0 : Math.min(i * 0.045, 0.4),
                    type: "spring",
                    stiffness: 260,
                    damping: 26,
                  }}
                  data-tono
                  style={{ "--tono": t.css } as React.CSSProperties}
                  className="vidrio flex h-full flex-col overflow-hidden rounded-2xl"
                >
                  <div
                    className={`flex items-start justify-between gap-2 px-4 pb-2 pt-3.5 ${
                      bloqueado ? "" : "arrastrar cursor-grab active:cursor-grabbing"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="grid size-6 shrink-0 place-items-center rounded-lg"
                        style={{
                          background: "color-mix(in srgb, var(--tono) 18%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--tono) 38%, transparent)",
                          color: "var(--tono)",
                        }}
                        title={t.nombre}
                      >
                        <Icono className="size-3.5" strokeWidth={2.2} />
                      </span>

                      {renombrando === w.id ? (
                        <input
                          autoFocus
                          value={w.titulo}
                          onChange={(e) => renombrar(w.id, e.target.value)}
                          onBlur={() => setRenombrando(null)}
                          onKeyDown={(e) => e.key === "Enter" && setRenombrando(null)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full rounded bg-[var(--vidrio-alto)] px-1 text-[13px] font-semibold outline-none"
                        />
                      ) : (
                        <h3
                          onDoubleClick={() => setRenombrando(w.id)}
                          title={w.titulo}
                          className="truncate text-[13px] font-semibold leading-tight"
                        >
                          {w.titulo}
                        </h3>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        onClick={() => setRenombrando(w.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        aria-label={`Renombrar ${w.titulo}`}
                        className="rounded px-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        Renombrar
                      </button>
                      <button
                        onClick={() => eliminar(w.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        aria-label={`Eliminar ${w.titulo}`}
                        className="rounded px-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--critical)]"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 px-4 pb-4">
                    <ContenidoTarjeta
                      tipo={w.tipo}
                      config={w.config as unknown as Record<string, unknown>}
                      filtros={filtros}
                      objetivo={w.config?.objetivo}
                    />
                  </div>
                </motion.div>
              </div>
            );
          })}
        </Grid>
      ) : null}

      {asistente ? (
        <Asistente
          filtros={filtros}
          fuentesDisponibles={fuentesDisponibles}
          onCancelar={() => setAsistente(false)}
          onCrear={crear}
        />
      ) : null}
    </div>
  );
}
