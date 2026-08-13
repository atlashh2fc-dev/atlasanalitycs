"use client";

import { useEffect, useRef, useState } from "react";

/** Respeta la preferencia del sistema: nadie debería marearse con un panel. */
export function usaMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducido(mq.matches);
    const alCambiar = () => setReducido(mq.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  return reducido;
}

/**
 * Cuenta hasta el valor con desaceleración.
 *
 * Empieza desde el valor anterior, no desde cero: cuando cambia el
 * filtro, ver la cifra saltar de 0 otra vez se siente como recargar la
 * página en vez de como una actualización.
 */
export function useConteo(valor: number, duracion = 550): number {
  const reducido = usaMovimientoReducido();
  const [actual, setActual] = useState(valor);
  const desde = useRef(valor);
  const cuadro = useRef<number | null>(null);

  useEffect(() => {
    if (reducido) {
      setActual(valor);
      desde.current = valor;
      return;
    }

    const inicio = performance.now();
    const origen = desde.current;
    const delta = valor - origen;

    if (delta === 0) return;

    const paso = (ahora: number) => {
      const t = Math.min((ahora - inicio) / duracion, 1);
      // easeOutCubic: rápido al principio, se asienta al final
      const e = 1 - Math.pow(1 - t, 3);
      setActual(origen + delta * e);
      if (t < 1) cuadro.current = requestAnimationFrame(paso);
      else desde.current = valor;
    };

    cuadro.current = requestAnimationFrame(paso);
    return () => {
      if (cuadro.current) cancelAnimationFrame(cuadro.current);
      desde.current = valor;
    };
  }, [valor, duracion, reducido]);

  return actual;
}
