import { Card, CardTitle } from "@/components/ui/card";
import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { getContexto } from "@/lib/datos";
import { fmt } from "@/lib/utils";
import { FormMeta, FormCampana, Semilla } from "./formularios";

export const dynamic = "force-dynamic";

export default async function Mantenedor() {
  const ctx = await getContexto();
  const supabase = await createClient();

  const [{ data: metas }, { data: ejecutivos }, { data: cargas }, { data: productos }] =
    await Promise.all([
      supabase
        .from("meta")
        .select("id, agrupacion_meta, unidad, valor, dg_esperados, periodo_inicio, periodo_fin, campana:campana_id (nombre)")
        .order("periodo_inicio", { ascending: false })
        .limit(20),
      supabase
        .from("ejecutivo")
        .select("id, nombre_canonico, jornada_horas, activo, alias:ejecutivo_alias (alias_original)")
        .order("nombre_canonico"),
      supabase
        .from("carga")
        .select("id, archivo_nombre, hoja, estado, filas_totales, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("producto").select("id, nombre, agrupacion_meta").order("nombre"),
    ]);

  const sinTenant = !ctx.tenantId;

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1200px] px-6 py-6">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Mantenedor</h1>

        {sinTenant ? (
          <Card className="mb-5">
            <CardTitle hint="Tu usuario todavía no está asociado a una organización. Este paso se hace una sola vez.">
              Configuración inicial
            </CardTitle>
            <Semilla />
          </Card>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardTitle hint="Las metas tienen vigencia: al cambiarlas no se reescribe la historia.">
              Metas por campaña
            </CardTitle>

            {ctx.esAdmin && !sinTenant ? (
              <FormMeta campanas={ctx.campanas} />
            ) : null}

            <table className="mt-4 w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="pb-1.5 font-medium">Campaña</th>
                  <th className="pb-1.5 font-medium">Agrupación</th>
                  <th className="pb-1.5 text-right font-medium">Meta</th>
                  <th className="pb-1.5 text-right font-medium">DG</th>
                  <th className="pb-1.5 font-medium">Vigencia</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(metas ?? []).map((m) => {
                  const c = m.campana as unknown as { nombre?: string } | null;
                  return (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-1.5">{c?.nombre ?? "—"}</td>
                      <td className="py-1.5">{m.agrupacion_meta}</td>
                      <td className="py-1.5 text-right">
                        {fmt.entero(Number(m.valor))} {m.unidad}
                      </td>
                      <td className="py-1.5 text-right">{m.dg_esperados}</td>
                      <td className="py-1.5 text-[var(--text-secondary)]">
                        {m.periodo_inicio} → {m.periodo_fin}
                      </td>
                    </tr>
                  );
                })}
                {(metas ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-[var(--text-muted)]">
                      Sin metas cargadas.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardTitle hint="Cada nombre distinto que aparece en un Excel queda como alias del mismo ejecutivo.">
              Ejecutivos y alias
            </CardTitle>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="pb-1.5 font-medium">Ejecutivo</th>
                  <th className="pb-1.5 text-right font-medium">Jornada</th>
                  <th className="pb-1.5 font-medium">Alias detectados</th>
                </tr>
              </thead>
              <tbody>
                {(ejecutivos ?? []).map((e) => {
                  const alias = (e.alias ?? []) as unknown as { alias_original: string }[];
                  return (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-1.5 text-[var(--text-primary)]">
                        {e.nombre_canonico}
                      </td>
                      <td className="tabular py-1.5 text-right">
                        {e.jornada_horas ? `${Number(e.jornada_horas)} h` : "—"}
                      </td>
                      <td className="py-1.5 text-[var(--text-secondary)]">
                        {alias.map((a) => `"${a.alias_original}"`).join(" · ") || "—"}
                      </td>
                    </tr>
                  );
                })}
                {(ejecutivos ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-3 text-[var(--text-muted)]">
                      Se crean solos al cargar el primer Excel con ejecutivos.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardTitle hint="Complementario y Catastrófico comparten meta; Oncológico va aparte.">
              Productos
            </CardTitle>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="pb-1.5 font-medium">Producto</th>
                  <th className="pb-1.5 font-medium">Agrupación de meta</th>
                </tr>
              </thead>
              <tbody>
                {(productos ?? []).map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-1.5">{p.nombre}</td>
                    <td className="py-1.5 text-[var(--text-secondary)]">
                      {p.agrupacion_meta}
                    </td>
                  </tr>
                ))}
                {(productos ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-3 text-[var(--text-muted)]">
                      Se crean solos al cargar ventas.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardTitle hint="Cada carga conserva sus filas crudas y es reversible.">
              Últimas cargas
            </CardTitle>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="pb-1.5 font-medium">Archivo</th>
                  <th className="pb-1.5 font-medium">Hoja</th>
                  <th className="pb-1.5 text-right font-medium">Filas</th>
                  <th className="pb-1.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(cargas ?? []).map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="max-w-[180px] truncate py-1.5">
                      {c.archivo_nombre}
                    </td>
                    <td className="py-1.5 text-[var(--text-secondary)]">{c.hoja}</td>
                    <td className="tabular py-1.5 text-right">
                      {fmt.entero(c.filas_totales)}
                    </td>
                    <td className="py-1.5 text-[var(--text-secondary)]">{c.estado}</td>
                  </tr>
                ))}
                {(cargas ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-[var(--text-muted)]">
                      Sin cargas todavía.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>

          {ctx.esAdmin && !sinTenant ? (
            <Card className="lg:col-span-2">
              <CardTitle>Nueva campaña</CardTitle>
              <FormCampana />
            </Card>
          ) : null}
        </div>
      </main>
    </>
  );
}
