import { createClient } from "@/lib/supabase/server";
import type { CampanaResumen } from "@/components/datos/dataset-card";

type CampanaFila = {
  id: string;
  nombre: string;
  tipo: string;
  descripcion: string | null;
};

type DatasetFila = {
  id: string;
  campana_id: string | null;
  updated_at: string;
};

type CargaFila = {
  dataset_id: string | null;
  campana_id: string | null;
  filas_validas: number | null;
  filas_totales: number | null;
  estado: string | null;
  created_at: string;
};

/**
 * Resumen operativo por campaña.
 *
 * `dataset` sigue siendo el contenedor técnico que permite conciliar campos
 * entre archivos, pero ya no se presenta como una decisión de negocio. Las
 * cargas diarias se agrupan por la campaña a la que pertenecen.
 */
export async function obtenerResumenCampanas(): Promise<CampanaResumen[]> {
  const supabase = await createClient();
  const [{ data: campanas }, { data: datasets }, { data: cargas }] =
    await Promise.all([
      supabase
        .from("campana")
        .select("id, nombre, tipo, descripcion")
        .eq("activo", true)
        .order("nombre"),
      supabase
        .from("dataset")
        .select("id, campana_id, updated_at")
        .eq("activo", true)
        .not("campana_id", "is", null)
        .order("updated_at", { ascending: false }),
      supabase
        .from("carga")
        .select(
          "dataset_id, campana_id, filas_validas, filas_totales, estado, created_at",
        )
        .not("campana_id", "is", null)
        .order("created_at", { ascending: false }),
    ]);

  const datasetPorCampana = new Map<string, string>();
  for (const dataset of (datasets ?? []) as DatasetFila[]) {
    if (dataset.campana_id && !datasetPorCampana.has(dataset.campana_id)) {
      datasetPorCampana.set(dataset.campana_id, dataset.id);
    }
  }

  const cargasPorCampana = new Map<string, CargaFila[]>();
  for (const carga of (cargas ?? []) as CargaFila[]) {
    if (!carga.campana_id) continue;
    const lista = cargasPorCampana.get(carga.campana_id) ?? [];
    lista.push(carga);
    cargasPorCampana.set(carga.campana_id, lista);
  }

  return ((campanas ?? []) as CampanaFila[]).map((campana) => {
    const historial = cargasPorCampana.get(campana.id) ?? [];
    const ultima = historial[0];
    return {
      ...campana,
      datasetId: datasetPorCampana.get(campana.id) ?? null,
      cargas: historial.length,
      filas: historial.reduce(
        (total, carga) =>
          total + (carga.filas_validas ?? carga.filas_totales ?? 0),
        0,
      ),
      ultimaCarga: ultima?.created_at ?? null,
      estado: ultima?.estado ?? null,
    };
  });
}
