"use client";

/**
 * Piezas compartidas de los gráficos.
 *
 * Paleta categórica validada (CVD ΔE 9.2 all-pairs, normal-vision 24.0
 * sobre superficie #fcfcfb). El slot 3 queda bajo 3:1 de contraste, así
 * que todo gráfico que lo use lleva etiquetas visibles o vista de tabla.
 */

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;

export const ESTADO = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const EJE = {
  tick: { fill: "var(--text-secondary)", fontSize: 12 },
  line: { stroke: "var(--border)" },
};

export function Tooltip({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { etiqueta: string; valor: string; color?: string }[];
}) {
  return (
    <div className="rounded-md border bg-[var(--surface-2)] px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-xs font-semibold text-[var(--text-primary)]">
        {titulo}
      </p>
      <div className="space-y-1">
        {filas.map((f) => (
          <div key={f.etiqueta} className="flex items-center gap-2 text-xs">
            {f.color ? (
              <span
                aria-hidden
                className="inline-block size-2 rounded-sm"
                style={{ background: f.color }}
              />
            ) : null}
            <span className="text-[var(--text-secondary)]">{f.etiqueta}</span>
            <span className="tabular ml-auto font-medium text-[var(--text-primary)]">
              {f.valor}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Leyenda({
  items,
}: {
  items: { nombre: string; color: string }[];
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      {items.map((i) => (
        <span key={i.nombre} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-sm"
            style={{ background: i.color }}
          />
          {i.nombre}
        </span>
      ))}
    </div>
  );
}

export function SinDatos({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed">
      <p className="max-w-xs text-center text-sm text-[var(--text-muted)]">
        {mensaje}
      </p>
    </div>
  );
}
