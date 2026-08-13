import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ConfigWidget } from "@/lib/widgets";

/**
 * Motor de consulta de las tarjetas.
 *
 * La agregación ocurre en Postgres, no acá: la API REST de Supabase
 * corta en 1.000 filas, así que sumar en el servidor de Node daba
 * totales truncados —2.064 cotizaciones se veían como 1.000—. El RPC es
 * SECURITY INVOKER, así que el RLS del usuario sigue aplicando.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const body = (await request.json()) as ConfigWidget & {
    desde?: string;
    hasta?: string;
    campanaId?: string | null;
  };

  const { data, error } = await supabase.rpc("consulta_widget", {
    p_fuente: body.fuente,
    p_metrica: body.metrica,
    p_dimension: body.dimension ?? null,
    p_granularidad: body.granularidad ?? "dia",
    p_desde: body.desde ?? null,
    p_hasta: body.hasta ?? null,
    p_campana: body.campanaId ?? null,
    p_limite: body.limite ?? 50,
    p_orden: body.orden ?? "desc",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
