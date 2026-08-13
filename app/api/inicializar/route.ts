import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { organizacion } = (await request.json()) as { organizacion?: string };

  const { data, error } = await supabase.rpc("inicializar_tenant", {
    p_nombre: organizacion?.trim() || "Atlas",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ tenantId: data });
}
