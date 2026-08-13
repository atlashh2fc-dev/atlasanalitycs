import { Card, CardTitle } from "@/components/ui/card";
import { Nav } from "@/components/nav";
import { MatrizTransicion, TablaMovilidad } from "@/components/charts/movilidad";
import { redirect } from "next/navigation";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto, getMovilidad } from "@/lib/datos";
import { RecalcularPeriodo } from "./recalcular";

export const dynamic = "force-dynamic";

export default async function Equipo({
  searchParams,
}: {
  searchParams: Promise<{ campana?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const sp = await searchParams;
  const ctx = await getContexto();
  const campanaId = sp.campana || null;

  const { filas, transicion } = await getMovilidad(campanaId);

  const estancados = filas.filter((f) => f.movimiento === "estable_bajo").length;
  const suben = filas.filter((f) => f.movimiento === "sube").length;
  const bajan = filas.filter((f) => f.movimiento === "baja").length;

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Movilidad del equipo
            </h1>
            <p className="mt-0.5 max-w-2xl text-sm text-[var(--text-secondary)]">
              El ranking de un mes es ruidoso. Lo que se gestiona es el
              movimiento: quién sube de cuartil, quién retrocede y quién lleva
              varios periodos estancado abajo.
            </p>
          </div>
          {ctx.esAdmin ? <RecalcularPeriodo /> : null}
        </div>

        {filas.length > 0 ? (
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <ResumenMovimiento
              titulo="Suben de cuartil"
              valor={suben}
              detalle="El coaching está moviendo la aguja."
            />
            <ResumenMovimiento
              titulo="Bajan de cuartil"
              valor={bajan}
              detalle="Revisar carga de base y acompañamiento."
            />
            <ResumenMovimiento
              titulo="Estancados abajo"
              valor={estancados}
              detalle="La alerta más accionable del sistema."
            />
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardTitle hint="Cuartil 4 es el mejor desempeño; 1, el más bajo.">
              Movimiento por ejecutivo
            </CardTitle>
            <TablaMovilidad datos={filas} />
          </Card>

          <Card>
            <CardTitle hint="Cuántos ejecutivos pasaron de un cuartil a otro.">
              Matriz de transición
            </CardTitle>
            <MatrizTransicion celdas={transicion} />
          </Card>
        </div>
      </main>
    </>
  );
}

function ResumenMovimiento({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: number;
  detalle: string;
}) {
  return (
    <div className="rounded-lg border bg-[var(--surface-2)] p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {titulo}
      </p>
      <p className="tabular mt-2 text-3xl font-semibold leading-none">{valor}</p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{detalle}</p>
    </div>
  );
}
