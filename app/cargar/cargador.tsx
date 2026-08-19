"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Upload } from "tus-js-client";
import { extraeMatriz, perfilaHoja, type PerfilHoja } from "@/lib/perfilador";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/stat";
import { fmt } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { leerCredenciales } from "@/lib/supabase/env";

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

type EstadoArchivo =
  | "pendiente"
  | "subiendo"
  | "cargando"
  | "cargado"
  | "error";

interface ArchivoEnCola {
  id: string;
  nombre: string;
  libro: XLSX.WorkBook;
  hojas: PerfilHoja[];
  hojaActiva: number;
  /** Hojas útiles que Atlas cargará. El usuario sólo desmarca las que no correspondan. */
  hojasSeleccionadas: number[];
  /** roles por hoja: clave = índice de hoja */
  roles: Record<number, Record<number, string>>;
  estado: EstadoArchivo;
  mensaje: string | null;
  /** Etapa operativa que explica qué está haciendo Atlas ahora. */
  etapa: string | null;
  /** 0 a 1; alimenta la barra de avance */
  progreso: number;
  /** El archivo original: se sube a Storage tal cual llegó */
  original: File;
  cargaId?: string;
}

async function subirConProgreso(
  archivo: File,
  ruta: string,
  alAvanzar: (bytesSubidos: number, bytesTotales: number) => void,
) {
  const credenciales = leerCredenciales();
  if (!credenciales) throw new Error("Falta configurar Supabase.");

  const supabase = createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("La sesión expiró. Vuelve a entrar para cargar el archivo.");
  }

  const api = new URL(credenciales.url);
  const referencia = api.hostname.endsWith(".supabase.co")
    ? api.hostname.split(".")[0]
    : null;
  const endpoint = referencia
    ? `https://${referencia}.storage.supabase.co/storage/v1/upload/resumable`
    : `${api.origin}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const carga = new Upload(archivo, {
      endpoint,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: credenciales.key,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: "cargas",
        objectName: ruta,
        contentType: archivo.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onProgress: alAvanzar,
      onError: (fallo) => reject(fallo),
      onSuccess: () => resolve(),
    });

    carga
      .findPreviousUploads()
      .then((anteriores) => {
        const anterior = anteriores.find(
          (a) => a.metadata?.bucketName === "cargas" && a.metadata?.objectName === ruta,
        );
        if (anterior) carga.resumeFromPreviousUpload(anterior);
        carga.start();
      })
      .catch(reject);
  });
}

const ESTADO_TONO: Record<EstadoArchivo, "good" | "warning" | "critical" | "neutro"> = {
  pendiente: "neutro",
  subiendo: "warning",
  cargando: "warning",
  cargado: "good",
  error: "critical",
};

const ESTADO_TEXTO: Record<EstadoArchivo, string> = {
  pendiente: "Pendiente",
  subiendo: "Subiendo…",
  cargando: "Procesando…",
  cargado: "Cargado",
  error: "Error",
};

export function Cargador({
  campanas,
  datasets,
  tenantId,
  campanaInicial,
}: {
  campanas: { id: string; nombre: string }[];
  datasets: { id: string; nombre: string; campana_id: string | null }[];
  tenantId: string;
  campanaInicial?: string;
}) {
  const [archivos, setArchivos] = useState<ArchivoEnCola[]>([]);
  const [activo, setActivo] = useState(0);
  const [campana, setCampana] = useState(
    campanas.some((c) => c.id === campanaInicial)
      ? campanaInicial!
      : (campanas[0]?.id ?? ""),
  );
  const [ocupado, setOcupado] = useState(false);
  const [mostrarMapeoCompleto, setMostrarMapeoCompleto] = useState(false);

  // Cerrar la pestaña a mitad de carga deja el lote incompleto.
  useEffect(() => {
    if (!ocupado) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [ocupado]);

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
        hojasSeleccionadas: hojas
          .map((h, i) => ({ h, i }))
          .filter(({ h }) => h.filas > 0 && h.columnas.some((c) => !c.descartada))
          .map(({ i }) => i),
        roles,
        estado: "pendiente",
        mensaje: null,
        etapa: null,
        progreso: 0,
        original: f,
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

  /**
   * Vuelve a perfilar la hoja forzando el modo o la fila de encabezado.
   * La detección automática acierta casi siempre, pero cuando no, el
   * usuario tiene que poder corregirla sin quedarse bloqueado.
   */
  function reperfilar(
    indice: number,
    forzar: { modo?: "tabular" | "matriz"; filaEncabezado?: number },
  ) {
    const archivo = archivos[indice];
    const actual = archivo.hojas[archivo.hojaActiva];

    const matriz = XLSX.utils.sheet_to_json<unknown[]>(
      archivo.libro.Sheets[actual.hoja],
      { header: 1, defval: null, raw: true },
    );

    const nueva = perfilaHoja(actual.hoja, matriz, {}, {
      modo: forzar.modo ?? actual.modo,
      filaEncabezado: forzar.filaEncabezado ?? actual.filaEncabezado,
    });

    const roles: Record<number, string> = {};
    for (const c of nueva.columnas) {
      if (c.rolSugerido && !c.descartada) roles[c.posicion] = c.rolSugerido;
    }

    setArchivos((prev) =>
      prev.map((a, i) =>
        i !== indice
          ? a
          : {
              ...a,
              hojas: a.hojas.map((h, j) => (j === a.hojaActiva ? nueva : h)),
              roles: { ...a.roles, [a.hojaActiva]: roles },
            },
      ),
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

  /** Formato largo de una hoja leída como planilla. */
  function matrizDe(archivo: ArchivoEnCola) {
    const hoja = archivo.hojas[archivo.hojaActiva];
    if (hoja.modo !== "matriz") return null;

    const matriz = XLSX.utils.sheet_to_json<unknown[]>(
      archivo.libro.Sheets[hoja.hoja],
      { header: 1, defval: null, raw: true },
    );
    return extraeMatriz(matriz, hoja.filaEncabezado);
  }

  /**
   * Sube el archivo a Storage y deja que el servidor lo procese por
   * lotes. El avance vive en la base, así que navegar a otra pantalla
   * —o cerrar el navegador— ya no pierde el trabajo: la carga queda
   * pendiente y se reanuda donde quedó.
   */
  async function resolverDataset(): Promise<string | null> {
    if (!campana) return null;
    const existente = datasets.find((d) => d.campana_id === campana);
    if (existente) return existente.id;
    throw new Error(
      "La campaña no tiene su espacio de datos preparado. Recarga la página.",
    );
  }

  async function cargarUno(indice: number): Promise<boolean> {
    const archivo = archivos[indice];
    const seleccionadas = archivo.hojasSeleccionadas;
    if (seleccionadas.length === 0) {
      actualizar(indice, { estado: "error", mensaje: "Selecciona al menos una hoja útil." });
      return false;
    }

    actualizar(indice, {
      estado: "subiendo",
      mensaje: null,
      etapa: "Preparando la campaña…",
      progreso: 0,
    });

    let baseId: string | null;
    try {
      baseId = await resolverDataset();
    } catch (e) {
      actualizar(indice, { estado: "error", mensaje: e instanceof Error ? e.message : "No se pudo preparar la campaña." });
      return false;
    }
    if (!baseId) {
      actualizar(indice, { estado: "error", mensaje: "Selecciona una campaña." });
      return false;
    }

    /* 1. El archivo original va a Storage tal cual llegó. TUS entrega
       bytes confirmados por el servidor: el primer 20% es subida real. */
    const limpio = archivo.nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ruta = `${tenantId}/${crypto.randomUUID()}-${limpio}`;

    try {
      await subirConProgreso(archivo.original, ruta, (subidos, total) => {
        const fraccion = total > 0 ? subidos / total : 0;
        const porcentajeSubida = Math.round(fraccion * 100);
        actualizar(indice, {
          estado: "subiendo",
          progreso: fraccion * 0.2,
          etapa: `Subiendo archivo · ${porcentajeSubida}%`,
        });
      });
    } catch (e) {
      actualizar(indice, {
        estado: "error",
        progreso: 0,
        etapa: null,
        mensaje: `No se pudo subir el archivo: ${e instanceof Error ? e.message : "error desconocido"}`,
      });
      return false;
    }

    actualizar(indice, {
      progreso: 0.2,
      etapa: `Archivo subido · preparando hoja 1 de ${seleccionadas.length}`,
    });

    let procesadasTotal = 0;
    let insertadasTotal = 0;
    let rechazadasTotal = 0;
    const periodosActualizados = new Set<string>();

    for (let posicion = 0; posicion < seleccionadas.length; posicion++) {
      const hojaIndice = seleccionadas[posicion];
      const hoja = archivo.hojas[hojaIndice];
      const rolesHoja = archivo.roles[hojaIndice] ?? {};
      const mapeo: Record<string, string> = {};
      for (const c of hoja.columnas) {
        const rol = rolesHoja[c.posicion];
        if (rol) mapeo[c.nombreOriginal] = rol;
      }

      /* Cada hoja es una carga reanudable, todas apuntan al mismo original. */
      const resIniciar = await fetch("/api/carga/iniciar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        datasetId: baseId,
        storagePath: ruta,
        archivo: archivo.nombre,
        hoja: hoja.hoja,
        modo: hoja.modo,
        filaEncabezado: hoja.filaEncabezado,
        metadatos: hoja.metadatos,
        mapeo,
        filasTotales: hoja.filas,
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
      }),
      });

      const iniciado = await resIniciar.json();
      if (!resIniciar.ok) {
        actualizar(indice, {
          estado: "error",
          progreso: posicion / seleccionadas.length,
          mensaje: iniciado.error ?? `No se pudo registrar la hoja ${hoja.hoja}.`,
        });
        return false;
      }

      actualizar(indice, {
        estado: "cargando",
        cargaId: iniciado.cargaId,
        etapa: `Procesando ${hoja.hoja} · hoja ${posicion + 1} de ${seleccionadas.length}`,
      });

      let vueltas = 0;
      let terminoHoja = false;

      while (vueltas++ < 500) {
        const res = await fetch("/api/carga/procesar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cargaId: iniciado.cargaId }),
      });

        const json = await res.json();

        if (!res.ok) {
          actualizar(indice, {
            estado: "error",
            mensaje: json.error ?? `Error al procesar ${hoja.hoja}.`,
          });
          return false;
        }

        insertadasTotal += json.insertadas ?? 0;
        rechazadasTotal += json.rechazadas ?? 0;
        for (const mes of json.periodosActualizados ?? []) periodosActualizados.add(mes);
        const avanceHoja = json.total > 0 ? json.procesadas / json.total : 1;
        const avanceProceso = (posicion + avanceHoja) / seleccionadas.length;
        const progresoReal = 0.2 + avanceProceso * 0.8;
        actualizar(indice, {
          progreso: Math.min(progresoReal, 0.999),
          etapa: `Procesando ${hoja.hoja} · ${fmt.entero(json.procesadas ?? 0)} de ${fmt.entero(json.total ?? 0)} filas`,
        });

        if (json.terminado) {
          procesadasTotal += json.procesadas ?? 0;
          terminoHoja = true;
          break;
        }
      }
      if (!terminoHoja) {
        actualizar(indice, {
          estado: "error",
          etapa: null,
          mensaje: `La hoja ${hoja.hoja} quedó a medio procesar. Puedes reanudarla desde Cargas registradas.`,
        });
        return false;
      }
    }

    actualizar(indice, {
      estado: "cargado",
      progreso: 1,
      etapa: "Carga completa",
      mensaje: `${fmt.entero(procesadasTotal)} filas conservadas en ${seleccionadas.length} hoja${seleccionadas.length === 1 ? "" : "s"}${insertadasTotal ? ` · ${fmt.entero(insertadasTotal)} registros del pack` : ""}${rechazadasTotal ? ` · ${fmt.entero(rechazadasTotal)} fila${rechazadasTotal === 1 ? "" : "s"} con RUT inválido conservada${rechazadasTotal === 1 ? "" : "s"} para revisión` : ""}${periodosActualizados.size ? ` · ${periodosActualizados.size} periodo${periodosActualizados.size === 1 ? "" : "s"} actualizado${periodosActualizados.size === 1 ? "" : "s"}` : ""}`,
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
  const columnasRevision = hoja
    ? hoja.columnas.filter(
        (c) => !c.descartada && (!rolesHoja[c.posicion] || c.confianza < 0.8),
      )
    : [];
  const columnasMapeo = hoja
    ? mostrarMapeoCompleto
      ? hoja.columnas
      : columnasRevision
    : [];
  const pendientes = archivos.filter((a) => a.estado !== "cargado").length;
  const campanaSeleccionada = campanas.find((c) => c.id === campana);

  return (
    <div className="space-y-5">
      <Card className="border border-[color-mix(in_srgb,var(--series-1)_38%,var(--vidrio-borde))] bg-[color-mix(in_srgb,var(--series-1)_7%,var(--surface-0))]">
        <CardTitle
          impacto="Control y Análisis operativo"
          hint="Todos los archivos de este lote se agregan al historial de la campaña elegida. No reemplazan cargas anteriores."
        >
          Destino de la carga
        </CardTitle>
        {campanas.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-[minmax(240px,1fr)_1.5fr] sm:items-end">
            <label className="text-xs text-[var(--text-secondary)]">
              <span className="mb-1 block font-medium">Agregar información a</span>
              <select
                value={campana}
                onChange={(e) => setCampana(e.target.value)}
                disabled={ocupado}
                className="w-full rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-3 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {campanas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <p className="rounded-xl border border-[var(--vidrio-borde)] bg-[var(--surface-0)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">{campanaSeleccionada?.nombre}</strong>{" "}
              conservará sus reglas, equipo, metas y costos. Esta carga sólo suma registros y recalcula sus KPI.
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-[var(--critical)]">
            No existe una campaña de destino. Créala en Administración antes de cargar archivos.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle
          impacto={campanaSeleccionada ? `Campaña ${campanaSeleccionada.nombre}` : "Ninguna campaña seleccionada"}
          hint="Puedes elegir varios de una vez, o ir sumando de a uno: la cola no se borra al agregar otro archivo."
        >
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
                    {a.hojasSeleccionadas.length} hoja
                    {a.hojasSeleccionadas.length === 1 ? "" : "s"} útil
                    {a.hojasSeleccionadas.length === 1 ? "" : "es"} ·{" "}
                    {fmt.entero(
                      a.hojasSeleccionadas.reduce(
                        (total, h) => total + (a.hojas[h]?.filas ?? 0),
                        0,
                      ),
                    )} filas
                  </span>
                </button>

                {a.mensaje ? (
                  <span className="hidden text-xs text-[var(--text-secondary)] sm:block">
                    {a.mensaje}
                  </span>
                ) : null}

                {a.estado === "cargando" || a.estado === "subiendo" ? (
                  <div className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-[var(--surface-0)]">
                    <div
                      className="h-full rounded-full bg-[var(--series-1)] transition-[width] duration-300"
                      style={{ width: `${Math.round(a.progreso * 100)}%` }}
                    />
                  </div>
                ) : null}

                <Badge tono={ESTADO_TONO[a.estado]}>
                  {a.estado === "cargando"
                    ? `${Math.round(a.progreso * 100)}%`
                    : ESTADO_TEXTO[a.estado]}
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
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Atlas seleccionó las hojas con datos. Desmarca portadas, notas o
              tablas auxiliares que no quieras analizar.
            </p>
            <div className="flex flex-wrap gap-2">
              {archivo.hojas.map((h, i) => (
                <div
                  key={h.hoja}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    i === archivo.hojaActiva
                      ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_8%,transparent)] font-medium"
                      : "bg-[var(--surface-2)] text-[var(--text-secondary)]"
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={archivo.hojasSeleccionadas.includes(i)}
                      onChange={(e) =>
                        actualizar(activo, {
                          hojasSeleccionadas: e.target.checked
                            ? [...archivo.hojasSeleccionadas, i]
                            : archivo.hojasSeleccionadas.filter((x) => x !== i),
                        })
                      }
                    />
                    <button type="button" onClick={() => actualizar(activo, { hojaActiva: i })}>
                      {h.hoja}
                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                        {fmt.entero(h.filas)} filas
                      </span>
                    </button>
                  </label>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4 border-t pt-3">
              <label className="text-xs text-[var(--text-secondary)]">
                <span className="mb-1 block font-medium">Cómo leer la hoja</span>
                <select
                  value={hoja.modo}
                  onChange={(e) =>
                    reperfilar(activo, {
                      modo: e.target.value as "tabular" | "matriz",
                    })
                  }
                  className="rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2.5 py-1.5 text-sm"
                >
                  <option value="tabular">Tabla (una fila por registro)</option>
                  <option value="matriz">Planilla (fechas en columnas)</option>
                </select>
              </label>

              <label className="text-xs text-[var(--text-secondary)]">
                <span className="mb-1 block font-medium">Fila del encabezado</span>
                <input
                  type="number"
                  min={1}
                  value={hoja.filaEncabezado + 1}
                  onChange={(e) =>
                    reperfilar(activo, {
                      filaEncabezado: Math.max(0, Number(e.target.value) - 1),
                    })
                  }
                  className="w-24 rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2.5 py-1.5 text-sm"
                />
              </label>

              <p className="pb-1.5 text-xs text-[var(--text-muted)]">
                Detectado automáticamente. Si los nombres de columna de abajo
                se ven como datos, corrige la fila acá.
              </p>
            </div>

            {hoja.modo === "matriz" ? <VistaPreviaMatriz archivo={archivo} /> : null}

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
              hint={`${usadas} de ${hoja.columnas.length} columnas interpretadas. Atlas conserva todas las columnas, incluso las que no alimentan un pack especializado.`}
            >
              3 · Revisa el mapeo
            </CardTitle>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              {mostrarMapeoCompleto ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  Mostrando las {hoja.columnas.length} columnas de la hoja. Puedes corregir cualquier rol antes de cargar.
                </p>
              ) : columnasRevision.length === 0 ? (
                <div className="rounded-md border border-[var(--good)]/30 bg-[color-mix(in_srgb,var(--good)_8%,transparent)] px-3 py-2 text-sm">
                  Atlas interpretó esta hoja sin dudas. Puedes cargarla directamente.
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">
                  Mostramos {columnasRevision.length} columna{columnasRevision.length === 1 ? "" : "s"} que necesita{columnasRevision.length === 1 ? "" : "n"} confirmación. Las otras {hoja.columnas.length - columnasRevision.length} ya están listas.
                </p>
              )}

              <button
                type="button"
                onClick={() => setMostrarMapeoCompleto((actual) => !actual)}
                disabled={ocupado}
                className="rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--series-1)] disabled:opacity-50"
              >
                {mostrarMapeoCompleto
                  ? "Mostrar sólo las dudas"
                  : "Revisar / editar todo el mapeo"}
              </button>
            </div>

            {columnasMapeo.length > 0 ? <div className="overflow-x-auto">
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
                  {columnasMapeo.map((c) => (
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
            </div> : null}
          </Card>

          <Card>
            <CardTitle
              impacto="KPI de la campaña"
              hint={`Destino confirmado: ${campanaSeleccionada?.nombre ?? "sin campaña"}. Los registros se suman al historial existente.`}
            >
              4 · Carga en {campanaSeleccionada?.nombre ?? "una campaña"}
            </CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              {campanas.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-[var(--critical)]">
                  Crea una campaña antes de cargar archivos.
                </p>
              ) : null}

              <button
                onClick={cargarActivo}
                disabled={ocupado || !campana}
                className="rounded-xl bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {ocupado ? `${Math.round(archivo.progreso * 100)}%` : "Cargar esta hoja"}
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

            {archivo.estado !== "pendiente" &&
            (archivo.progreso > 0 || archivo.estado !== "error") ? (
              <div
                className="mt-5 rounded-xl border border-[var(--vidrio-borde)] bg-[var(--surface-1)] p-4"
                role="progressbar"
                aria-label="Progreso de la carga"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(archivo.progreso * 100)}
              >
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-[var(--text-primary)]">
                    {archivo.etapa ?? "Cargando…"}
                  </span>
                  <span
                    className="tabular text-lg font-semibold"
                    style={{
                      color:
                        archivo.estado === "cargado"
                          ? "var(--good)"
                          : archivo.estado === "error"
                            ? "var(--critical)"
                            : "var(--series-1)",
                    }}
                  >
                    {Math.round(archivo.progreso * 100)}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-0)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{
                      width: `${Math.round(archivo.progreso * 100)}%`,
                      background:
                        archivo.estado === "cargado"
                          ? "var(--good)"
                          : archivo.estado === "error"
                            ? "var(--critical)"
                            : "var(--series-1)",
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  El porcentaje usa bytes recibidos por Storage y filas confirmadas por la base.
                </p>
              </div>
            ) : null}

            <p className="mt-4 border-t pt-3 text-xs text-[var(--text-muted)]">
              Esta carga y las siguientes quedarán en el historial de la
              campaña seleccionada. No se creará una base separada por archivo.{" "}
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

/**
 * Vista previa del unpivot: muestra en qué se convierte la planilla
 * antes de cargarla. Sin esto el usuario tiene que confiar a ciegas en
 * que el sistema entendió su formato.
 */
function VistaPreviaMatriz({ archivo }: { archivo: ArchivoEnCola }) {
  const hoja = archivo.hojas[archivo.hojaActiva];

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(
    archivo.libro.Sheets[hoja.hoja],
    { header: 1, defval: null, raw: true },
  );
  const r = extraeMatriz(matriz, hoja.filaEncabezado);

  const personas = new Set(r.filas.map((f) => f.entidad)).size;
  const porMarca = r.filas.reduce<Record<string, number>>((acc, f) => {
    acc[f.marca] = (acc[f.marca] ?? 0) + 1;
    return acc;
  }, {});

  const NOMBRE_MARCA: Record<string, string> = {
    P: "presente", A: "ausente", V: "vacaciones",
    L: "licencia", B: "baja", F: "feriado", S: "sábado",
  };

  return (
    <div className="mt-3 rounded-md border bg-[var(--surface-1)] p-3">
      <p className="text-xs font-medium">Se convertirá en asistencia diaria</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {fmt.entero(r.filas.length)} marcas · {personas} personas ·{" "}
        {r.columnasFecha.length} días. Sólo los días presentes cuentan como
        días gestionados para el IP-D.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(porMarca).map(([m, n]) => (
          <span
            key={m}
            className="rounded border bg-[var(--surface-2)] px-2 py-0.5 text-[11px]"
          >
            {NOMBRE_MARCA[m] ?? m}: <span className="tabular font-medium">{n}</span>
          </span>
        ))}
      </div>

      {r.filas.length > 0 ? (
        <table className="mt-3 w-full text-[11px]">
          <thead>
            <tr className="border-b text-left text-[var(--text-muted)]">
              <th className="pb-1 font-medium">Persona</th>
              <th className="pb-1 font-medium">Fecha</th>
              <th className="pb-1 font-medium">Marca</th>
              <th className="pb-1 text-right font-medium">Jornada</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {r.filas.slice(0, 4).map((f, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1">{f.entidad}</td>
                <td className="py-1">{f.fecha}</td>
                <td className="py-1">{NOMBRE_MARCA[f.marca] ?? f.marca}</td>
                <td className="py-1 text-right">
                  {f.jornada ? `${f.jornada} h` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {r.marcasDesconocidas.length > 0 ? (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Se ignoran valores que no son marcas de asistencia:{" "}
          {r.marcasDesconocidas.join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
