import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Crea una tarjeta en un panel. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const body = (await request.json()) as {
    panelId?: string;
    tipo?: string;
    titulo?: string;
    config?: Record<string, unknown>;
    w?: number;
    h?: number;
    y?: number;
  };

  if (!body.panelId || !body.tipo || !body.titulo) {
    return NextResponse.json({ error: "Faltan datos de la tarjeta." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("panel_widget")
    .insert({
      panel_id: body.panelId,
      tipo: body.tipo,
      titulo: body.titulo,
      config: body.config ?? {},
      x: 0,
      // Se agrega abajo del todo: no desordena lo que el usuario ya acomodó
      y: body.y ?? 999,
      w: body.w ?? 4,
      h: body.h ?? 5,
    })
    .select("id, tipo, titulo, config, x, y, w, h")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/** Guarda la disposición o edita una tarjeta. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const body = (await request.json()) as {
    layout?: { id: string; x: number; y: number; w: number; h: number }[];
    widget?: {
      id: string;
      titulo?: string;
      tipo?: string;
      config?: Record<string, unknown>;
    };
  };

  if (body.layout) {
    // Se guardan una por una: son pocas tarjetas y así un fallo parcial
    // no deja la disposición a medio escribir.
    for (const l of body.layout) {
      await supabase
        .from("panel_widget")
        .update({ x: l.x, y: l.y, w: l.w, h: l.h })
        .eq("id", l.id);
    }
  }

  if (body.widget) {
    const cambios: Record<string, unknown> = {};
    if (body.widget.titulo !== undefined) cambios.titulo = body.widget.titulo;
    if (body.widget.tipo !== undefined) cambios.tipo = body.widget.tipo;
    if (body.widget.config !== undefined) cambios.config = body.widget.config;

    const { error } = await supabase
      .from("panel_widget")
      .update(cambios)
      .eq("id", body.widget.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

/** Elimina una tarjeta. */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  }

  const { error } = await supabase.from("panel_widget").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
