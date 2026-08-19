import { Card, CardTitle } from "@/components/ui/card";
import { Nav } from "@/components/nav";
import {
  DiagnosticoGestion,
  EvolucionEquipo,
  MatrizTransicion,
  TablaMovilidad,
} from "@/components/charts/movilidad";
import { redirect } from "next/navigation";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto, getMovilidad, getPeriodosMovilidad } from "@/lib/datos";
import { GlassSelect } from "@/components/ui/glass-select";
import Link from "next/link";
import { fmt } from "@/lib/utils";

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

  const { filas, transicion, tendencia } = await getMovilidad(campanaId, mes);

  const estancados = filas.filter((f) => f.movimiento === "estable_bajo").length;
  const suben = filas.filter((f) => f.movimiento === "sube").length;
  const bajan = filas.filter((f) => f.movimiento === "baja").length;
  const enRiesgo = bajan + estancados;
  const criticosRecurrentes = filas.filter((f) => f.rachaQ1 >= 2).length;
  const ips = filas.map((f) => f.ipD).filter((n): n is number => n !== null).sort((a, b) => a - b);
  const medianaIpD = mediana(ips);
  const oportunidad = filas.reduce(
    (total, fila) => total + (fila.ipD === null ? 0 : Math.max(0, medianaIpD - fila.ipD) * fila.dg),
    0,
  );
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
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ResumenMovimiento
              titulo="Balance de movilidad"
              valor={`${suben - bajan > 0 ? "+" : ""}${suben - bajan}`}
              detalle={`${suben} suben · ${bajan} bajan. Movimiento neto del mes.`}
            />
            <ResumenMovimiento
              titulo="Oportunidad recuperable"
              valor={`+${fmt.entero(Math.round(oportunidad))}`}
              detalle="Asegurados si la mitad baja llega a la mediana."
            />
            <ResumenMovimiento
              titulo="Críticos recurrentes"
              valor={criticosRecurrentes}
              detalle="Dos o más meses consecutivos en Q1."
              href={enlaceMovimiento("estable_bajo")}
            />
            <ResumenMovimiento
              titulo="Requieren gestión"
              valor={`${enRiesgo}/${filas.length}`}
              detalle="Bajaron o siguen estancados en Q1."
              href={enlaceMovimiento(bajan > estancados ? "baja" : "estable_bajo")}
            />
          </div>
        ) : null}

        <div className="mb-3 grid gap-3 lg:grid-cols-[1.35fr_.8fr_.9fr]">
          <Card>
            <CardTitle hint="La mediana muestra el resultado típico; Q1 y Q3 revelan si la brecha interna mejora o empeora.">
              Evolución del rendimiento
            </CardTitle>
            <EvolucionEquipo datos={tendencia} />
          </Card>

          <Card>
            <CardTitle hint="Sólo analiza a quienes bajan o siguen en Q1; no repite el embudo general de Control.">
              Diagnóstico de gestión
            </CardTitle>
            <DiagnosticoGestion datos={filas} />
          </Card>

          <Card>
            <CardTitle hint="Cuántos ejecutivos pasaron de un cuartil a otro.">
              Matriz de transición
            </CardTitle>
            <MatrizTransicion celdas={transicion} />
          </Card>
        </div>

        <div id="tabla-equipo" className="scroll-mt-20">
          <Card>
            <CardTitle hint={`Prioriza a quienes concentran mayor brecha y muestra la palanca sugerida. Cuartil 4 es el mejor; 1, el más bajo. ${periodoComparado}.`}>
              Plan de gestión por ejecutivo
            </CardTitle>
            <TablaMovilidad datos={filasVisibles} universo={filas} />
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
  valor: number | string;
  detalle: string;
  href?: string;
}) {
  const contenido = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {titulo}
      </p>
      <p className="tabular row-span-2 text-[25px] font-semibold leading-none">{valor}</p>
      <p className="text-[11px] leading-tight text-[var(--text-secondary)]">{detalle}</p>
    </>
  );
  const clase = "grid min-h-[62px] grid-cols-[1fr_auto] items-center rounded-lg border bg-[var(--surface-1)] px-3 py-2 transition-colors";
  return href ? (
    <Link href={href} className={`${clase} hover:border-[var(--border-strong)]`}>{contenido}</Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

function mediana(xs: number[]) {
  if (xs.length === 0) return 0;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}
