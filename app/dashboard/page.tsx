import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Stat, estadoPorCumplimiento } from "@/components/ui/stat";
import { GraficoCumplimiento } from "@/components/charts/cumplimiento";
import { GraficoCuadrantes } from "@/components/charts/cuadrantes";
import { GraficoRanking } from "@/components/charts/ranking";
import { Nav } from "@/components/nav";
import { getContexto, getResumenVentas, rangoMes } from "@/lib/datos";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ campana?: string; mes?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContexto();

  const base = sp.mes ? new Date(`${sp.mes}-15T12:00:00`) : new Date();
  const rango = rangoMes(base);
  const campanaId = sp.campana ?? ctx.campanas[0]?.id ?? null;

  const r = await getResumenVentas(campanaId, rango);

  const totalMeta = r.cumplimiento.reduce((a, c) => a + c.meta, 0);
  const cumplimientoGlobal = totalMeta > 0 ? r.totales.asegurados / totalMeta : null;

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Gestión de ventas
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {rango.desde} al {rango.hasta}
            </p>
          </div>

          <form className="flex items-end gap-3">
            <label className="text-xs text-[var(--text-secondary)]">
              <span className="mb-1 block font-medium">Campaña</span>
              <select
                name="campana"
                defaultValue={campanaId ?? ""}
                className="rounded-md border bg-[var(--surface-2)] px-2.5 py-1.5 text-sm"
              >
                {ctx.campanas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--text-secondary)]">
              <span className="mb-1 block font-medium">Mes</span>
              <input
                type="month"
                name="mes"
                defaultValue={rango.desde.slice(0, 7)}
                className="rounded-md border bg-[var(--surface-2)] px-2.5 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border bg-[var(--surface-2)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-0)]"
            >
              Aplicar
            </button>
          </form>
        </div>

        {!r.hayDatos ? (
          <Card className="mb-6">
            <p className="text-sm text-[var(--text-secondary)]">
              Todavía no hay datos para este periodo.{" "}
              <Link href="/cargar" className="font-medium text-[var(--series-1)] underline">
                Carga un Excel
              </Link>{" "}
              y los indicadores se generan solos.
            </p>
          </Card>
        ) : null}

        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Asegurados"
            valor={fmt.entero(r.totales.asegurados)}
            sub={totalMeta > 0 ? `de ${fmt.entero(totalMeta)} de meta` : undefined}
            estado={estadoPorCumplimiento(cumplimientoGlobal)}
            mostrarEstado
          />
          <Stat
            label="Contratos"
            valor={fmt.entero(r.totales.contratos)}
            sub={
              r.totales.profundidad
                ? `${fmt.decimal(r.totales.profundidad)} asegurados por contrato`
                : undefined
            }
          />
          <Stat
            label="Tasa de cierre"
            valor={fmt.pct(r.totales.tasaCierre)}
            sub={`${fmt.entero(r.totales.cotizaciones)} cotizaciones`}
          />
          <Stat
            label="UF vendida"
            valor={fmt.decimal(r.totales.uf)}
            sub={
              r.totales.asegurados > 0
                ? `${fmt.decimal(r.totales.uf / r.totales.asegurados, 3)} UF por asegurado`
                : undefined
            }
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardTitle hint="El consolidado esconde el problema: una línea sobre ritmo puede tapar el atraso de la otra.">
              Cumplimiento por línea de meta
            </CardTitle>
            <GraficoCumplimiento datos={r.cumplimiento} />
          </Card>

          <Card>
            <CardTitle hint="Ritmo contra efectividad. Separa a quien gestiona poco de quien gestiona mucho y cierra mal.">
              Matriz de diagnóstico por ejecutivo
            </CardTitle>
            <GraficoCuadrantes datos={r.ejecutivos} />
          </Card>

          <Card className="lg:col-span-2">
            <CardTitle
              hint={
                r.brechaOportunidad > 0
                  ? `Brecha de oportunidad: ${fmt.entero(Math.round(r.brechaOportunidad))} asegurados si quienes están bajo la mediana la alcanzaran.`
                  : undefined
              }
            >
              Ranking y dispersión del equipo
            </CardTitle>
            <GraficoRanking datos={r.ranking} mediana={r.medianaAsegurados} />
            {r.coefVariacion !== null ? (
              <p className="mt-3 border-t pt-3 text-xs text-[var(--text-secondary)]">
                Coeficiente de variación del IP-D:{" "}
                <span className="tabular font-medium">
                  {fmt.decimal(r.coefVariacion)}
                </span>
                {r.coefVariacion > 0.5
                  ? " — dispersión alta. El equipo rinde muy disparejo y ahí está la ganancia disponible."
                  : " — dispersión contenida."}
              </p>
            ) : null}
          </Card>
        </div>
      </main>
    </>
  );
}
