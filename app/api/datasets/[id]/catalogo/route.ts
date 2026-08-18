import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { id } = await context.params;
  const { data, error } = await supabase.rpc("catalogo_dataset", {
    p_dataset: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Dataset no encontrado." }, { status: 404 });
  }

  return NextResponse.json(data);
}
