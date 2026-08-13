import { createClient } from "@/lib/supabase/server";
import type { DatasetResumen } from "@/components/datos/dataset-card";

type DatasetFila = {
  id: string;
  nombre: string;
  descripcion: string | null;
};

type CargaFila = {
  dataset_id: string | null;
  filas_validas: number | null;
  filas_totales: number | null;
  estado: string | null;
  created_at: string;
};

/** Vista liviana compartida por Inicio y Datos. */
export async function obtenerResumenDatasets(): Promise<DatasetResumen[]> {
  const supabase = await createClient();
  const [{ data: datasets }, { data: cargas }] = await Promise.all([
    supabase
      .from("dataset")
      .select("id, nombre, descripcion")
      .eq("activo", true)
      .order("updated_at", { ascending: false }),
    supabase
      .from("carga")
      .select("dataset_id, filas_validas, filas_totales, estado, created_at")
      .not("dataset_id", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  const porDataset = new Map<string, CargaFila[]>();
  for (const carga of (cargas ?? []) as CargaFila[]) {
    if (!carga.dataset_id) continue;
    const lista = porDataset.get(carga.dataset_id) ?? [];
    lista.push(carga);
    porDataset.set(carga.dataset_id, lista);
  }

  return ((datasets ?? []) as DatasetFila[]).map((dataset) => {
    const historial = porDataset.get(dataset.id) ?? [];
    const ultima = historial[0];
    return {
      ...dataset,
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
