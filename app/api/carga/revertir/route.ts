import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Revierte una carga.
 *
 * El borrado ocurre en una sola transacción en la base: antes eran seis
 * llamadas REST, una por tabla, y con decenas de miles de filas crudas
 * eso se pasaba del tiempo límite de la función.
 *
 * Los maestros creados de paso (ejecutivos, productos) NO se borran: si
 * el mismo ejecutivo tiene ventas de otras cargas, borrarlo las dejaría
 * huérfanas. Se limpian desde el mantenedor de ejecutivos.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { cargaId, motivo } = (await request.json()) as {
    cargaId?: string;
    motivo?: string;
  };

  if (!cargaId) {
    return NextResponse.json({ error: "Falta la carga." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("revertir_carga", {
    p_carga_id: cargaId,
    p_motivo: motivo ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
