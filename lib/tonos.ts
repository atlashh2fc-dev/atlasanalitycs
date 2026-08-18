import {
  Banknote,
  CalendarClock,
  FileText,
  Users,
  Clock,
  Database,
  Activity,
  type LucideIcon,
} from "lucide-react";

/**
 * Tono e icono por fuente de dato.
 *
 * El color de una tarjeta no es decoración: dice de qué base viene el
 * número. Un panel con doce tarjetas azules obliga a leer cada título
 * para saber qué estás mirando; con tono por fuente, la agrupación se
 * ve antes de leer. Los cinco tonos están separados en matiz lo
 * suficiente para distinguirse también en deuteranopía.
 */
export type Fuente =
  | "operacion"
  | "venta"
  | "cotizacion"
  | "agendamiento"
  | "asistencia"
  | "cliente"
  | "dataset";

export const TONO: Record<Fuente, { css: string; icono: LucideIcon; nombre: string }> = {
  operacion: { css: "var(--tono-cliente)", icono: Activity, nombre: "Operación comercial" },
  venta: { css: "var(--tono-venta)", icono: Banknote, nombre: "Ventas" },
  cotizacion: { css: "var(--tono-cotizacion)", icono: FileText, nombre: "Cotizaciones" },
  agendamiento: { css: "var(--tono-agendamiento)", icono: CalendarClock, nombre: "Agendamientos" },
  asistencia: { css: "var(--tono-asistencia)", icono: Clock, nombre: "Asistencia" },
  cliente: { css: "var(--tono-cliente)", icono: Users, nombre: "Clientes" },
  dataset: { css: "var(--series-1)", icono: Database, nombre: "Base de datos" },
};

export function tonoDe(fuente: unknown): { css: string; icono: LucideIcon; nombre: string } {
  const f = String(fuente ?? "") as Fuente;
  return TONO[f] ?? TONO.venta;
}
