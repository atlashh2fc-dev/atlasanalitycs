"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const OPCIONES = [
  { valor: "light", etiqueta: "Claro", icono: Sun },
  { valor: "dark", etiqueta: "Oscuro", icono: Moon },
  { valor: "system", etiqueta: "Sistema", icono: Monitor },
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
    <div className="flex items-center gap-0.5 rounded-full border border-[var(--vidrio-borde)] bg-[var(--vidrio)] p-0.5">
      {OPCIONES.map((o) => {
        const activo = montado && theme === o.valor;
        const Icono = o.icono;
        return (
          <button
            key={o.valor}
            onClick={() => setTheme(o.valor)}
            aria-pressed={activo}
            aria-label={`Tema ${o.etiqueta.toLowerCase()}`}
            title={o.etiqueta}
            className={`rounded-full p-1.5 transition-colors ${
              activo
                ? "bg-[var(--vidrio-alto)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <Icono className="size-3.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
