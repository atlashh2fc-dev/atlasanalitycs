import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const body = (await request.json()) as {
    cargaIds?: string[];
    datasetId?: string | null;
    nombre?: string | null;
  };

  const cargaIds = [...new Set(body.cargaIds ?? [])].slice(0, 101);
  if (cargaIds.length === 0 || cargaIds.length > 100) {
    return NextResponse.json(
      { error: "Selecciona entre 1 y 100 cargas." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("usar_cargas_en_dataset", {
    p_cargas: cargaIds,
    p_dataset: body.datasetId || null,
    p_nombre: body.nombre?.trim() || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ datasetId: data });
}
