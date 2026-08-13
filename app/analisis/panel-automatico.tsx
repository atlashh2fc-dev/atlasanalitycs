"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarDays, Hash, Rows3 } from "lucide-react";

type Campo = {
  id: string;
  nombre: string;
  rol: "identificador" | "dimension" | "metrica" | "fecha" | "ignorado";
  tipo?: string;
  unidad?: string | null;
  agregacion?: string;
};

type Catalogo = {
  dataset?: { id: string; nombre: string };
  resumen?: { filas?: number; cargas?: number; campos?: number; ultima_carga?: string | null };
  campos?: Campo[];
  metricas?: Campo[];
  dimensiones?: Campo[];
  fechas?: Campo[];
};

type Resultado = {
  series?: { clave: string; valor: number }[];
  filas?: { clave: string; valor: number }[];
  total?: number;
  metadatos?: { registros?: number; unidad?: string };
  unidad?: string;
  registros?: number;
};

function numero(n: number, unidad?: string | null) {
  if (unidad === "porcentaje") return new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 }).format(n);
  if (unidad === "clp") return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(n);
}

export function PanelAutomatico({ datasetId }: { datasetId: string }) {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCatalogo(null);
    setError(null);
    fetch(`/api/datasets/${datasetId}/catalogo`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "No se pudo interpretar la base.");
        return json;
      })
      .then(setCatalogo)
      .catch((e) => setError(e.message));
  }, [datasetId]);

  const campos = catalogo?.campos ?? [];
  const metricas = catalogo?.metricas ?? campos.filter((c) => c.rol === "metrica");
  const dimensiones = catalogo?.dimensiones ?? campos.filter((c) => c.rol === "dimension");
  const fechas = catalogo?.fechas ?? campos.filter((c) => c.rol === "fecha");
  const resumen = catalogo?.resumen ?? {};

  if (error) return <Estado mensaje={error} error />;
  if (!catalogo) return <Estado mensaje="Leyendo la estructura y preparando indicadores…" />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Resumen icono={Rows3} titulo="Registros" valor={numero(resumen.filas ?? 0)} />
        <Resumen icono={Hash} titulo="Indicadores" valor={String(metricas.length)} />
        <Resumen icono={CalendarDays} titulo="Campos de fecha" valor={String(fechas.length)} />
        <Resumen icono={AlertTriangle} titulo="Campos ignorados" valor={String(campos.filter((c) => c.rol === "ignorado").length)} />
      </div>

      {metricas.length === 0 && dimensiones.length === 0 ? (
        <div className="vidrio rounded-2xl p-8 text-center">
          <p className="text-sm font-semibold">La base está cargada, pero faltan campos analizables</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Revisa la clasificación de campos desde Datos. Atlas conservó todas las filas originales.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {metricas.slice(0, 4).map((metrica, i) => {
            const temporal = i === 0 ? fechas[0] : undefined;
            const categorias = dimensiones.filter((d) => d.rol !== "fecha");
            const dimension = temporal ?? categorias[(i - 1) % Math.max(1, categorias.length)];
            return (
              <GraficoAutomatico
                key={`${metrica.id}-${dimension?.id ?? "total"}`}
                datasetId={datasetId}
                metrica={metrica}
                dimension={dimension}
                temporal={Boolean(temporal && dimension?.id === temporal.id)}
              />
            );
          })}
          {metricas.length === 0 ? (
            <GraficoAutomatico datasetId={datasetId} dimension={dimensiones[0]} temporal={false} />
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
        {campos.filter((c) => c.rol !== "ignorado").map((c) => (
          <span key={c.id} className="rounded-full border px-2.5 py-1">
            {c.nombre} · {c.rol}
          </span>
        ))}
      </div>
    </div>
  );
}

function GraficoAutomatico({
  datasetId,
  metrica,
  dimension,
  temporal,
}: {
  datasetId: string;
  metrica?: Campo;
  dimension?: Campo;
  temporal: boolean;
}) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const payload = useMemo(() => ({
    datasetId,
    metricaId: metrica?.id,
    dimensionId: dimension?.id,
    agregacion: metrica?.agregacion,
    granularidad: temporal ? "mes" : undefined,
    limite: temporal ? 36 : 10,
    orden: temporal ? "asc" : "desc",
  }), [datasetId, metrica, dimension, temporal]);

  useEffect(() => {
    fetch("/api/consulta/dataset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "No se pudo consultar.");
        return json;
      })
      .then(setResultado)
      .catch((e) => setError(e.message));
  }, [payload]);

  const datos = resultado?.series ?? resultado?.filas ?? [];
  const unidad = resultado?.metadatos?.unidad ?? resultado?.unidad ?? metrica?.unidad;

  return (
    <section className="vidrio min-h-[330px] rounded-2xl p-5" data-tono style={{ "--tono": temporal ? "var(--series-4)" : "var(--series-1)" } as React.CSSProperties}>
      <p className="etiqueta">{temporal ? "Evolución" : dimension ? "Distribución" : "Indicador"}</p>
      <h2 className="mt-1 text-sm font-semibold">
        {metrica?.nombre ?? "Registros"}{dimension ? ` por ${dimension.nombre.toLowerCase()}` : ""}
      </h2>
      {error ? <div className="grid h-[245px] place-items-center text-xs text-[var(--critical)]">{error}</div> : null}
      {!resultado && !error ? <div className="grid h-[245px] place-items-center text-xs text-[var(--text-muted)]">Calculando…</div> : null}
      {resultado && !dimension ? (
        <div className="flex h-[245px] items-center">
          <p className="cifra text-5xl">{numero(resultado.total ?? 0, unidad)}</p>
        </div>
      ) : null}
      {resultado && dimension && datos.length === 0 ? <div className="grid h-[245px] place-items-center text-xs text-[var(--text-muted)]">Sin datos para mostrar.</div> : null}
      {resultado && dimension && datos.length > 0 ? (
        <div className="mt-4 h-[245px]">
          <ResponsiveContainer width="100%" height="100%">
            {temporal ? (
              <LineChart data={datos}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="clave" tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => numero(Number(v), unidad)} />
                <Line type="monotone" dataKey="valor" stroke="var(--series-4)" strokeWidth={2.5} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={datos} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid stroke="var(--grid)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="clave" type="category" width={110} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => numero(Number(v), unidad)} />
                <Bar dataKey="valor" fill="var(--series-1)" radius={[0, 5, 5, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}

function Resumen({ icono: Icono, titulo, valor }: { icono: typeof Rows3; titulo: string; valor: string }) {
  return (
    <div className="vidrio rounded-2xl p-5">
      <Icono className="size-4 text-[var(--series-1)]" />
      <p className="mt-4 text-xs text-[var(--text-muted)]">{titulo}</p>
      <p className="cifra mt-1 text-3xl">{valor}</p>
    </div>
  );
}

function Estado({ mensaje, error = false }: { mensaje: string; error?: boolean }) {
  return (
    <div className="vidrio rounded-2xl py-20 text-center">
      <p className={`text-sm ${error ? "text-[var(--critical)]" : "text-[var(--text-secondary)]"}`}>{mensaje}</p>
    </div>
  );
}
