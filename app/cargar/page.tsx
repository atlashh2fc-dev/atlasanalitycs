import { Nav } from "@/components/nav";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hayCredenciales } from "@/lib/supabase/client";
import { getContexto } from "@/lib/datos";
import { Card, CardTitle } from "@/components/ui/card";
import { Cargador } from "./cargador";
import { Pendientes, type CargaPendiente } from "./pendientes";
import { createClient } from "@/lib/supabase/server";
import { PrepararEspacio } from "./preparar-espacio";
import { MapaCobertura, type CoberturaDia } from "./mapa-cobertura";

export const dynamic = "force-dynamic";

export default async function Cargar({
  searchParams,
}: {
  searchParams: Promise<{ campana?: string; mes?: string }>;
}) {
  if (!hayCredenciales()) redirect("/configuracion");

  const ctx = await getContexto();
  const { campana: campanaSolicitada, mes: mesSolicitado } = await searchParams;
  const campanaInicial = ctx.campanas.some((c) => c.id === campanaSolicitada)
    ? campanaSolicitada
    : ctx.campanas[0]?.id;
  const hoyChile = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const mes = /^\d{4}-\d{2}$/.test(mesSolicitado ?? "")
    ? mesSolicitado!
    : hoyChile.slice(0, 7);

  // El espacio técnico se crea solo: la primera decisión del usuario es
  // su archivo, no campañas, productos ni configuración interna.
  if (!ctx.tenantId) {
    return (
      <>
        <Nav email={ctx.email} />

        <main className="mx-auto max-w-[700px] px-5 py-4">
          <h1 className="mb-3 text-[20px] font-semibold tracking-tight">Cargar datos</h1>
          <PrepararEspacio nombre={(ctx.email ?? "Mi espacio").split("@")[0] || "Mi espacio"} />
        </main>
      </>
    );
  }

  const supabase = await createClient();
  const inicioMes = `${mes}-01`;
  const [anio, numeroMes] = mes.split("-").map(Number);
  const finMes = new Date(Date.UTC(anio, numeroMes, 0)).toISOString().slice(0, 10);

  const [{ data: filas }, { data: datasets }, { data: operacion }, { data: asistencias }, { data: feriados }] = await Promise.all([
    supabase
      .from("carga")
      .select(
        "id, archivo_nombre, hoja, estado, filas_procesadas, filas_totales, error_detalle, created_at, dataset_id, cargado_por",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("dataset")
      .select("id,nombre,campana_id")
      .eq("activo", true)
      .not("campana_id", "is", null)
      .order("updated_at", { ascending: false }),
    campanaInicial
      ? supabase
          .from("v_operacion_diaria")
          .select("fecha,gestiones,cotizaciones,contratos")
          .eq("campana_id", campanaInicial)
          .gte("fecha", inicioMes)
          .lte("fecha", finMes)
          .limit(5000)
      : Promise.resolve({ data: [] }),
    campanaInicial
      ? supabase
          .from("asistencia")
          .select("fecha")
          .eq("campana_id", campanaInicial)
          .gte("fecha", inicioMes)
          .lte("fecha", finMes)
          .limit(5000)
      : Promise.resolve({ data: [] }),
    supabase.from("feriado").select("fecha").gte("fecha", inicioMes).lte("fecha", finMes),
  ]);

  const totales = new Map<string, { gestiones: number; ventas: number; cotizaciones: number; asistencia: number }>();
  const obtiene = (fecha: string) => {
    const actual = totales.get(fecha) ?? { gestiones: 0, ventas: 0, cotizaciones: 0, asistencia: 0 };
    totales.set(fecha, actual);
    return actual;
  };
  for (const fila of operacion ?? []) {
    const actual = obtiene(fila.fecha);
    actual.gestiones += Number(fila.gestiones ?? 0);
    actual.ventas += Number(fila.contratos ?? 0);
    actual.cotizaciones += Number(fila.cotizaciones ?? 0);
  }
  for (const fila of asistencias ?? []) obtiene(fila.fecha).asistencia += 1;
  const fechasFeriadas = new Set((feriados ?? []).map((fila) => fila.fecha));
  const dias: CoberturaDia[] = [];
  for (let dia = 1; dia <= Number(finMes.slice(-2)); dia += 1) {
    const fecha = `${mes}-${String(dia).padStart(2, "0")}`;
    const fechaUtc = new Date(`${fecha}T12:00:00Z`);
    const semana = fechaUtc.getUTCDay();
    const valores = totales.get(fecha) ?? { gestiones: 0, ventas: 0, cotizaciones: 0, asistencia: 0 };
    dias.push({
      fecha,
      esHabil: semana >= 1 && semana <= 5,
      esFeriado: fechasFeriadas.has(fecha),
      esFuturo: fecha > hoyChile,
      ...valores,
    });
  }

  const cargas: CargaPendiente[] = (filas ?? []).map((c) => ({
    id: c.id,
    archivo: c.archivo_nombre,
    hoja: c.hoja,
    estado: c.estado,
    filasProcesadas: c.filas_procesadas ?? 0,
    filasTotales: c.filas_totales,
    error: c.error_detalle,
    fecha: c.created_at,
    datasetId: c.dataset_id,
    puedeUsar: ctx.esAdmin || c.cargado_por === ctx.userId,
  }));

  return (
    <>
      <Nav email={ctx.email} />

      <main className="mx-auto max-w-[1400px] px-5 py-3">
        <div className="mb-3">
          <p className="etiqueta">Ingesta controlada</p>
          <h1 className="mt-0.5 text-[20px] font-semibold leading-none tracking-[-0.025em]">Cargar datos</h1>
          <p className="mt-1.5 max-w-2xl text-[12px] text-[var(--text-secondary)]">
            Sube archivos a una campaña. Atlas detecta la estructura, propone el mapeo y conserva el historial.
          </p>
        </div>

        {ctx.campanas.length > 0 ? (
          <Cargador
            campanas={ctx.campanas}
            datasets={datasets ?? []}
            tenantId={ctx.tenantId}
            campanaInicial={campanaInicial}
            cobertura={
              <MapaCobertura
                dias={dias}
                mes={mes}
                campana={campanaInicial!}
                campanas={ctx.campanas}
              />
            }
          />
        ) : (
          <Card>
            <CardTitle hint="Toda carga debe quedar asociada desde el inicio.">
              Primero crea una campaña
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)]">
              La campaña reunirá todos los archivos diarios, su configuración
              y sus indicadores.
            </p>
            <Link
              href="/administracion"
              className="mt-4 inline-flex rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white"
            >
              Ir a Administración
            </Link>
          </Card>
        )}

        <Card className="mt-3">
          <CardTitle hint="El archivo queda guardado y el avance vive en la base: puedes irte de la pantalla y volver a retomar.">
            Cargas registradas
          </CardTitle>
          <Pendientes
            cargas={cargas}
            esAdmin={ctx.esAdmin}
          />
        </Card>
      </main>
    </>
  );
}
