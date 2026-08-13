import { redirect } from "next/navigation";
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

/**
 * El mantenedor sigue el orden real del negocio: primero la campaña,
 * después quién trabaja en ella, después qué se le mide y con qué meta.
 */
export default async function Mantenedor() {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const supabase = await createClient();
  const sinTenant = !ctx.tenantId;

  if (sinTenant) {
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
    { data: productos },
    { data: perfiles },
  ] = await Promise.all([
    supabase
      .from("campana")
      .select("id, nombre, tipo, fecha_inicio, activo")
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
      .limit(30),
    supabase.from("producto").select("id, nombre, agrupacion_meta").order("nombre"),
    supabase
      .from("perfil")
      .select("id, nombre, email, rol, activo, campanas:perfil_campana (campana_id)")
      .order("nombre"),
  ]);

  // Cuántos registros tiene cada ejecutivo: define si se puede eliminar
  // sin dejar datos huérfanos.
  const [{ data: ventas }, { data: cotizaciones }, { data: asistencias }] =
    await Promise.all([
      supabase.from("venta").select("ejecutivo_id"),
      supabase.from("cotizacion").select("ejecutivo_id"),
      supabase.from("asistencia").select("ejecutivo_id"),
    ]);

  const registros = new Map<string, number>();
  for (const lista of [ventas, cotizaciones, asistencias]) {
    for (const r of lista ?? []) {
      if (r.ejecutivo_id) {
        registros.set(r.ejecutivo_id, (registros.get(r.ejecutivo_id) ?? 0) + 1);
      }
    }
  }

  // El select con dos relaciones anidadas hace que el tipo inferido de
  // Supabase se ensucie; se afirma la forma real una sola vez.
  type EjecutivoCrudo = {
    id: string;
    nombre_canonico: string;
    rut: string | null;
    jornada_horas: number | null;
    activo: boolean;
    alias: { alias_original: string }[] | null;
    campanas: { campana_id: string }[] | null;
  };

  const ejecutivos: EjecutivoFila[] = (
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

  const nombreCampana = new Map(
    (campanasFull ?? []).map((c) => [c.id, c.nombre as string]),
  );
  const tienePackGestion =
    (campanasFull?.length ?? 0) > 0 ||
    ejecutivos.length > 0 ||
    (metas?.length ?? 0) > 0 ||
    (productos?.length ?? 0) > 0;

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1200px] px-6 py-6">
        <p className="etiqueta">Configuración</p>
        <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">Tu espacio</h1>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">
          Administra accesos y las funciones especializadas que Atlas haya
          detectado en tus bases.
        </p>

        <div className="space-y-5">
          {!tienePackGestion ? (
            <Card>
              <CardTitle hint="Los campos, reglas de calidad e historial se administran dentro de cada base.">
                Configuración adaptada a tus datos
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)]">
                No detectamos campañas, productos ni equipos, por lo que esas
                opciones no se muestran. Si una futura carga los contiene,
                Atlas habilitará sus controles automáticamente.
              </p>
            </Card>
          ) : null}

          {tienePackGestion ? <>
          {/* 1 · Campañas */}
          <Card>
            <CardTitle hint="Todo cuelga de acá: ejecutivos, metas, cargas y permisos de los supervisores.">
              1 · Campañas
            </CardTitle>

            <table className="mb-4 w-full text-xs">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="pb-1.5 font-medium">Campaña</th>
                  <th className="pb-1.5 font-medium">Tipo</th>
                  <th className="pb-1.5 text-right font-medium">Ejecutivos</th>
                  <th className="pb-1.5 text-right font-medium">Metas</th>
                  <th className="pb-1.5 font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {(campanasFull ?? []).map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-1.5 font-medium text-[var(--text-primary)]">
                      {c.nombre}
                    </td>
                    <td className="py-1.5 text-[var(--text-secondary)]">{c.tipo}</td>
                    <td className="tabular py-1.5 text-right">
                      {ejecutivos.filter((e) => e.campanas.includes(c.id)).length}
                    </td>
                    <td className="tabular py-1.5 text-right">
                      {(metas ?? []).filter((m) => m.campana_id === c.id).length}
                    </td>
                    <td className="py-1.5 text-[var(--text-secondary)]">
                      {c.fecha_inicio ?? "—"}
                    </td>
                  </tr>
                ))}
                {(campanasFull ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-[var(--text-muted)]">
                      Sin campañas todavía.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            {ctx.esAdmin ? <FormCampana /> : null}
          </Card>

          {/* 2 · Ejecutivos */}
          <Card>
            <CardTitle hint="Los ejecutivos aparecen en los Excel; casi ninguno entra a la aplicación. Se crean solos al cargar y acá se corrigen.">
              2 · Ejecutivos por campaña
            </CardTitle>
            <Ejecutivos ejecutivos={ejecutivos} campanas={ctx.campanas} />
          </Card>

          {/* 3 · Metas */}
          <Card>
            <CardTitle hint="Las metas tienen vigencia: al cambiarlas no se reescribe la historia de los periodos ya cerrados.">
              3 · Metas por campaña
            </CardTitle>

            {ctx.esAdmin ? <FormMeta campanas={ctx.campanas} /> : null}

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
                {(metas ?? []).map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-1.5">
                      {nombreCampana.get(m.campana_id) ?? "—"}
                    </td>
                    <td className="py-1.5">{m.agrupacion_meta}</td>
                    <td className="py-1.5 text-right">
                      {fmt.entero(Number(m.valor))} {m.unidad}
                    </td>
                    <td className="py-1.5 text-right">{m.dg_esperados}</td>
                    <td className="py-1.5 text-[var(--text-secondary)]">
                      {m.periodo_inicio} → {m.periodo_fin}
                    </td>
                  </tr>
                ))}
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

          {/* 4 · Productos */}
          <Card>
            <CardTitle hint="La agrupación define contra qué meta compite cada producto. Complementario y Catastrófico comparten; Oncológico va aparte.">
              4 · Productos
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
          </> : null}

          {/* 5 · Usuarios */}
          {ctx.esAdmin ? (
            <Card>
              <CardTitle hint="Quienes entran a la aplicación. Un supervisor sólo ve las campañas que le asignes.">
                5 · Usuarios y accesos
              </CardTitle>
              <Usuarios
                usuarios={usuarios}
                campanas={ctx.campanas}
                huerfanos={huerfanos}
                yo={ctx.userId}
              />
            </Card>
          ) : null}
        </div>
      </main>
    </>
  );
}
