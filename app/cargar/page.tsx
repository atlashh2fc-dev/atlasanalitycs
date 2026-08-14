import { Nav } from "@/components/nav";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto } from "@/lib/datos";
import { Card, CardTitle } from "@/components/ui/card";
import { Cargador } from "./cargador";
import { Pendientes, type CargaPendiente } from "./pendientes";
import { createClient } from "@/lib/supabase/server";
import { PrepararEspacio } from "./preparar-espacio";

export const dynamic = "force-dynamic";

export default async function Cargar({
  searchParams,
}: {
  searchParams: Promise<{ campana?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const { campana: campanaSolicitada } = await searchParams;
  const campanaInicial = ctx.campanas.some((c) => c.id === campanaSolicitada)
    ? campanaSolicitada
    : ctx.campanas[0]?.id;

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
        "id, archivo_nombre, hoja, estado, filas_procesadas, filas_totales, error_detalle, created_at, dataset_id, cargado_por",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("dataset")
      .select("id,nombre,campana_id")
      .eq("activo", true)
      .not("campana_id", "is", null)
      .order("updated_at", { ascending: false }),
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
    datasetId: c.dataset_id,
    puedeUsar: ctx.esAdmin || c.cargado_por === ctx.userId,
  }));

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1100px] px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Cargar datos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-[var(--text-secondary)]">
            Sube los archivos diarios de una campaña. Atlas perfila las columnas por su contenido
            —no por su nombre—, propone el mapeo y tú lo confirmas una vez. La
            próxima carga se suma al mismo historial y reutiliza esa estructura.
          </p>
        </div>

        {ctx.campanas.length > 0 ? (
          <Cargador
            campanas={ctx.campanas}
            datasets={datasets ?? []}
            tenantId={ctx.tenantId}
            campanaInicial={campanaInicial}
          />
        ) : (
          <Card>
            <CardTitle hint="Toda carga debe quedar asociada desde el inicio.">
              Primero crea una campaña
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)]">
              La campaña reunirá todos los archivos diarios, su configuración
              y sus indicadores.
            </p>
            <Link
              href="/mantenedor"
              className="mt-4 inline-flex rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white"
            >
              Ir a Configuración
            </Link>
          </Card>
        )}

        <Card className="mt-6">
          <CardTitle hint="El archivo queda guardado y el avance vive en la base: puedes irte de la pantalla y volver a retomar.">
            Cargas registradas
          </CardTitle>
          <Pendientes
            cargas={cargas}
            esAdmin={ctx.esAdmin}
          />
        </Card>
      </main>
    </>
  );
}
