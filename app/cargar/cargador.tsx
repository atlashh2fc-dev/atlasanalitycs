"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { perfilaHoja, type PerfilHoja } from "@/lib/perfilador";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/stat";
import { fmt } from "@/lib/utils";

const ROLES = [
  { valor: "", etiqueta: "— sin usar —" },
  { valor: "rut_cliente", etiqueta: "RUT del cliente (llave maestra)" },
  { valor: "nombre_cliente", etiqueta: "Nombre del cliente" },
  { valor: "email_cliente", etiqueta: "Email del cliente" },
  { valor: "telefono_cliente", etiqueta: "Teléfono del cliente" },
  { valor: "ejecutivo", etiqueta: "Ejecutivo" },
  { valor: "fecha_venta", etiqueta: "Fecha de venta" },
  { valor: "fecha_cotizacion", etiqueta: "Fecha de cotización" },
  { valor: "fecha_agenda", etiqueta: "Fecha de agenda" },
  { valor: "producto", etiqueta: "Producto / plan" },
  { valor: "n_asegurados", etiqueta: "N° de asegurados (titular + cargas)" },
  { valor: "monto_uf", etiqueta: "Monto en UF" },
  { valor: "monto_clp", etiqueta: "Monto en pesos" },
  { valor: "nro_solicitud", etiqueta: "N° de solicitud" },
  { valor: "presentado", etiqueta: "Presentado (sí/no)" },
  { valor: "especialidad", etiqueta: "Especialidad" },
  { valor: "centro", etiqueta: "Centro" },
  { valor: "prevision", etiqueta: "Previsión / sistema de salud" },
  { valor: "edad", etiqueta: "Edad" },
  { valor: "tramo_etario", etiqueta: "Tramo etario" },
  { valor: "dimension", etiqueta: "Otra dimensión (agrupar por)" },
  { valor: "metrica", etiqueta: "Otra métrica (sumar)" },
];

const TIPO_ETIQUETA: Record<string, string> = {
  rut: "RUT",
  fecha: "fecha",
  hora: "hora",
  duracion: "duración",
  monto: "monto",
  uf: "UF",
  telefono: "teléfono",
  email: "email",
  entero: "entero",
  decimal: "decimal",
  booleano: "sí/no",
  categoria: "categoría",
  texto: "texto",
  desconocido: "?",
};

interface RespuestaCarga {
  cargaId?: string;
  insertadas?: number;
  error?: string;
}

type Etapa = "inicio" | "perfilado" | "enviando" | "listo" | "error";

