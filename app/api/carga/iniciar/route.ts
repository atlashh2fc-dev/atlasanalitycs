import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { esFuenteCobertura, validaArchivoContextual, type FuenteCobertura } from "@/lib/fuente-carga";
import { leeHoja } from "@/lib/procesa-carga";

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
    datasetId: string;
    archivo: string;
    hoja: string;
    modo: "tabular" | "matriz";
    filaEncabezado: number;
    metadatos: Record<string, unknown>;
    mapeo: Record<string, string>;
    columnas: Record<string, unknown>[];
    filasTotales: number;
    fuenteEsperada?: FuenteCobertura;
    fechaEsperada?: string;
  };

  if (!body.storagePath || !body.hoja || !body.datasetId) {
    return NextResponse.json({ error: "Faltan datos de la carga." }, { status: 400 });
  }
  if (!body.storagePath.startsWith(`${perfil.tenant_id}/`)) {
    return NextResponse.json({ error: "El archivo no pertenece a esta organización." }, { status: 403 });
  }
  const cargaContextual = body.fuenteEsperada !== undefined || body.fechaEsperada !== undefined;
  if (
    cargaContextual &&
    (!esFuenteCobertura(body.fuenteEsperada) || !/^\d{4}-\d{2}-\d{2}$/.test(body.fechaEsperada ?? ""))
  ) {
    return NextResponse.json({ error: "El contexto de cobertura no es válido." }, { status: 400 });
  }

  const { data: dataset } = await supabase
    .from("dataset")
    .select("id, campana_id")
    .eq("id", body.datasetId)
    .eq("tenant_id", perfil.tenant_id)
    .maybeSingle();
  if (!dataset) {
    return NextResponse.json({ error: "La campaña seleccionada no existe." }, { status: 404 });
  }
  if (!dataset.campana_id) {
    return NextResponse.json(
      { error: "Esta carga debe pertenecer a una campaña." },
      { status: 400 },
    );
  }

  // `campana` sí está protegida por las campañas visibles del perfil.
  // No basta con validar el tenant del dataset: un supervisor no debe poder
  // cargar en otra campaña del mismo espacio adivinando su UUID.
  const { data: campanaVisible } = await supabase
    .from("campana")
    .select("id")
    .eq("id", dataset.campana_id)
    .maybeSingle();
  if (!campanaVisible) {
    return NextResponse.json(
      { error: "No tienes acceso a esta campaña." },
      { status: 403 },
    );
  }

  if (cargaContextual) {
    try {
      const matriz = await leeHoja(supabase, body.storagePath, body.hoja);
      validaArchivoContextual(matriz, {
        modo: body.modo,
        filaEncabezado: body.filaEncabezado,
        mapeo: body.mapeo,
        fuenteEsperada: body.fuenteEsperada!,
        fechaEsperada: body.fechaEsperada!,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "El archivo no corresponde a la cobertura solicitada." },
        { status: 422 },
      );
    }
  }

  const { data: carga, error } = await supabase
    .from("carga")
    .insert({
      tenant_id: perfil.tenant_id,
      dataset_id: body.datasetId,
      campana_id: dataset.campana_id,
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
        campanaId: dataset.campana_id,
        fuenteEsperada: body.fuenteEsperada,
        fechaEsperada: body.fechaEsperada,
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
    const { error: errorColumnas } = await supabase.from("carga_columna").insert(
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
    if (errorColumnas) {
      await supabase.from("carga").delete().eq("id", carga.id);
      return NextResponse.json(
        { error: `No se pudo guardar el perfil de columnas: ${errorColumnas.message}` },
        { status: 500 },
      );
    }

    const { error: errorCampos } = await supabase.rpc("sincronizar_campos_dataset", {
      p_carga: carga.id,
    });
    if (errorCampos) {
      await supabase.from("carga").delete().eq("id", carga.id);
      return NextResponse.json(
        { error: `No se pudo preparar el modelo analítico: ${errorCampos.message}` },
        { status: 500 },
      );
    }

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
