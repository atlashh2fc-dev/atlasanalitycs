import type { TipoWidget } from "@/lib/widgets";

export type AgregacionDataset =
  | "count"
  | "count_distinct"
  | "sum"
  | "avg"
  | "min"
  | "max";

export interface CampoDataset {
  id: string;
  clave: string;
  nombre: string;
  tipo: string;
  rol: "identificador" | "dimension" | "metrica" | "fecha" | "ignorado";
  agregacion: AgregacionDataset | null;
  unidad: string | null;
  activo: boolean;
}

export interface CatalogoDataset {
  dataset: { id: string; nombre: string; descripcion: string | null };
  resumen: {
    filas: number;
    cargas: number;
    desde: string | null;
    hasta: string | null;
    ultima_carga: string | null;
  };
  campos: CampoDataset[];
  metricas: CampoDataset[];
  dimensiones: CampoDataset[];
}

export interface ConfigWidgetDataset {
  fuente: "dataset";
  datasetId: string;
  metricaId?: string | null;
  dimensionId?: string | null;
  agregacion: AgregacionDataset;
  granularidad?: "dia" | "semana" | "mes" | "trimestre" | "ano";
  limite?: number;
  orden?: "asc" | "desc";
  tieneFecha?: boolean;
  objetivo?: number;
}

export interface NuevoWidgetDataset {
  tipo: TipoWidget;
  titulo: string;
  config: ConfigWidgetDataset;
}
