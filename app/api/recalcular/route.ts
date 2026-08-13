import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const { mes } = (await request.json()) as { mes?: string };
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.tenant_id) {
    return NextResponse.json(
      { error: "El usuario no tiene un tenant asignado." },
      { status: 400 },
    );
  }

  const [anio, m] = mes.split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, m - 1, 1));
  const fin = new Date(Date.UTC(anio, m, 0));
  const etiqueta = inicio.toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // El periodo es único por (tenant, tipo, fecha_inicio): recalcular el
  // mismo mes actualiza el snapshot en vez de duplicarlo.
  const { data: periodo, error: errPeriodo } = await supabase
    .from("periodo")
    .upsert(
      {
        tenant_id: perfil.tenant_id,
        tipo: "mes",
        fecha_inicio: inicio.toISOString().slice(0, 10),
        fecha_fin: fin.toISOString().slice(0, 10),
        etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1),
      },
      { onConflict: "tenant_id,tipo,fecha_inicio" },
    )
    .select("id")
    .single();

  if (errPeriodo || !periodo) {
    return NextResponse.json(
      { error: errPeriodo?.message ?? "No se pudo crear el periodo." },
      { status: 500 },
    );
  }

  const { data: filas, error } = await supabase.rpc("calcular_kpi_periodo", {
    p_periodo_id: periodo.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ filas, periodo: periodo.id });
}
