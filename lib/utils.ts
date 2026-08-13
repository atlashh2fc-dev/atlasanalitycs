import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = {
  entero: (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : new Intl.NumberFormat("es-CL").format(n),
  decimal: (n: number | null | undefined, d = 2) =>
    n === null || n === undefined
      ? "—"
      : new Intl.NumberFormat("es-CL", {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }).format(n),
  pct: (n: number | null | undefined, d = 1) =>
    n === null || n === undefined ? "—" : `${fmt.decimal(n * 100, d)}%`,
  clp: (n: number | null | undefined) =>
    n === null || n === undefined
      ? "—"
      : new Intl.NumberFormat("es-CL", {
          style: "currency",
          currency: "CLP",
          maximumFractionDigits: 0,
        }).format(n),
  uf: (n: number | null | undefined, d = 2) =>
    n === null || n === undefined ? "—" : `${fmt.decimal(n, d)} UF`,
};

/** Días hábiles (lunes a viernes) entre dos fechas, inclusive. */
export function diasHabiles(desde: Date, hasta: Date): number {
  let n = 0;
  const d = new Date(desde);
  while (d <= hasta) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}
