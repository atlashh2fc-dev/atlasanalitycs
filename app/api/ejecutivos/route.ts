import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Mantenedor de ejecutivos.
 *
 * Un ejecutivo es una entidad de datos, no un usuario del sistema: casi
 * ninguno entra a la aplicación, pero todos aparecen en los Excel. Se
 * crean solos al cargar, y acá se corrigen, se fusionan cuando el mismo
 * nombre entró escrito de dos formas, y se dan de baja.
 */

async function contexto() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sesión no válida.", status: 401 as const };

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.tenant_id) {
    return { error: "Sin organización.", status: 400 as const };
  }

  return { supabase, tenantId: perfil.tenant_id, esAdmin: perfil.rol === "admin" };
}

/** Alta manual de un ejecutivo que todavía no aparece en ningún archivo. */
export async function POST(request: Request) {
  const ctx = await contexto();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = (await request.json()) as {
    nombre?: string;
    rut?: string;
    jornada?: number;
    campanas?: string[];
  };

  const nombre = body.nombre?.replace(/\s+/g, " ").trim();
  if (!nombre) {
    return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  }

  const { data: ejecutivo, error } = await ctx.supabase
    .from("ejecutivo")
    .insert({
      tenant_id: ctx.tenantId,
      nombre_canonico: nombre,
      rut: body.rut?.trim() || null,
      jornada_horas: body.jornada ?? 42,
    })
    .select("id")
    .single();

  if (error || !ejecutivo) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo crear." },
      { status: 400 },
    );
  }

  // El nombre canónico es también su primer alias: así la próxima carga
  // que lo traiga escrito igual lo reconoce en vez de duplicarlo.
  await ctx.supabase.from("ejecutivo_alias").insert({
    tenant_id: ctx.tenantId,
    ejecutivo_id: ejecutivo.id,
    alias_original: nombre,
    origen: "mantenedor",
    confirmado: true,
  });

  for (const campana_id of body.campanas ?? []) {
    await ctx.supabase
      .from("ejecutivo_campana")
      .insert({ ejecutivo_id: ejecutivo.id, campana_id })
      .select();
  }

  return NextResponse.json({ id: ejecutivo.id });
}

/** Edición: nombre, RUT, jornada, estado y campañas asignadas. */
export async function PATCH(request: Request) {
  const ctx = await contexto();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = (await request.json()) as {
    id?: string;
    nombre?: string;
    rut?: string | null;
    jornada?: number;
    activo?: boolean;
    campanas?: string[];
  };

  if (!body.id) {
    return NextResponse.json({ error: "Falta el ejecutivo." }, { status: 400 });
  }

  const cambios: Record<string, unknown> = {};
  if (body.nombre !== undefined) {
    cambios.nombre_canonico = body.nombre.replace(/\s+/g, " ").trim();
  }
  if (body.rut !== undefined) cambios.rut = body.rut || null;
  if (body.jornada !== undefined) cambios.jornada_horas = body.jornada;
  if (body.activo !== undefined) cambios.activo = body.activo;

  if (Object.keys(cambios).length > 0) {
    const { error } = await ctx.supabase
      .from("ejecutivo")
      .update(cambios)
      .eq("id", body.id)
      .eq("tenant_id", ctx.tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if (Array.isArray(body.campanas)) {
    await ctx.supabase
      .from("ejecutivo_campana")
      .delete()
      .eq("ejecutivo_id", body.id);

    for (const campana_id of body.campanas) {
      await ctx.supabase
        .from("ejecutivo_campana")
        .insert({ ejecutivo_id: body.id, campana_id });
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Baja o fusión.
 *
 * Un ejecutivo con historial no se borra en silencio: eso dejaría
 * ventas huérfanas y rompería el ranking. O se fusiona con otro —el
 * caso real de un mismo nombre escrito de dos formas— o se desactiva
 * conservando su historia.
 */
export async function DELETE(request: Request) {
  const ctx = await contexto();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const destino = searchParams.get("destino");

  if (!id) {
    return NextResponse.json({ error: "Falta el ejecutivo." }, { status: 400 });
  }

  const [ventas, cotizaciones, asistencias, gestiones] = await Promise.all([
    ctx.supabase.from("venta").select("id", { count: "exact", head: true }).eq("ejecutivo_id", id),
    ctx.supabase.from("cotizacion").select("id", { count: "exact", head: true }).eq("ejecutivo_id", id),
    ctx.supabase.from("asistencia").select("id", { count: "exact", head: true }).eq("ejecutivo_id", id),
    ctx.supabase.from("gestion").select("id", { count: "exact", head: true }).eq("ejecutivo_id", id),
  ]);

  const historial =
    (ventas.count ?? 0) +
    (cotizaciones.count ?? 0) +
    (asistencias.count ?? 0) +
    (gestiones.count ?? 0);

  if (historial > 0 && !destino) {
    return NextResponse.json(
      {
        error:
          `Este ejecutivo tiene ${historial} registros asociados. Fusiónalo con otro ` +
          `para conservar la historia, o desactívalo.`,
        historial,
      },
      { status: 409 },
    );
  }

  if (destino) {
    // Toda la historia pasa al destino; los alias también, para que las
    // próximas cargas con el nombre viejo caigan en el ejecutivo bueno.
    await ctx.supabase.from("venta").update({ ejecutivo_id: destino }).eq("ejecutivo_id", id);
    await ctx.supabase.from("cotizacion").update({ ejecutivo_id: destino }).eq("ejecutivo_id", id);
    await ctx.supabase.from("gestion").update({ ejecutivo_id: destino }).eq("ejecutivo_id", id);

    // La asistencia es única por (ejecutivo, fecha): si el destino ya
    // tiene ese día, la marca duplicada se descarta en vez de fallar.
    const { data: marcas } = await ctx.supabase
      .from("asistencia")
      .select("id, fecha")
      .eq("ejecutivo_id", id);

    for (const m of marcas ?? []) {
      const { data: choca } = await ctx.supabase
        .from("asistencia")
        .select("id")
        .eq("ejecutivo_id", destino)
        .eq("fecha", m.fecha)
        .maybeSingle();

      if (choca) {
        await ctx.supabase.from("asistencia").delete().eq("id", m.id);
      } else {
        await ctx.supabase
          .from("asistencia")
          .update({ ejecutivo_id: destino })
          .eq("id", m.id);
      }
    }

    await ctx.supabase
      .from("ejecutivo_alias")
      .update({ ejecutivo_id: destino })
      .eq("ejecutivo_id", id);
  }

  const { error } = await ctx.supabase
    .from("ejecutivo")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fusionado: Boolean(destino) });
}
