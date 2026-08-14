import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Database,
  Hash,
  Rows3,
  Settings2,
  Tags,
  Upload,
  Users,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Card } from "@/components/ui/card";
import { getContexto } from "@/lib/datos";
import { hayCredenciales } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Columna = {
  id: string;
  nombre_original: string | null;
  nombre_normalizado: string | null;
  tipo_detectado: string;
  confianza: number | null;
  rol_semantico: string | null;
  cardinalidad: number | null;
  nulos: number | null;
  filas: number | null;
  descartada: boolean;
  motivo_descarte: string | null;
};

const numero = new Intl.NumberFormat("es-CL");
const fecha = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function DetalleDataset({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const { id } = await params;
  const ctx = await getContexto();
  const supabase = await createClient();
  const { data: dataset } = await supabase
    .from("dataset")
    .select(
      "id, nombre, descripcion, activo, campana_id, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!dataset) notFound();

  const { data: cargas } = await supabase
    .from("carga")
    .select(
      "id, archivo_nombre, hoja, estado, filas_totales, filas_validas, filas_rechazadas, periodo_inicio, periodo_fin, created_at",
    )
    .eq("dataset_id", id)
    .order("created_at", { ascending: false });

  const ultima = cargas?.[0] ?? null;
  const { data: columnasRaw } = ultima
    ? await supabase
        .from("carga_columna")
        .select(
          "id, nombre_original, nombre_normalizado, tipo_detectado, confianza, rol_semantico, cardinalidad, nulos, filas, descartada, motivo_descarte",
        )
        .eq("carga_id", ultima.id)
        .order("posicion")
    : { data: [] as Columna[] };

  const columnas = (columnasRaw ?? []) as Columna[];
  const activas = columnas.filter((columna) => !columna.descartada);
  const roles = new Set(
    activas.map((columna) => columna.rol_semantico).filter(Boolean),
  );
  const tieneEquipo = [
    "ejecutivo",
    "equipo",
    "vendedor",
    "responsable",
    "agente",
  ].some((rol) => roles.has(rol));
  const tieneMetas =
    tieneEquipo &&
    activas.some((columna) =>
      ["entero", "decimal", "monto", "uf"].includes(columna.tipo_detectado),
    );
  const nulos = activas.reduce(
    (total, columna) => total + (columna.nulos ?? 0),
    0,
  );
  const celdas = activas.reduce(
    (total, columna) => total + (columna.filas ?? 0),
    0,
  );
  const completitud =
    celdas > 0 ? Math.max(0, Math.round((1 - nulos / celdas) * 100)) : null;

  return (
    <>
      <Nav email={ctx.email} />
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <Link
          href="/datos"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="size-3.5" /> Todas las campañas
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--series-1)_14%,transparent)] text-[var(--series-1)]">
              <Database className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[27px] font-semibold leading-none tracking-[-0.03em]">
                  {dataset.nombre}
                </h1>
                <span className="rounded-full border px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                  {dataset.activo ? "Activa" : "Inactiva"}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
                {dataset.descripcion ||
                  "Estructura, calidad e historial de esta base."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/analisis?dataset=${id}`}
              className="inline-flex items-center gap-2 rounded-full border bg-[var(--vidrio)] px-4 py-2 text-sm font-medium"
            >
              <BarChart3 className="size-4" /> Ver análisis
            </Link>
            <Link
              href={`/cargar?campana=${dataset.campana_id ?? ""}`}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white"
            >
              <Upload className="size-4" /> Nueva carga
            </Link>
          </div>
        </div>

        <nav className="mt-7 flex gap-1 overflow-x-auto border-b pb-2 text-xs">
          {[
            ["#resumen", "Resumen"],
            ["#campos", "Campos"],
            ["#calidad", "Calidad"],
            ["#historial", "Historial"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="shrink-0 rounded-full px-3 py-1.5 font-medium text-[var(--text-secondary)] hover:bg-[var(--vidrio)] hover:text-[var(--text-primary)]"
            >
              {label}
            </a>
          ))}
          {tieneEquipo ? (
            <Link
              href="/equipo"
              className="shrink-0 rounded-full px-3 py-1.5 font-medium text-[var(--text-secondary)] hover:bg-[var(--vidrio)] hover:text-[var(--text-primary)]"
            >
              Equipo
            </Link>
          ) : null}
          {tieneMetas ? (
            <Link
              href={`/mantenedor?campana=${dataset.campana_id ?? ""}`}
              className="shrink-0 rounded-full px-3 py-1.5 font-medium text-[var(--text-secondary)] hover:bg-[var(--vidrio)] hover:text-[var(--text-primary)]"
            >
              Metas
            </Link>
          ) : null}
        </nav>

        {ultima ? (
          <>
            <section id="resumen" className="scroll-mt-24 pt-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Indicador
                  icono={Rows3}
                  etiqueta="Registros"
                  valor={numero.format(
                    ultima.filas_validas ?? ultima.filas_totales ?? 0,
                  )}
                />
                <Indicador
                  icono={Hash}
                  etiqueta="Campos útiles"
                  valor={String(activas.length)}
                />
                <Indicador
                  icono={CheckCircle2}
                  etiqueta="Completitud"
                  valor={completitud === null ? "—" : `${completitud}%`}
                />
                <Indicador
                  icono={CalendarDays}
                  etiqueta="Última actualización"
                  valor={fecha.format(new Date(ultima.created_at))}
                  pequeno
                />
              </div>

              {tieneEquipo || tieneMetas ? (
                <Card className="mt-4">
                  <p className="etiqueta">Funciones detectadas</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {tieneEquipo ? (
                      <Contexto
                        icono={Users}
                        titulo="Equipo"
                        detalle="Hay una persona responsable o agrupación de equipo en los datos."
                        href="/equipo"
                      />
                    ) : null}
                    {tieneMetas ? (
                      <Contexto
                        icono={Settings2}
                        titulo="Metas"
                        detalle="Hay métricas numéricas atribuibles al equipo."
                        href={`/mantenedor?campana=${dataset.campana_id ?? ""}`}
                      />
                    ) : null}
                  </div>
                </Card>
              ) : null}
            </section>

            <section id="campos" className="scroll-mt-24 pt-8">
              <h2 className="text-base font-semibold">Campos interpretados</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Atlas usa el contenido de la columna y conserva su nombre
                original.
              </p>
              <Card className="mt-3 overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-xs">
                    <thead>
                      <tr className="border-b text-left text-[var(--text-muted)]">
                        <th className="p-3 font-medium">Campo</th>
                        <th className="p-3 font-medium">Interpretación</th>
                        <th className="p-3 font-medium">Tipo</th>
                        <th className="p-3 text-right font-medium">
                          Valores distintos
                        </th>
                        <th className="p-3 text-right font-medium">
                          Confianza
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {columnas.map((columna) => (
                        <tr
                          key={columna.id}
                          className={`border-b last:border-0 ${columna.descartada ? "opacity-45" : ""}`}
                        >
                          <td className="p-3 font-medium">
                            {columna.nombre_original ||
                              columna.nombre_normalizado ||
                              "Sin nombre"}
                          </td>
                          <td className="p-3 text-[var(--text-secondary)]">
                            {columna.descartada
                              ? columna.motivo_descarte || "No se usará"
                              : columna.rol_semantico || "Campo general"}
                          </td>
                          <td className="p-3">
                            <span className="rounded-full border px-2 py-0.5">
                              {columna.tipo_detectado}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular">
                            {numero.format(columna.cardinalidad ?? 0)}
                          </td>
                          <td className="p-3 text-right tabular">
                            {Math.round(Number(columna.confianza ?? 0) * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {columnas.length === 0 ? (
                    <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                      Esta carga todavía no tiene un perfil de campos
                      disponible.
                    </p>
                  ) : null}
                </div>
              </Card>
            </section>

            <section id="calidad" className="scroll-mt-24 pt-8">
              <h2 className="text-base font-semibold">Calidad de datos</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Calidad
                  estado="ok"
                  titulo={`${completitud ?? "—"}% de completitud`}
                  detalle={`${numero.format(nulos)} celdas vacías en campos útiles`}
                />
                <Calidad
                  estado={
                    Number(ultima.filas_rechazadas ?? 0) > 0 ? "alerta" : "ok"
                  }
                  titulo={`${numero.format(ultima.filas_rechazadas ?? 0)} filas rechazadas`}
                  detalle="Filas que necesitan revisión antes de analizar"
                />
                <Calidad
                  estado={columnas.some((c) => c.descartada) ? "alerta" : "ok"}
                  titulo={`${columnas.filter((c) => c.descartada).length} campos ignorados`}
                  detalle="Vacíos, constantes o sin información útil"
                />
              </div>
            </section>

            <section id="historial" className="scroll-mt-24 pt-8">
              <h2 className="text-base font-semibold">Historial de cargas</h2>
              <Card className="mt-3 p-0">
                {(cargas ?? []).map((carga) => (
                  <div
                    key={carga.id}
                    className="flex flex-wrap items-center gap-3 border-b p-4 text-xs last:border-0"
                  >
                    <span className="grid size-8 place-items-center rounded-lg bg-[var(--surface-0)]">
                      <Upload className="size-3.5" />
                    </span>
                    <div>
                      <p className="font-medium">{carga.archivo_nombre}</p>
                      <p className="mt-0.5 text-[var(--text-muted)]">
                        {carga.hoja || "Hoja principal"} ·{" "}
                        {fecha.format(new Date(carga.created_at))}
                      </p>
                    </div>
                    <span className="ml-auto tabular text-[var(--text-secondary)]">
                      {numero.format(
                        carga.filas_validas ?? carga.filas_totales ?? 0,
                      )}{" "}
                      filas
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                      {carga.estado}
                    </span>
                  </div>
                ))}
              </Card>
            </section>
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed p-8 text-center">
            <Database className="mx-auto size-6 text-[var(--text-muted)]" />
            <h2 className="mt-3 text-sm font-semibold">
              Esta base todavía no tiene cargas
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Carga el primer archivo para detectar campos y crear su análisis.
            </p>
            <Link
              href="/cargar"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white"
            >
              <Upload className="size-4" /> Cargar archivo
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

function Indicador({
  icono: Icono,
  etiqueta,
  valor,
  pequeno = false,
}: {
  icono: typeof Database;
  etiqueta: string;
  valor: string;
  pequeno?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-[var(--surface-0)] p-4">
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Icono className="size-3.5" />
        <p className="etiqueta">{etiqueta}</p>
      </div>
      <p
        className={`mt-3 font-semibold tracking-tight ${pequeno ? "text-base" : "text-xl"}`}
      >
        {valor}
      </p>
    </div>
  );
}

function Contexto({
  icono: Icono,
  titulo,
  detalle,
  href,
}: {
  icono: typeof Users;
  titulo: string;
  detalle: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex max-w-sm items-center gap-3 rounded-xl border bg-[var(--surface-0)] p-3"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--vidrio-alto)]">
        <Icono className="size-4" />
      </span>
      <span>
        <span className="block text-xs font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
          {detalle}
        </span>
      </span>
    </Link>
  );
}

function Calidad({
  estado,
  titulo,
  detalle,
}: {
  estado: "ok" | "alerta";
  titulo: string;
  detalle: string;
}) {
  const Icono = estado === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <div className="rounded-2xl border bg-[var(--surface-0)] p-4">
      <Icono
        className={`size-4 ${estado === "ok" ? "text-[var(--good)]" : "text-[var(--warning)]"}`}
      />
      <p className="mt-3 text-sm font-semibold">{titulo}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{detalle}</p>
    </div>
  );
}
