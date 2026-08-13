import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
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
  const body = (await request.json()) as { campanaId?: string | null };
  const campanaId = body.campanaId?.trim() || null;

  const { data, error } = await supabase.rpc("asignar_campana_dataset", {
    p_dataset: id,
    p_campana: campanaId,
  });

  if (error) {
    const mensaje = error.message || "No se pudo asignar la campaña.";
    const prohibido = /administrador|sesión|espacio activo/i.test(mensaje);
    return NextResponse.json(
      { error: mensaje },
      { status: prohibido ? 403 : 400 },
    );
  }

  return NextResponse.json(data);
}
