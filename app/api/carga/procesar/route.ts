import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { procesaLote, type ConfigCarga } from "@/lib/procesa-carga";

/** Procesa un lote reanudable de una carga perteneciente al usuario. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const { cargaId } = (await request.json()) as { cargaId?: string };
  if (!cargaId) return NextResponse.json({ error: "Falta la carga." }, { status: 400 });

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.tenant_id) {
    return NextResponse.json({ error: "El usuario no tiene espacio de trabajo." }, { status: 400 });
  }

  const { data: carga, error } = await supabase
    .from("carga")
    .select("id,hoja,storage_path,filas_procesadas,estado,config")
    .eq("id", cargaId)
    .eq("tenant_id", perfil.tenant_id)
    .maybeSingle();

  if (error || !carga) {
    return NextResponse.json({ error: error?.message ?? "Carga no encontrada." }, { status: 404 });
  }
  if (!carga.storage_path || !carga.hoja || !carga.config) {
    return NextResponse.json({ error: "La carga no tiene una receta válida." }, { status: 400 });
  }
  if (carga.estado === "procesada") {
    return NextResponse.json({
      procesadas: carga.filas_procesadas ?? 0,
      total: carga.filas_procesadas ?? 0,
      insertadas: 0,
      terminado: true,
    });
  }

  try {
    const config = carga.config as ConfigCarga;
    const resultado = await procesaLote(
      supabase,
      perfil.tenant_id,
      {
        id: carga.id,
        hoja: carga.hoja,
        storage_path: carga.storage_path,
        filas_procesadas: carga.filas_procesadas ?? 0,
        config,
      },
      // Una matriz genera muchas filas al hacer unpivot. Dos mil por vuelta
      // mantiene progreso visible sin descargar el Excel decenas de veces.
      config.modo === "matriz" ? 2_000 : 1_000,
    );
    return NextResponse.json(resultado);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo procesar la carga.";
    await supabase
      .from("carga")
      .update({ estado: "error", error_detalle: mensaje })
      .eq("id", carga.id);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
