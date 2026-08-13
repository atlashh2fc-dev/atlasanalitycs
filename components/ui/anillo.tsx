"use client";

import { useId } from "react";
import { usaMovimientoReducido } from "@/lib/animacion";

/**
 * Anillo de ritmo.
 *
 * La barra de progreso plana responde "cuánto llevo". La pregunta que
 * de verdad se hace un supervisor a mitad de mes es otra: "¿voy a
 * llegar?". Por eso el anillo lleva dos marcas: el arco es el avance
 * sobre la meta y la muesca es dónde debería ir hoy según los días
 * transcurridos. Estar detrás de la muesca es la señal, no el
 * porcentaje.
 *
 * Es el elemento propio de Atlas Analytics: aparece sólo donde hay
 * meta, nunca como adorno.
 */
export function AnilloRitmo({
  avance,
  ritmo,
  tono,
  tamano = 76,
  grosor = 7,
}: {
  /** Fracción de la meta ya lograda. 1 = meta cumplida. */
  avance: number;
  /** Fracción que correspondería a hoy. Sin ella no se dibuja la muesca. */
  ritmo?: number | null;
  tono: string;
  tamano?: number;
  grosor?: number;
}) {
  const reducido = usaMovimientoReducido();
  const id = useId().replace(/:/g, "");

  const r = (tamano - grosor) / 2;
  const centro = tamano / 2;
  const vuelta = 2 * Math.PI * r;

  const pct = Math.max(0, Math.min(avance, 1.35));
  const enRitmo = ritmo == null || avance >= ritmo;

  // Rojo sólo cuando de verdad importa: por debajo del ritmo esperado,
  // no por debajo de la meta de fin de mes.
  const color = enRitmo ? tono : "var(--serious)";

  // La muesca del ritmo. Se dibuja dentro del SVG y no como capa
  // rotada encima: así queda exactamente sobre el mismo arco, sin
  // depender de que dos sistemas de coordenadas coincidan.
  // Las coordenadas van redondeadas: el seno y el coseno no dan bit a
  // bit el mismo resultado en el servidor y en el navegador, y React
  // trata esa diferencia en el último decimal como una discrepancia de
  // hidratación.
  const marca =
    ritmo == null
      ? null
      : (() => {
          const a = Math.min(ritmo, 1) * 2 * Math.PI;
          const interior = r - grosor / 2 - 3;
          const exterior = r + grosor / 2 + 3;
          const p = (v: number) => Math.round(v * 100) / 100;
          return {
            x1: p(centro + interior * Math.cos(a)),
            y1: p(centro + interior * Math.sin(a)),
            x2: p(centro + exterior * Math.cos(a)),
            y2: p(centro + exterior * Math.sin(a)),
          };
        })();

  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <defs>
          <linearGradient id={`ar-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>

        <circle
          cx={centro}
          cy={centro}
          r={r}
          fill="none"
          stroke="var(--vidrio-borde)"
          strokeWidth={grosor}
        />

        <circle
          cx={centro}
          cy={centro}
          r={r}
          fill="none"
          stroke={`url(#ar-${id})`}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={vuelta}
          strokeDashoffset={vuelta * (1 - Math.min(pct, 1))}
          style={{
            transition: reducido ? undefined : "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)",
            filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 55%, transparent))`,
          }}
        />

        {marca ? (
          <line
            x1={marca.x1}
            y1={marca.y1}
            x2={marca.x2}
            y2={marca.y2}
            stroke="var(--text-primary)"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.9}
          >
            <title>Ritmo esperado a hoy</title>
          </line>
        ) : null}
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="tabular text-[13px] font-semibold tracking-tight"
          style={{ color }}
        >
          {Math.round(avance * 100)}%
        </span>
      </div>
    </div>
  );
}
