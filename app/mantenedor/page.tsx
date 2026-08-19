import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Database, FileSpreadsheet, Settings2, Tags, Upload, Users } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto } from "@/lib/datos";
import { fmt } from "@/lib/utils";
import { FormMeta, FormCampana, Semilla } from "./formularios";
import { Ejecutivos, type EjecutivoFila } from "./ejecutivos";
import { Usuarios, type UsuarioFila } from "./usuarios";
import {
  Economia,
  type FilaComision,
  type FilaCosto,
  type FilaRemuneracion,
  type FilaTarifa,
} from "./economia";
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
          <h1 className="mb-6 text-xl font-semibold tracking-tight">Administración</h1>
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

  // Parámetros económicos. Sólo los ve administración: las políticas de
  // la base devuelven vacío para un supervisor, y la sección no se
  // renderiza.
  const [
    { data: tarifas },
    { data: comisiones },
    { data: remuneraciones },
    { data: costos },
  ] = await Promise.all([
      supabase
        .from("tarifa")
        .select(
          "id, agrupacion_meta, criterio, alcance, desde, hasta, valor_uf, vigencia_desde, notas",
        )
        .order("agrupacion_meta")
        .order("desde"),
      supabase
        .from("comision")
        .select(
          "id, agrupacion_meta, tipo, base, desde, hasta, monto_clp, acumulable, notas",
        )
        .is("vigencia_hasta", null)
        .order("agrupacion_meta")
        .order("tipo")
        .order("desde"),
      supabase
        .from("remuneracion")
        .select(
          "id, ejecutivo_id, sueldo_base_clp, comision_asegurado_clp, factor_leyes, factor_semana_corrida, vigencia_desde",
        )
        .is("vigencia_hasta", null),
      supabase
        .from("costo_operacion")
        .select("id, concepto, base, monto_clp, vigencia_desde")
        .is("vigencia_hasta", null)
        .order("concepto"),
    ]);

  const admin = ctx.esAdmin ? createAdminClient() : null;
  const huerfanos = admin ? await usuariosSinPerfil(admin) : [];
  const campanaUnica = seleccionada
    ? [{ id: seleccionada.id, nombre: seleccionada.nombre }]
    : [];
  const ejecutivos = seleccionada
    ? todosEjecutivos.filter((e) => e.campanas.includes(seleccionada.id))
    : [];
  // Una fila por ejecutivo activo, tenga o no remuneración cargada: la
  // tabla vacía no comunica que falta llenarla.
  const porEjecutivo = new Map(
    (remuneraciones ?? []).map((r) => [r.ejecutivo_id as string, r]),
  );

  const filasRemuneracion: FilaRemuneracion[] = ejecutivos
    .filter((e) => e.activo)
    .map((e) => {
      const r = porEjecutivo.get(e.id);
      return {
        id: (r?.id as string) ?? null,
        ejecutivo_id: e.id,
        ejecutivo: e.nombre,
        sueldo_base_clp: Number(r?.sueldo_base_clp ?? 0),
        comision_asegurado_clp: Number(r?.comision_asegurado_clp ?? 0),
        factor_leyes: Number(r?.factor_leyes ?? 1.2),
        factor_semana_corrida: Number(r?.factor_semana_corrida ?? 0.2),
        vigencia_desde: (r?.vigencia_desde as string) ?? "",
      };
    });

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
      <main className="mx-auto max-w-[1320px] px-6 py-6">
        <p className="etiqueta">Administración del negocio</p>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[27px] font-semibold leading-none tracking-[-0.03em]">
              {seleccionada ? seleccionada.nombre : "Campañas"}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {seleccionada
                ? "Define equipo, metas, economía y accesos. Las cargas y su calidad se controlan en Datos."
                : "Crea una campaña para definir su equipo, metas, economía y usuarios."}
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
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-medium text-[var(--text-muted)]">CAMPAÑA QUE ESTÁS ADMINISTRANDO</p>
            <nav className="flex flex-wrap gap-2" aria-label="Elegir campaña">
              {campanas.map((campana) => (
                <Link
                  key={campana.id}
                  href={`/administracion?campana=${campana.id}`}
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
          </div>
        ) : null}

        {seleccionada ? (
          <section className="mt-5 rounded-2xl border border-[color-mix(in_srgb,var(--series-1)_35%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--series-1)_7%,var(--surface-0))] p-4">
            <div className="flex flex-wrap items-start gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--series-1)_16%,transparent)] text-[var(--series-1)]"><Tags className="size-5" /></span>
              <div className="min-w-[240px] flex-1">
                <h2 className="text-sm font-semibold">Todo lo de esta pantalla afecta sólo a {seleccionada.nombre}</h2>
                <div className="mt-2 grid gap-2 text-[11px] leading-relaxed text-[var(--text-secondary)] md:grid-cols-2">
                  <p><strong>Agregar datos</strong> acumula registros en esta campaña y actualiza Control y Análisis.</p>
                  <p><strong>Cambiar reglas</strong> modifica cómo se calculan metas, costos, margen y quién puede verlos; no modifica los archivos cargados.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/datos`} className="pildora text-xs"><Database className="size-3.5" /> Ver datos</Link>
                <Link href={`/bsc?campana=${seleccionada.id}`} className="pildora text-xs"><BarChart3 className="size-3.5" /> Ver impacto en Control</Link>
              </div>
            </div>
          </section>
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
              <CardTitle hint="Confirma que estás trabajando en el contenedor correcto antes de cargar o cambiar parámetros." impacto="alcance de todos los datos y reglas">
                1 · Resumen de la campaña
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
              <CardTitle hint="Asigna aquí las personas que participan y su jornada. No carga sus resultados: esos llegan desde Datos." impacto="metas individuales, productividad y costos">
                2 · Ejecutivos de {seleccionada.nombre}
              </CardTitle>
              <Ejecutivos ejecutivos={ejecutivos} campanas={campanaUnica} />
            </Card>

            <Card>
              <CardTitle hint="Define el objetivo y su vigencia. Las ventas reales no cambian; cambia la referencia contra la que se evalúan." impacto="cumplimiento, ideal y forecast">
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
                <CardTitle hint="Configura tarifas, comisiones, remuneraciones y costos. No modifica ventas; les asigna valor económico." impacto="ingreso, costo, margen y equilibrio">
                  4 · Economía de {seleccionada.nombre}
                </CardTitle>
                <Economia
                  tarifas={(tarifas ?? []) as unknown as FilaTarifa[]}
                  comisiones={(comisiones ?? []) as unknown as FilaComision[]}
                  remuneraciones={filasRemuneracion}
                  costos={(costos ?? []) as unknown as FilaCosto[]}
                  campanaId={seleccionada.id}
                />
              </Card>
            ) : null}

            {ctx.esAdmin ? (
              <Card>
                <CardTitle hint="Define quién puede entrar a esta campaña. Los administradores conservan visibilidad total." impacto="acceso y visibilidad, no KPI">
                  5 · Usuarios de {seleccionada.nombre}
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
                <CardTitle hint="Crea otra sólo cuando los datos, equipo, metas y economía no deban mezclarse con esta operación." impacto="crea un contenedor independiente">
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
