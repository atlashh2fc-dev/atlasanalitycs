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
  rut: "RUT", fecha: "fecha", hora: "hora", duracion: "duración",
  monto: "monto", uf: "UF", telefono: "teléfono", email: "email",
  entero: "entero", decimal: "decimal", booleano: "sí/no",
  categoria: "categoría", texto: "texto", desconocido: "?",
};

interface RespuestaCarga {
  cargaId?: string;
  insertadas?: number;
  error?: string;
}

type EstadoArchivo = "pendiente" | "cargando" | "cargado" | "error";

interface ArchivoEnCola {
  id: string;
  nombre: string;
  libro: XLSX.WorkBook;
  hojas: PerfilHoja[];
  hojaActiva: number;
  /** roles por hoja: clave = índice de hoja */
  roles: Record<number, Record<number, string>>;
  estado: EstadoArchivo;
  mensaje: string | null;
}

const ESTADO_TONO: Record<EstadoArchivo, "good" | "warning" | "critical" | "neutro"> = {
  pendiente: "neutro",
  cargando: "warning",
  cargado: "good",
  error: "critical",
};

const ESTADO_TEXTO: Record<EstadoArchivo, string> = {
  pendiente: "Pendiente",
  cargando: "Cargando…",
  cargado: "Cargado",
  error: "Error",
};

