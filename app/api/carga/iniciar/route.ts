import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Registra una carga cuyo archivo ya está en Storage.
 *
 * No procesa nada: sólo deja la receta guardada (mapeo, modo, fila de
 * encabezado) para que el procesamiento por lotes pueda reanudarse sin
 * volver a preguntarle nada al usuario.
 */
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
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.tenant_id) {
    return NextResponse.json(
      { error: "El usuario no tiene organización." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    storagePath: string;
    archivo: string;
    hoja: string;
    modo: "tabular" | "matriz";
    filaEncabezado: number;
    metadatos: Record<string, unknown>;
    campanaId: string | null;
    mapeo: Record<string, string>;
    columnas: Record<string, unknown>[];
    filasTotales: number;
  };

  if (!body.storagePath || !body.hoja) {
    return NextResponse.json({ error: "Faltan datos de la carga." }, { status: 400 });
  }

  const { data: carga, error } = await supabase
    .from("carga")
    .insert({
      tenant_id: perfil.tenant_id,
      campana_id: body.campanaId,
      archivo_nombre: body.archivo,
      hoja: body.hoja,
      storage_path: body.storagePath,
      modo: body.modo,
      fila_encabezado: body.filaEncabezado + 1,
      metadatos: body.metadatos ?? {},
      filas_totales: body.filasTotales,
      filas_procesadas: 0,
      estado: "mapeada",
      cargado_por: user.id,
      config: {
        mapeo: body.mapeo,
        modo: body.modo,
        filaEncabezado: body.filaEncabezado,
        campanaId: body.campanaId,
      },
    })
    .select("id")
    .single();

  if (error || !carga) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo registrar la carga." },
      { status: 500 },
    );
  }

  if (body.columnas?.length) {
    await supabase.from("carga_columna").insert(
      body.columnas.map((c) => ({
        carga_id: carga.id,
        posicion: c.posicion,
        nombre_original: c.nombreOriginal,
        nombre_normalizado: c.nombreNormalizado,
        tipo_detectado: c.tipo,
        confianza: c.confianza,
        rol_semantico: c.rol,
        cardinalidad: c.cardinalidad,
        nulos: c.nulos,
        filas: c.filas,
        varianza_cero: c.varianzaCero,
        descartada: c.descartada,
        motivo_descarte: c.motivoDescarte,
        muestra: c.muestra,
      })),
    );

    // El mapeo confirmado alimenta el diccionario de sinónimos.
    for (const c of body.columnas) {
      if (!c.rol) continue;
      await supabase.from("sinonimo_columna").upsert(
        {
          tenant_id: perfil.tenant_id,
          nombre_normalizado: c.nombreNormalizado as string,
          rol_semantico: c.rol as string,
          tipo_esperado: c.tipo as string,
        },
        {
          onConflict: "tenant_id,nombre_normalizado,rol_semantico",
          ignoreDuplicates: true,
        },
      );
    }
  }

  return NextResponse.json({ cargaId: carga.id });
}
