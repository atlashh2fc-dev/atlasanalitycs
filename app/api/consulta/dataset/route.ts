import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ConsultaDatasetBody {
  datasetId?: string;
  metricaId?: string | null;
  dimensionId?: string | null;
  agregacion?: "count" | "count_distinct" | "sum" | "avg" | "min" | "max";
  granularidad?: "dia" | "semana" | "mes" | "trimestre" | "ano";
  desde?: string | null;
  hasta?: string | null;
  limite?: number;
  orden?: "asc" | "desc";
}

type RespuestaRpc = {
  series?: { clave: string; valor: number }[];
  total?: number;
  metadatos?: { filas?: number };
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const body = (await request.json()) as ConsultaDatasetBody;
  if (!body.datasetId) {
    return NextResponse.json({ error: "Falta datasetId." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("consulta_dataset", {
    p_dataset: body.datasetId,
    p_metrica: body.metricaId ?? null,
    p_dimension: body.dimensionId ?? null,
    p_agregacion: body.agregacion ?? null,
    p_granularidad: body.granularidad ?? "dia",
    p_desde: body.desde ?? null,
    p_hasta: body.hasta ?? null,
    p_limite: Math.max(1, Math.min(body.limite ?? 50, 500)),
    p_orden: body.orden ?? "desc",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const resultado = (data ?? {}) as RespuestaRpc;
  let unidad: "entero" | "decimal" | "uf" | "clp" | "porcentaje" =
    body.agregacion === "count" || body.agregacion === "count_distinct"
      ? "entero"
      : "decimal";

  if (body.metricaId) {
    const { data: campo } = await supabase
      .from("dataset_campo")
      .select("tipo,unidad")
      .eq("id", body.metricaId)
      .eq("dataset_id", body.datasetId)
      .maybeSingle();

    if (campo?.unidad && ["entero", "decimal", "uf", "clp", "porcentaje"].includes(campo.unidad)) {
      unidad = campo.unidad as typeof unidad;
    } else if (campo?.tipo === "uf") unidad = "uf";
    else if (campo?.tipo === "monto") unidad = "clp";
    else if (campo?.tipo === "entero" && body.agregacion !== "avg") unidad = "entero";
  }

  return NextResponse.json({
    ...resultado,
    filas: resultado.series ?? [],
    total: Number(resultado.total ?? 0),
    registros: Number(resultado.metadatos?.filas ?? 0),
    unidad,
  });
}
