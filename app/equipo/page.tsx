import { Card, CardTitle } from "@/components/ui/card";
import { Nav } from "@/components/nav";
import { MatrizTransicion, TablaMovilidad } from "@/components/charts/movilidad";
import { redirect } from "next/navigation";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto, getMovilidad, getPeriodosMovilidad } from "@/lib/datos";
import { GlassSelect } from "@/components/ui/glass-select";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Equipo({
  searchParams,
}: {
  searchParams: Promise<{ campana?: string; mes?: string; movimiento?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const sp = await searchParams;
  const [ctx, periodos] = await Promise.all([getContexto(), getPeriodosMovilidad()]);
  const campanaId = ctx.campanas.some((c) => c.id === sp.campana)
    ? sp.campana!
    : (ctx.campanas[0]?.id ?? null);
  const mes = periodos.some((p) => p.fechaInicio.slice(0, 7) === sp.mes)
    ? sp.mes!
    : (periodos[0]?.fechaInicio.slice(0, 7) ?? null);

  const { filas, transicion } = await getMovilidad(campanaId, mes);

  const estancados = filas.filter((f) => f.movimiento === "estable_bajo").length;
  const suben = filas.filter((f) => f.movimiento === "sube").length;
  const bajan = filas.filter((f) => f.movimiento === "baja").length;
  const movimiento = ["sube", "baja", "estable_bajo"].includes(sp.movimiento ?? "") ? sp.movimiento! : null;
  const filasVisibles = movimiento ? filas.filter((fila) => fila.movimiento === movimiento) : filas;
  const enlaceMovimiento = (valor: string) => `?${new URLSearchParams({
    ...(campanaId ? { campana: campanaId } : {}),
    ...(mes ? { mes } : {}),
    movimiento: valor,
  })}#tabla-equipo`;
  const periodoComparado = filas[0]
    ? `${filas[0].periodoAnterior} → ${filas[0].periodoActual}`
    : "Comparación mensual por datos cargados";

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1400px] px-5 py-3">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="etiqueta">Responsables y evolución</p>
            <h1 className="mt-0.5 text-[20px] font-semibold leading-none tracking-[-0.025em]">
              Equipo
            </h1>
            <p className="mt-1.5 max-w-2xl text-[12px] text-[var(--text-secondary)]">
              El ranking de un mes es ruidoso. Lo que se gestiona es el
              movimiento: quién sube de cuartil, quién retrocede y quién lleva
              varios periodos estancado abajo.
            </p>
          </div>
          <form className="flex flex-wrap items-center gap-2">
            <GlassSelect
              name="mes"
              defaultValue={mes ?? ""}
              ariaLabel="Mes del equipo"
              prefix="Mes"
              options={periodos.map((p) => ({
                value: p.fechaInicio.slice(0, 7),
                label: p.etiqueta,
              }))}
            />
            {ctx.campanas.length > 1 ? (
              <GlassSelect
                name="campana"
                defaultValue={campanaId ?? ""}
                ariaLabel="Campaña del equipo"
                prefix="Campaña"
                options={ctx.campanas.map((c) => ({ value: c.id, label: c.nombre }))}
              />
            ) : campanaId ? (
              <input type="hidden" name="campana" value={campanaId} />
            ) : null}
            <button type="submit" className="min-h-7 rounded-lg bg-[var(--series-1)] px-3 text-[11px] font-semibold text-white">
              Aplicar
            </button>
          </form>
        </div>

        {filas.length > 0 ? (
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <ResumenMovimiento
              titulo="Suben de cuartil"
              valor={suben}
              detalle="El coaching está moviendo la aguja."
              href={enlaceMovimiento("sube")}
            />
            <ResumenMovimiento
              titulo="Bajan de cuartil"
              valor={bajan}
              detalle="Revisar carga de base y acompañamiento."
              href={enlaceMovimiento("baja")}
            />
            <ResumenMovimiento
              titulo="Estancados abajo"
              valor={estancados}
              detalle="La alerta más accionable del sistema."
              href={enlaceMovimiento("estable_bajo")}
            />
          </div>
        ) : null}

        <div id="tabla-equipo" className="grid scroll-mt-20 gap-3 lg:grid-cols-[1.65fr_.75fr]">
          <Card>
            <CardTitle hint={`Cuartil 4 es el mejor desempeño; 1, el más bajo. ${periodoComparado}.`}>
              Movimiento por ejecutivo
            </CardTitle>
            <TablaMovilidad datos={filasVisibles} />
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
  href,
}: {
  titulo: string;
  valor: number;
  detalle: string;
  href: string;
}) {
  return (
    <Link href={href} className="grid min-h-[58px] grid-cols-[1fr_auto] items-center rounded-lg border bg-[var(--surface-1)] px-3 py-2 transition-colors hover:border-[var(--border-strong)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {titulo}
      </p>
      <p className="tabular row-span-2 text-[25px] font-semibold leading-none">{valor}</p>
      <p className="text-[11px] leading-tight text-[var(--text-secondary)]">{detalle}</p>
    </Link>
  );
}