export function Cargador({
  campanas,
}: {
  campanas: { id: string; nombre: string }[];
}) {
  const [etapa, setEtapa] = useState<Etapa>("inicio");
  const [archivo, setArchivo] = useState<string>("");
  const [hojas, setHojas] = useState<PerfilHoja[]>([]);
  const [activa, setActiva] = useState(0);
  const [roles, setRoles] = useState<Record<number, string>>({});
  const [filas, setFilas] = useState<Record<string, unknown>[]>([]);
  const [campana, setCampana] = useState(campanas[0]?.id ?? "");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function alSeleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setArchivo(f.name);
    setMensaje(null);

    const buf = await f.arrayBuffer();
    const libro = XLSX.read(buf, { cellDates: true });

    const perfiles = libro.SheetNames.map((nombre) => {
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], {
        header: 1,
        defval: null,
        raw: true,
      });
      return perfilaHoja(nombre, matriz);
    })
      // Las hojas residuales (Hoja3, Hoja4, restos de trabajo manual)
      // quedan al final por puntaje, no se ocultan.
      .sort((a, b) => b.puntaje - a.puntaje);

    setHojas(perfiles);
    setActiva(0);
    aplicarRolesSugeridos(perfiles[0]);
    extraerFilas(libro, perfiles[0]);
    setEtapa("perfilado");
  }

  function aplicarRolesSugeridos(hoja: PerfilHoja | undefined) {
    if (!hoja) return;
    const r: Record<number, string> = {};
    for (const c of hoja.columnas) {
      if (c.rolSugerido && !c.descartada) r[c.posicion] = c.rolSugerido;
    }
    setRoles(r);
  }

  function extraerFilas(libro: XLSX.WorkBook, hoja: PerfilHoja | undefined) {
    if (!hoja) return;
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[hoja.hoja], {
      header: 1,
      defval: null,
      raw: true,
    });
    const encabezado = hoja.columnas.map((c) => c.nombreOriginal);
    const cuerpo = matriz.slice(hoja.filaEncabezado + 1);

    const objetos = cuerpo
      .filter((f) => f.some((c) => c !== null && String(c).trim() !== ""))
      .map((f) => {
        const o: Record<string, unknown> = {};
        encabezado.forEach((nombre, i) => {
          const v = f[i];
          o[nombre] = v instanceof Date ? v.toISOString() : v;
        });
        return o;
      });

    setFilas(objetos);
  }

  async function enviar() {
    setEtapa("enviando");
    setMensaje(null);

    const hoja = hojas[activa];
    const mapeo: Record<string, string> = {};
    for (const c of hoja.columnas) {
      const rol = roles[c.posicion];
      if (rol) mapeo[c.nombreOriginal] = rol;
    }

    const LOTE = 500;
    let cargaId: string | null = null;
    let insertadas = 0;

    for (let i = 0; i < filas.length; i += LOTE) {
      const res: Response = await fetch("/api/cargar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cargaId,
          archivo,
          hoja: hoja.hoja,
          modo: hoja.modo,
          filaEncabezado: hoja.filaEncabezado,
          metadatos: hoja.metadatos,
          campanaId: campana || null,
          mapeo,
          columnas: hoja.columnas.map((c) => ({
            posicion: c.posicion,
            nombreOriginal: c.nombreOriginal,
            nombreNormalizado: c.nombreNormalizado,
            tipo: c.tipo,
            confianza: c.confianza,
            rol: roles[c.posicion] ?? null,
            cardinalidad: c.cardinalidad,
            nulos: c.nulos,
            filas: c.filas,
            varianzaCero: c.varianzaCero,
            descartada: c.descartada,
            motivoDescarte: c.motivoDescarte,
            muestra: c.muestra,
          })),
          filas: filas.slice(i, i + LOTE),
          desplazamiento: i,
          ultimo: i + LOTE >= filas.length,
        }),
      });

      const json = (await res.json()) as RespuestaCarga;
      if (!res.ok) {
        setMensaje(json.error ?? "Error al cargar.");
        setEtapa("error");
        return;
      }
      cargaId = json.cargaId ?? null;
      insertadas += json.insertadas ?? 0;
    }

    setMensaje(
      `${fmt.entero(filas.length)} filas cargadas · ${fmt.entero(insertadas)} registros canónicos generados.`,
    );
    setEtapa("listo");
  }

  const hoja = hojas[activa];
  const usadas = hoja
    ? hoja.columnas.filter((c) => roles[c.posicion]).length
    : 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle hint="Formatos .xlsx, .xls y .csv. El archivo se procesa en tu navegador; sólo viajan las filas ya perfiladas.">
          1 · Elige el archivo
        </CardTitle>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={alSeleccionar}
          className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--series-1)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        {archivo ? (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            {archivo} · {hojas.length} hoja{hojas.length === 1 ? "" : "s"} detectada
            {hojas.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </Card>

      {etapa !== "inicio" && hoja ? (
        <>
          <Card>
            <CardTitle hint="Ordenadas por cantidad de datos útiles. Las hojas con restos de trabajo manual quedan al final.">
              2 · Elige la hoja
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              {hojas.map((h, i) => (
                <button
                  key={h.hoja}
                  onClick={() => {
                    setActiva(i);
                    aplicarRolesSugeridos(h);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    i === activa
                      ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_8%,transparent)] font-medium"
                      : "bg-[var(--surface-2)] text-[var(--text-secondary)]"
                  }`}
                >
                  {h.hoja}
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {fmt.entero(h.filas)} filas
                  </span>
                </button>
              ))}
            </div>

            {hoja.modo === "matriz" ? (
              <p
                className="mt-4 rounded-md px-3 py-2 text-xs"
                style={{
                  color: "var(--serious)",
                  background: "color-mix(in srgb, var(--serious) 10%, transparent)",
                }}
              >
                Esta hoja tiene formato de planilla, no de base de datos: las
                fechas están en la fila {hoja.filaEncabezado + 1} y las
                entidades en las filas. Se procesará con unpivot automático a
                formato largo.
              </p>
            ) : null}

            {Object.keys(hoja.metadatos).length > 0 ? (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Metadatos leídos del nombre de la hoja:{" "}
                {Object.entries(hoja.metadatos)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" · ")}
              </p>
            ) : null}
          </Card>

          <Card>
            <CardTitle
              hint={`${usadas} de ${hoja.columnas.length} columnas mapeadas. Las columnas descartadas tienen un solo valor o están vacías.`}
            >
              3 · Revisa el mapeo propuesto
            </CardTitle>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[var(--text-muted)]">
                    <th className="pb-2 font-medium">Columna</th>
                    <th className="pb-2 font-medium">Detectado</th>
                    <th className="pb-2 font-medium">Ejemplos</th>
                    <th className="pb-2 text-right font-medium">Nulos</th>
                    <th className="pb-2 font-medium">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {hoja.columnas.map((c) => (
                    <tr
                      key={c.posicion}
                      className={`border-b last:border-0 ${
                        c.descartada ? "opacity-45" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 font-medium text-[var(--text-primary)]">
                        {c.nombreOriginal}
                        {c.motivoDescarte ? (
                          <span className="block text-[11px] font-normal text-[var(--text-muted)]">
                            {c.motivoDescarte}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tono={c.confianza > 0.9 ? "good" : "neutro"}>
                          {TIPO_ETIQUETA[c.tipo] ?? c.tipo}
                        </Badge>
                      </td>
                      <td className="max-w-[220px] truncate py-2 pr-3 text-xs text-[var(--text-secondary)]">
                        {c.muestra.join(" · ") || "—"}
                      </td>
                      <td className="tabular py-2 pr-3 text-right text-xs text-[var(--text-secondary)]">
                        {c.filas > 0 ? fmt.pct(c.nulos / c.filas, 0) : "—"}
                      </td>
                      <td className="py-2">
                        <select
                          value={roles[c.posicion] ?? ""}
                          onChange={(e) =>
                            setRoles((r) => ({ ...r, [c.posicion]: e.target.value }))
                          }
                          className="w-full max-w-[260px] rounded border bg-[var(--surface-2)] px-2 py-1 text-xs"
                        >
                          {ROLES.map((r) => (
                            <option key={r.valor} value={r.valor}>
                              {r.etiqueta}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardTitle>4 · Confirma y carga</CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--text-secondary)]">
                <span className="mb-1 block font-medium">Campaña</span>
                <select
                  value={campana}
                  onChange={(e) => setCampana(e.target.value)}
                  className="rounded-md border bg-[var(--surface-2)] px-2.5 py-1.5 text-sm"
                >
                  <option value="">Sin campaña</option>
                  {campanas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={enviar}
                disabled={etapa === "enviando"}
                className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {etapa === "enviando"
                  ? "Cargando…"
                  : `Cargar ${fmt.entero(filas.length)} filas`}
              </button>

              {mensaje ? (
                <p
                  className="pb-1 text-xs"
                  style={{
                    color: etapa === "error" ? "var(--critical)" : "var(--good)",
                  }}
                >
                  {mensaje}
                </p>
              ) : null}
            </div>

            <p className="mt-4 border-t pt-3 text-xs text-[var(--text-muted)]">
              Nada se pisa en silencio: la carga queda registrada con su hash y
              sus filas crudas, y es reversible desde el mantenedor.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