export function Cargador({
  campanas,
}: {
  campanas: { id: string; nombre: string }[];
}) {
  const [archivos, setArchivos] = useState<ArchivoEnCola[]>([]);
  const [activo, setActivo] = useState(0);
  const [campana, setCampana] = useState(campanas[0]?.id ?? "");
  const [ocupado, setOcupado] = useState(false);

  /**
   * Los archivos se SUMAN a la cola, no la reemplazan. Así se pueden
   * elegir varios de una vez, o ir agregando de a uno sin perder el
   * mapeo ya confirmado de los anteriores.
   */
  async function alSeleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    const seleccion = Array.from(e.target.files ?? []);
    if (seleccion.length === 0) return;

    const nuevos: ArchivoEnCola[] = [];

    for (const f of seleccion) {
      const buf = await f.arrayBuffer();
      const libro = XLSX.read(buf, { cellDates: true });

      const hojas = libro.SheetNames.map((nombre) => {
        const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], {
          header: 1,
          defval: null,
          raw: true,
        });
        return perfilaHoja(nombre, matriz);
      }).sort((a, b) => b.puntaje - a.puntaje);

      const roles: Record<number, Record<number, string>> = {};
      hojas.forEach((h, i) => {
        const r: Record<number, string> = {};
        for (const c of h.columnas) {
          if (c.rolSugerido && !c.descartada) r[c.posicion] = c.rolSugerido;
        }
        roles[i] = r;
      });

      nuevos.push({
        id: `${f.name}-${f.size}-${nuevos.length}-${archivos.length}`,
        nombre: f.name,
        libro,
        hojas,
        hojaActiva: 0,
        roles,
        estado: "pendiente",
        mensaje: null,
      });
    }

    // El primero de los recién agregados pasa a ser el activo
    const primeroNuevo = archivos.length;
    setArchivos([...archivos, ...nuevos]);
    setActivo(primeroNuevo);

    // Permite volver a elegir el mismo archivo si el usuario lo quitó
    e.target.value = "";
  }

  function actualizar(indice: number, cambio: Partial<ArchivoEnCola>) {
    setArchivos((prev) =>
      prev.map((a, i) => (i === indice ? { ...a, ...cambio } : a)),
    );
  }

  function quitar(indice: number) {
    setArchivos((prev) => prev.filter((_, i) => i !== indice));
    setActivo((a) => (a >= indice && a > 0 ? a - 1 : a));
  }

  function filasDe(archivo: ArchivoEnCola): Record<string, unknown>[] {
    const hoja = archivo.hojas[archivo.hojaActiva];
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(
      archivo.libro.Sheets[hoja.hoja],
      { header: 1, defval: null, raw: true },
    );
    const encabezado = hoja.columnas.map((c) => c.nombreOriginal);

    return matriz
      .slice(hoja.filaEncabezado + 1)
      .filter((f) => f.some((c) => c !== null && String(c).trim() !== ""))
      .map((f) => {
        const o: Record<string, unknown> = {};
        encabezado.forEach((nombre, i) => {
          const v = f[i];
          o[nombre] = v instanceof Date ? v.toISOString() : v;
        });
        return o;
      });
  }

  async function cargarUno(indice: number): Promise<boolean> {
    const archivo = archivos[indice];
    const hoja = archivo.hojas[archivo.hojaActiva];
    const rolesHoja = archivo.roles[archivo.hojaActiva] ?? {};
    const filas = filasDe(archivo);

    actualizar(indice, { estado: "cargando", mensaje: null });

    const mapeo: Record<string, string> = {};
    for (const c of hoja.columnas) {
      const rol = rolesHoja[c.posicion];
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
          archivo: archivo.nombre,
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
            rol: rolesHoja[c.posicion] ?? null,
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
        actualizar(indice, {
          estado: "error",
          mensaje: json.error ?? "Error al cargar.",
        });
        return false;
      }

      cargaId = json.cargaId ?? null;
      insertadas += json.insertadas ?? 0;
    }

    actualizar(indice, {
      estado: "cargado",
      mensaje: `${fmt.entero(filas.length)} filas · ${fmt.entero(insertadas)} registros canónicos`,
    });
    return true;
  }

  async function cargarActivo() {
    setOcupado(true);
    await cargarUno(activo);
    setOcupado(false);
  }

  /** Carga secuencial: evita condiciones de carrera creando ejecutivos. */
  async function cargarPendientes() {
    setOcupado(true);
    for (let i = 0; i < archivos.length; i++) {
      if (archivos[i].estado === "cargado") continue;
      setActivo(i);
      await cargarUno(i);
    }
    setOcupado(false);
  }

  const archivo = archivos[activo];
  const hoja = archivo?.hojas[archivo.hojaActiva];
  const rolesHoja = archivo?.roles[archivo.hojaActiva] ?? {};
  const usadas = hoja
    ? hoja.columnas.filter((c) => rolesHoja[c.posicion]).length
    : 0;
  const pendientes = archivos.filter((a) => a.estado !== "cargado").length;

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle hint="Puedes elegir varios de una vez, o ir sumando de a uno: la cola no se borra al agregar otro archivo.">
          1 · Elige los archivos
        </CardTitle>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          onChange={alSeleccionar}
          className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--series-1)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />

        {archivos.length > 0 ? (
          <div className="mt-4 space-y-1.5">
            {archivos.map((a, i) => (
              <div
                key={a.id}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                  i === activo
                    ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_6%,transparent)]"
                    : "bg-[var(--surface-2)]"
                }`}
              >
                <button
                  onClick={() => setActivo(i)}
                  className="flex-1 truncate text-left"
                >
                  <span className={a.estado === "cargado" ? "opacity-60" : ""}>
                    {a.nombre}
                  </span>
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    hoja: {a.hojas[a.hojaActiva]?.hoja} ·{" "}
                    {fmt.entero(a.hojas[a.hojaActiva]?.filas ?? 0)} filas
                  </span>
                </button>

                {a.mensaje ? (
                  <span className="hidden text-xs text-[var(--text-secondary)] sm:block">
                    {a.mensaje}
                  </span>
                ) : null}

                <Badge tono={ESTADO_TONO[a.estado]}>
                  {ESTADO_TEXTO[a.estado]}
                </Badge>

                <button
                  onClick={() => quitar(i)}
                  disabled={ocupado}
                  aria-label={`Quitar ${a.nombre}`}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--critical)] disabled:opacity-40"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {archivo && hoja ? (
        <>
          <Card>
            <CardTitle hint="Ordenadas por cantidad de datos útiles. Las hojas con restos de trabajo manual quedan al final.">
              2 · Hoja de «{archivo.nombre}»
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              {archivo.hojas.map((h, i) => (
                <button
                  key={h.hoja}
                  onClick={() => actualizar(activo, { hojaActiva: i })}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    i === archivo.hojaActiva
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
              hint={`${usadas} de ${hoja.columnas.length} columnas mapeadas. Las descartadas tienen un solo valor o están vacías.`}
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
                      className={`border-b last:border-0 ${c.descartada ? "opacity-45" : ""}`}
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
                          value={rolesHoja[c.posicion] ?? ""}
                          onChange={(e) =>
                            actualizar(activo, {
                              roles: {
                                ...archivo.roles,
                                [archivo.hojaActiva]: {
                                  ...rolesHoja,
                                  [c.posicion]: e.target.value,
                                },
                              },
                            })
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
                onClick={cargarActivo}
                disabled={ocupado}
                className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {ocupado ? "Cargando…" : "Cargar esta hoja"}
              </button>

              {archivos.length > 1 ? (
                <button
                  onClick={cargarPendientes}
                  disabled={ocupado || pendientes === 0}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--surface-0)] disabled:opacity-40"
                >
                  Cargar los {pendientes} pendientes
                </button>
              ) : null}

              {archivo.mensaje ? (
                <p
                  className="pb-1 text-xs"
                  style={{
                    color:
                      archivo.estado === "error"
                        ? "var(--critical)"
                        : "var(--good)",
                  }}
                >
                  {archivo.mensaje}
                </p>
              ) : null}
            </div>

            <p className="mt-4 border-t pt-3 text-xs text-[var(--text-muted)]">
              Los archivos se cargan de a uno en orden, no en paralelo: si dos
              traen al mismo ejecutivo escrito distinto, la conciliación de
              alias necesita que el primero termine antes de que empiece el
              segundo. Nada se pisa en silencio — cada carga queda registrada
              con sus filas crudas y es reversible.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
