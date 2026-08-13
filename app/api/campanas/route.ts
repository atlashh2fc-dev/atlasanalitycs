import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TIPOS = new Set(["venta", "outbound", "inbound", "mixta"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id, rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.activo || !perfil.tenant_id) {
    return NextResponse.json(
      { error: "Tu usuario no tiene un espacio activo." },
      { status: 403 },
    );
  }
  if (perfil.rol !== "admin") {
    return NextResponse.json(
      { error: "Sólo un administrador puede crear campañas." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { nombre?: string; tipo?: string };
  const nombre = body.nombre?.trim();
  const tipo = body.tipo?.trim() ?? "venta";
  if (!nombre || nombre.length > 120) {
    return NextResponse.json(
      { error: "Escribe un nombre de hasta 120 caracteres." },
      { status: 400 },
    );
  }
  if (!TIPOS.has(tipo)) {
    return NextResponse.json(
      { error: "Tipo de campaña inválido." },
      { status: 400 },
    );
  }

  const { data: campana, error } = await supabase
    .from("campana")
    .insert({
      tenant_id: perfil.tenant_id,
      nombre,
      tipo,
      fecha_inicio: new Date().toISOString().slice(0, 10),
    })
    .select("id, nombre, tipo")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ya existe una campaña con ese nombre." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo crear la campaña." },
      { status: 400 },
    );
  }

  return NextResponse.json({ campana }, { status: 201 });
}
