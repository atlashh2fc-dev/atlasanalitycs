import { notFound } from "next/navigation";

/**
 * El banco de pruebas visual no existe fuera de desarrollo.
 *
 * Se corta acá y no en el middleware para que no dependa de que alguien
 * recuerde mantener una lista de rutas públicas: en producción la ruta
 * responde 404 aunque el middleware la deje pasar.
 */
export default function LayoutVistaPrevia({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  return <>{children}</>;
}
