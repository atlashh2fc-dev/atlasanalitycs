import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet, Settings2, Tags, Upload, Users } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto } from "@/lib/datos";
import { fmt } from "@/lib/utils";
import { FormMeta, FormCampana, Semilla } from "./formularios";
import { Ejecutivos, type EjecutivoFila } from "./ejecutivos";
import { Usuarios, type UsuarioFila } from "./usuarios";
import { createAdminClient, usuariosSinPerfil } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** La configuración siempre se abre dentro de una campaña concreta. */
export default async function Mantenedor({
  searchParams,
}: {
  searchParams: Promise<{ campana?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const supabase = await createClient();
  const { campana: campanaSolicitada } = await searchParams;

  if (!ctx.tenantId) {
    return (
      <>
        <Nav email={ctx.email} />
        <main className="mx-auto max-w-[700px] px-6 py-6">
          <h1 className="mb-6 text-xl font-semibold tracking-tight">Mantenedor</h1>
          <Card>
            <CardTitle hint="Tu usuario todavía no está asociado a una organización. Este paso se hace una sola vez.">
              Configuración inicial
            </CardTitle>
            <Semilla />
          </Card>
        </main>
      </>
    );
  }

  const [
    { data: campanasFull },
    { data: ejecutivosRaw },
    { data: metas },
    { data: perfiles },
    { data: cargas },
    { data: ventas },
    { data: cotizaciones },
    { data: asistencias },
  ] = await Promise.all([
    supabase
      .from("campana")
      .select("id, nombre, tipo, descripcion, fecha_inicio, activo")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("ejecutivo")
      .select(
        "id, nombre_canonico, rut, jornada_horas, activo, " +
          "alias:ejecutivo_alias (alias_original), campanas:ejecutivo_campana (campana_id)",
      )
      .order("nombre_canonico"),
    supabase
      .from("meta")
      .select(
        "id, agrupacion_meta, unidad, valor, dg_esperados, periodo_inicio, periodo_fin, campana_id",
      )
      .order("periodo_inicio", { ascending: false })
      .limit(100),
    supabase
      .from("perfil")
      .select("id, nombre, email, rol, activo, campanas:perfil_campana (campana_id)")
      .order("nombre"),
    supabase
      .from("carga")
      .select("campana_id, filas_validas, filas_totales, estado"),
    supabase.from("venta").select("ejecutivo_id"),
    supabase.from("cotizacion").select("ejecutivo_id"),
    supabase.from("asistencia").select("ejecutivo_id"),
  ]);

  const campanas = campanasFull ?? [];
  const seleccionada =
    campanas.find((c) => c.id === campanaSolicitada) ?? campanas[0] ?? null;

  type EjecutivoCrudo = {
    id: string;
    nombre_canonico: string;
    rut: string | null;
    jornada_horas: number | null;
    activo: boolean;
    alias: { alias_original: string }[] | null;
    campanas: { campana_id: string }[] | null;
  };

  const registros = new Map<string, number>();
  for (const lista of [ventas, cotizaciones, asistencias]) {
    for (const registro of lista ?? []) {
      if (registro.ejecutivo_id) {
        registros.set(
          registro.ejecutivo_id,
          (registros.get(registro.ejecutivo_id) ?? 0) + 1,
        );
      }
    }
  }

  const todosEjecutivos: EjecutivoFila[] = (
    (ejecutivosRaw ?? []) as unknown as EjecutivoCrudo[]
  ).map((e) => ({
    id: e.id,
    nombre: e.nombre_canonico,
    rut: e.rut,
    jornada: e.jornada_horas,
    activo: e.activo,
    alias: (e.alias ?? []).map((a) => a.alias_original),
    campanas: (e.campanas ?? []).map((c) => c.campana_id),
    registros: registros.get(e.id) ?? 0,
  }));

  type PerfilCrudo = {
    id: string;
    nombre: string;
    email: string;
    rol: string;
    activo: boolean;
    campanas: { campana_id: string }[] | null;
  };

  const usuarios: UsuarioFila[] = (
    (perfiles ?? []) as unknown as PerfilCrudo[]
  ).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    email: p.email,
    rol: p.rol as "admin" | "supervisor",
    activo: p.activo,
    campanas: (p.campanas ?? []).map((c) => c.campana_id),
  }));

  const admin = ctx.esAdmin ? createAdminClient() : null;
  const huerfanos = admin ? await usuariosSinPerfil(admin) : [];
  const campanaUnica = seleccionada
    ? [{ id: seleccionada.id, nombre: seleccionada.nombre }]
    : [];
  const ejecutivos = seleccionada
    ? todosEjecutivos.filter((e) => e.campanas.includes(seleccionada.id))
    : [];
  const metasCampana = seleccionada
    ? (metas ?? []).filter((m) => m.campana_id === seleccionada.id)
    : [];
  const cargasCampana = seleccionada
    ? (cargas ?? []).filter((c) => c.campana_id === seleccionada.id)
    : [];
  const filas = cargasCampana.reduce(
    (total, carga) => total + (carga.filas_validas ?? carga.filas_totales ?? 0),
    0,
  );
  const supervisores = seleccionada
    ? usuarios.filter(
        (u) => u.rol === "admin" || u.campanas.includes(seleccionada.id),
      ).length
    : 0;

  return (
    <>
      <Nav email={ctx.email} />
      <main className="mx-auto max-w-[1200px] px-6 py-6">
        <p className="etiqueta">Configuración</p>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[27px] font-semibold leading-none tracking-[-0.03em]">
              {seleccionada ? seleccionada.nombre : "Campañas"}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {seleccionada
                ? "Esta configuración afecta sólo a esta campaña: sus cargas, equipo, metas y usuarios."
                : "Crea una campaña para reunir sus cargas, equipo, metas y usuarios."}
            </p>
          </div>
          {seleccionada ? (
            <Link
              href={`/cargar?campana=${seleccionada.id}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white"
            >
              <Upload className="size-4" /> Cargar a esta campaña
            </Link>
          ) : null}
        </div>

        {campanas.length > 1 ? (
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Elegir campaña">
            {campanas.map((campana) => (
              <Link
                key={campana.id}
                href={`/mantenedor?campana=${campana.id}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  campana.id === seleccionada?.id
                    ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_9%,transparent)]"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {campana.nombre}
              </Link>
            ))}
          </nav>
        ) : null}

        {!seleccionada ? (
          <Card className="mt-6">
            <CardTitle hint="La campaña es el contenedor de toda la operación.">
              Crear la primera campaña
            </CardTitle>
            {ctx.esAdmin ? (
              <FormCampana />
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Pídele a un administrador que cree y te asigne una campaña.
              </p>
            )}
          </Card>
        ) : (
          <div className="mt-6 space-y-5">
            <Card>
              <CardTitle hint="Los archivos nuevos se acumulan aquí; no crean otra base ni otra campaña.">
                1 · Campaña y cargas
              </CardTitle>
              <div className="grid gap-3 sm:grid-cols-4">
                <Resumen icono={Tags} etiqueta="Tipo" valor={seleccionada.tipo} />
                <Resumen
                  icono={FileSpreadsheet}
                  etiqueta="Cargas"
                  valor={fmt.entero(cargasCampana.length)}
                />
                <Resumen
                  icono={Settings2}
                  etiqueta="Registros"
                  valor={fmt.entero(filas)}
                />
                <Resumen
                  icono={Users}
                  etiqueta="Usuarios con acceso"
                  valor={fmt.entero(supervisores)}
                />
              </div>
            </Card>

            <Card>
              <CardTitle hint="Sólo se muestran y editan ejecutivos de esta campaña.">
                2 · Ejecutivos de {seleccionada.nombre}
              </CardTitle>
              <Ejecutivos ejecutivos={ejecutivos} campanas={campanaUnica} />
            </Card>

            <Card>
              <CardTitle hint="Las metas y su vigencia pertenecen exclusivamente a esta campaña.">
                3 · Metas de {seleccionada.nombre}
              </CardTitle>
              {ctx.esAdmin ? <FormMeta campanas={campanaUnica} /> : null}
              <table className="mt-4 w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="pb-1.5 font-medium">Agrupación</th>
                    <th className="pb-1.5 text-right font-medium">Meta</th>
                    <th className="pb-1.5 text-right font-medium">DG</th>
                    <th className="pb-1.5 font-medium">Vigencia</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {metasCampana.map((meta) => (
                    <tr key={meta.id} className="border-b last:border-0">
                      <td className="py-1.5">{meta.agrupacion_meta}</td>
                      <td className="py-1.5 text-right">
                        {fmt.entero(Number(meta.valor))} {meta.unidad}
                      </td>
                      <td className="py-1.5 text-right">{meta.dg_esperados}</td>
                      <td className="py-1.5 text-[var(--text-secondary)]">
                        {meta.periodo_inicio} → {meta.periodo_fin}
                      </td>
                    </tr>
                  ))}
                  {metasCampana.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-3 text-[var(--text-muted)]">
                        Sin metas configuradas para esta campaña.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </Card>

            {ctx.esAdmin ? (
              <Card>
                <CardTitle hint="Aquí defines qué supervisores pueden ver esta campaña; los administradores ven todas.">
                  4 · Usuarios de {seleccionada.nombre}
                </CardTitle>
                <Usuarios
                  usuarios={usuarios}
                  campanas={campanaUnica}
                  huerfanos={huerfanos}
                  yo={ctx.userId}
                />
              </Card>
            ) : null}

            {ctx.esAdmin ? (
              <Card>
                <CardTitle hint="Crea otra sólo cuando sea una operación realmente independiente.">
                  Otra campaña
                </CardTitle>
                <FormCampana />
              </Card>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}

function Resumen({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: typeof Tags;
  etiqueta: string;
  valor: string;
}) {
  return (
    <div className="rounded-xl border bg-[var(--surface-0)] p-3">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Icono className="size-3.5" />
        <p className="etiqueta">{etiqueta}</p>
      </div>
      <p className="mt-2 text-sm font-semibold capitalize">{valor}</p>
    </div>
  );
}
