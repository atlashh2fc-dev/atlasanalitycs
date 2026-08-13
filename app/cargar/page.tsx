import { Nav } from "@/components/nav";
import { redirect } from "next/navigation";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto } from "@/lib/datos";
import { Card, CardTitle } from "@/components/ui/card";
import { Semilla } from "../mantenedor/formularios";
import { Cargador } from "./cargador";

export const dynamic = "force-dynamic";

export default async function Cargar() {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();

  // Sin organización no hay dónde guardar los datos. Se resuelve acá
  // mismo en vez de dejar que el usuario perfile un archivo completo y
  // recién al apretar "Cargar" descubra que le falta un paso previo.
  if (!ctx.tenantId) {
    return (
      <>
        <Nav email={ctx.email} />

        <main className="mx-auto max-w-[700px] px-6 py-6">
          <h1 className="text-xl font-semibold tracking-tight">Cargar datos</h1>

          <Card className="mt-6">
            <CardTitle hint="Tu usuario todavía no está asociado a una organización. Es un paso de una sola vez y después no vuelve a aparecer.">
              Primero, crea tu organización
            </CardTitle>
            <Semilla />
            <p className="mt-4 border-t pt-3 text-xs text-[var(--text-muted)]">
              Esto crea la organización, tu perfil de administrador, la campaña
              «Venta Seguros», los cuatro productos y las metas del mes
              (250 Complementario + Catastrófico, 60 Oncológico). Todo editable
              después desde el mantenedor.
            </p>
          </Card>
        </main>
      </>
    );
  }

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

        <Cargador campanas={ctx.campanas} />
      </main>
    </>
  );
}
