import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { agrega, getFuente, type ConfigWidget } from "@/lib/widgets";

/**
 * Motor de consulta de las tarjetas.
 *
 * Recibe la especificación de un widget y devuelve los datos ya
 * agregados. Las consultas van con el cliente normal, así que el RLS
 * aplica: un supervisor sólo agrega sobre las campañas que puede ver.
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

  const fuente = getFuente(body.fuente);
  if (!fuente) {
    return NextResponse.json({ error: "Fuente desconocida." }, { status: 400 });
  }

  let q = supabase.from(fuente.tabla).select(fuente.select).limit(50_000);

  if (body.desde) q = q.gte(fuente.campoFecha, body.desde);
  if (body.hasta) q = q.lte(fuente.campoFecha, `${body.hasta}T23:59:59`);

  // 'cliente' no tiene campaña: es transversal a todas.
  if (body.campanaId && fuente.clave !== "cliente") {
    q = q.eq("campana_id", body.campanaId);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultado = agrega(
    (data ?? []) as unknown as Record<string, unknown>[],
    fuente,
    body,
  );

  return NextResponse.json(resultado);
}
