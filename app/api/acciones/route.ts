import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ESTADOS = new Set(["pendiente", "en curso", "resuelta", "descartada"]);
const PRIORIDADES = new Set(["critica", "alta", "media", "baja"]);

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const campanaId = new URL(request.url).searchParams.get("campana");
  let consulta = supabase
    .from("accion_bsc")
    .select("id,campana_id,ejecutivo_id,titulo,descripcion,prioridad,estado,responsable,vencimiento,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (campanaId) consulta = consulta.eq("campana_id", campanaId);
  const { data, error } = await consulta;
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const titulo = String(body.titulo ?? "").trim().slice(0, 180);
  const prioridad = String(body.prioridad ?? "media");
  if (!titulo || !PRIORIDADES.has(prioridad)) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id")
    .eq("id", user.id)
    .single();
  if (!perfil?.tenant_id) return NextResponse.json({ error: "Falta organización." }, { status: 400 });

  const { data, error } = await supabase.from("accion_bsc").insert({
    tenant_id: perfil.tenant_id,
    campana_id: body.campanaId || null,
    ejecutivo_id: body.ejecutivoId || null,
    titulo,
    descripcion: String(body.descripcion ?? "").trim().slice(0, 1000) || null,
    prioridad,
    responsable: String(body.responsable ?? "").trim().slice(0, 120) || null,
    vencimiento: body.vencimiento || null,
    creado_por: user.id,
  }).select("id,campana_id,ejecutivo_id,titulo,descripcion,prioridad,estado,responsable,vencimiento,created_at").single();

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const id = String(body.id ?? "");
  const estado = String(body.estado ?? "");
  if (!id || !ESTADOS.has(estado)) {
    return NextResponse.json({ error: "Actualización inválida." }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("accion_bsc")
    .update({ estado })
    .eq("id", id)
    .select("id,estado")
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json(data);
}
