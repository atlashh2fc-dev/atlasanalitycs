import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Total, serie y periodo anterior de una tarjeta de cifra, en un viaje. */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const body = (await request.json()) as {
    fuente: string;
    metrica: string;
    desde: string;
    hasta: string;
    campanaId?: string | null;
  };

  const { data, error } = await supabase.rpc("consulta_kpi", {
    p_fuente: body.fuente,
    p_metrica: body.metrica,
    p_desde: body.desde,
    p_hasta: body.hasta,
    p_campana: body.campanaId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
