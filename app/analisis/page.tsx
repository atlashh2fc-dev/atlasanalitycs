/**
 * La experiencia principal de análisis es el panel personal persistente.
 *
 * Conservamos `/dashboard` como ruta compatible, pero `/analisis` monta el
 * mismo panel: tarjetas guardadas, filtros, drag & drop, redimensionado y el
 * asistente para crear gráficos. El análisis automático genérico queda fuera
 * de esta ruta hasta que pueda integrarse como una fuente más del asistente,
 * sin reemplazar la configuración que el usuario ya construyó.
 */
export { dynamic, default } from "../dashboard/page";
