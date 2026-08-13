"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const OPCIONES = [
  { valor: "light", etiqueta: "Claro" },
  { valor: "dark", etiqueta: "Oscuro" },
  { valor: "system", etiqueta: "Sistema" },
] as const;

/**
 * Selector de tema.
 *
 * Hasta que monta, el tema real lo decide el script que next-themes
 * inyecta antes de pintar: renderizar el estado aquí antes de tiempo
 * produciría un desajuste con lo que el servidor mandó.
 */
export function SelectorTema() {
  const { theme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  return (
    <div className="flex items-center rounded-md border bg-[var(--surface-2)] p-0.5">
      {OPCIONES.map((o) => {
        const activo = montado && theme === o.valor;
        return (
          <button
            key={o.valor}
            onClick={() => setTheme(o.valor)}
            aria-pressed={activo}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
              activo
                ? "bg-[var(--surface-0)] font-medium text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
