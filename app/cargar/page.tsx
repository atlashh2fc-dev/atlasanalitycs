import { Nav } from "@/components/nav";
import { redirect } from "next/navigation";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto } from "@/lib/datos";
import { Card, CardTitle } from "@/components/ui/card";
import { Cargador } from "./cargador";
import { Pendientes, type CargaPendiente } from "./pendientes";
import { createClient } from "@/lib/supabase/server";
import { PrepararEspacio } from "./preparar-espacio";

export const dynamic = "force-dynamic";

export default async function Cargar() {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();

  // El espacio técnico se crea solo: la primera decisión del usuario es
  // su archivo, no campañas, productos ni configuración interna.
  if (!ctx.tenantId) {
    return (
      <>
        <Nav email={ctx.email} />

        <main className="mx-auto max-w-[700px] px-6 py-6">
          <h1 className="mb-6 text-xl font-semibold tracking-tight">Cargar datos</h1>
          <PrepararEspacio nombre={(ctx.email ?? "Mi espacio").split("@")[0] || "Mi espacio"} />
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: filas }, { data: datasets }] = await Promise.all([
    supabase
      .from("carga")
      .select(
        "id, archivo_nombre, hoja, estado, filas_procesadas, filas_totales, error_detalle, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("dataset").select("id,nombre").eq("activo", true).order("updated_at", { ascending: false }),
  ]);

  const cargas: CargaPendiente[] = (filas ?? []).map((c) => ({
    id: c.id,
    archivo: c.archivo_nombre,
    hoja: c.hoja,
    estado: c.estado,
    filasProcesadas: c.filas_procesadas ?? 0,
    filasTotales: c.filas_totales,
    error: c.error_detalle,
    fecha: c.created_at,
  }));

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1100px] px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Cargar datos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-[var(--text-secondary)]">
            Sube cualquier Excel. Atlas perfila las columnas por su contenido
            —no por su nombre—, propone el mapeo y tú lo confirmas una vez. La
            próxima carga con la misma estructura se procesa sola.
          </p>
        </div>

        <Cargador campanas={ctx.campanas} datasets={datasets ?? []} tenantId={ctx.tenantId} />

        <Card className="mt-6">
          <CardTitle hint="El archivo queda guardado y el avance vive en la base: puedes irte de la pantalla y volver a retomar.">
            Cargas registradas
          </CardTitle>
          <Pendientes cargas={cargas} esAdmin={ctx.esAdmin} />
        </Card>
      </main>
    </>
  );
}
