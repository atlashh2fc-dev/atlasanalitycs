import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Mantenedor económico: tarifa, remuneración y costos de operación.
 *
 * Las tres tablas comparten forma —parámetros con vigencia— así que
 * comparten ruta. La autorización no se resuelve acá sino en las
 * políticas de la base: un supervisor que llame a esta ruta recibirá un
 * error de la propia base, no una comprobación que alguien pueda
 * olvidar de replicar.
 */

const TABLAS = new Set([
  "tarifa",
  "comision",
  "remuneracion",
  "costo_operacion",
  "valor_uf",
]);

async function sesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function tablaValida(t: unknown): t is string {
  return typeof t === "string" && TABLAS.has(t);
}

export async function POST(request: Request) {
  const { supabase, user } = await sesion();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const body = (await request.json()) as {
    tabla?: string;
    fila?: Record<string, unknown>;
  };

  if (!tablaValida(body.tabla) || !body.fila) {
    return NextResponse.json({ error: "Falta la tabla o la fila." }, { status: 400 });
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!perfil?.tenant_id) {
    return NextResponse.json(
      { error: "El usuario no tiene organización asignada." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from(body.tabla)
    .insert({ ...body.fila, tenant_id: perfil.tenant_id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const { supabase, user } = await sesion();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const body = (await request.json()) as {
    tabla?: string;
    id?: string;
    cambios?: Record<string, unknown>;
  };

  if (!tablaValida(body.tabla) || !body.id || !body.cambios) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }

  const { error } = await supabase
    .from(body.tabla)
    .update(body.cambios)
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await sesion();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const url = new URL(request.url);
  const tabla = url.searchParams.get("tabla");
  const id = url.searchParams.get("id");

  if (!tablaValida(tabla) || !id) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }

  const { error } = await supabase.from(tabla).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
