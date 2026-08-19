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

  const { mes } = (await request.json()) as { mes?: string };
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.tenant_id) {
    return NextResponse.json(
      { error: "El usuario no tiene un tenant asignado." },
      { status: 400 },
    );
  }

  // El wrapper deriva el tenant desde la sesión. La función interna no queda
  // expuesta a UUID de periodos arbitrarios.
  const { data: periodos, error } = await supabase.rpc("recalcular_periodos_carga", {
    p_meses: [`${mes}-01`],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ periodos });
}
