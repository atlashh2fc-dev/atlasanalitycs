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

  return NextResponse.json(data);
}
