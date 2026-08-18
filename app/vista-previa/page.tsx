"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Nav } from "@/components/nav";
import {
  Tablero,
  type Equilibrio,
  type FilaLinea,
  type Indicador,
} from "@/components/bsc/tablero";
import { Control, type FilaControl } from "@/components/bsc/control";
import { type EtapaEmbudo } from "@/components/bsc/embudo";
import { type PuntoProyeccion } from "@/components/bsc/proyeccion";

/**
 * Banco de pruebas visual.
 *
 * Existe para revisar el diseño en pantalla con datos conocidos, sin
 * depender de una sesión ni de la base. Se sirve sólo en desarrollo: en
 * producción devuelve 404, así que no hay ruta pública que exponga nada.
 *
 * Los números son los reales de agosto 2026: los financieros salen de la
 * base y los de gestión, del archivo del discador.
 */

const IND: Indicador[] = [
  ["Financiera", 1, "Ingreso del periodo", 8034584, "clp", null, 40.6, "Lo que factura el contact center según la tarifa vigente."],
  ["Financiera", 2, "Costo total", 11598102, "clp", null, null, "Remuneración con leyes sociales más los costos de operación cargados en el mantenedor."],
  ["Financiera", 3, "Margen", -3563518, "clp", null, null, "Ingreso menos costo."],
  ["Financiera", 4, "Margen sobre ingreso", -44.4, "pct", null, null, "Qué porcentaje de cada peso facturado queda después de costos."],
  ["Financiera", 5, "Ingreso por asegurado", 1.561, "uf", null, null, "Tarifa media obtenida. Sube con el mix: titulares mayores y pólizas con adicionales pagan más."],
  ["Financiera", 6, "Costo por asegurado", 92048, "clp", null, null, "Cuánto cuesta producir un asegurado. Es el número que hay que comparar contra la tarifa."],

  ["Cliente", 1, "Contactabilidad", 69.1, "pct", null, null, "De cada cien intentos, en cuántos se habló con la persona. Mide la calidad de la base y del horario de marcado, no del ejecutivo."],
  ["Cliente", 2, "Clientes gestionados", 5295, "entero", null, null, "Personas únicas tocadas en el periodo."],
  ["Cliente", 3, "Intentos por cliente", 1.58, "decimal", null, null, "Insistencia media. Muy bajo quema base; muy alto molesta y no convierte."],
  ["Cliente", 4, "Tasa de rechazo", 37.8, "pct", null, null, "De los que sí contestaron, cuántos dijeron que no."],
  ["Cliente", 5, "Base quemada", 19.3, "pct", null, null, "Clientes que pidieron no volver a ser llamados. Es pérdida permanente de base."],

  ["Procesos", 1, "Gestiones", 8391, "entero", null, null, "Volumen total de intentos de contacto."],
  ["Procesos", 2, "Gestiones por ejecutivo-día", 49.9, "decimal", null, null, "Intensidad de marcado. Es lo que separa un problema de esfuerzo de uno de efectividad."],
  ["Procesos", 3, "Conversión contacto a venta", 1.76, "pct", null, null, "De cada cien conversaciones reales, cuántas terminaron en contrato."],
  ["Procesos", 4, "Conversión gestión a venta", 1.22, "pct", null, null, "Contratos sobre intentos totales."],
  ["Procesos", 5, "Cierre sobre cotización", 2.12, "pct", null, null, "Cuántas cotizaciones terminan en venta."],
  ["Procesos", 6, "Compromisos abiertos", 3453, "entero", null, null, "Agendamientos y rellamadas vivas: el embudo que queda para los próximos días."],

  ["Personas", 1, "Cumplimiento de meta", 40.6, "pct", 100, 40.6, "Asegurados sobre la meta del periodo, sumando todas las líneas."],
  ["Personas", 2, "Ejecutivos con venta", 16, "entero", 14, null, "Cuántos de los que gestionaron lograron vender."],
  ["Personas", 3, "Brecha entre cuartiles", 5.5, "decimal", null, null, "Cuántas veces rinde el cuartil superior respecto del inferior. Sobre tres, el problema es de método, no de personas."],
  ["Personas", 4, "Mediana del equipo", 7, "decimal", null, null, "Asegurados del ejecutivo del medio."],
  ["Personas", 5, "Asistencia", null, "pct", null, null, "Presencias sobre marcas registradas. Requiere la planilla de asistencia cargada."],
].map(([perspectiva, orden, indicador, valor, unidad, meta, cumplimiento, detalle]) => ({
  perspectiva: perspectiva as string,
  orden: orden as number,
  indicador: indicador as string,
  valor: valor as number | null,
  unidad: unidad as string,
  meta: meta as number | null,
  cumplimiento: cumplimiento as number | null,
  sentido: "mas_mejor",
  detalle: detalle as string,
}));

const LINEAS: FilaLinea[] = [
  {
    agrupacion_meta: "CM+CAT",
    asegurados: 67,
    meta: 250,
    cumplimiento_pct: 26.8,
    tarifa_uf: null,
    ingreso_uf: 108.2,
    ingreso_clp: 4419634,
  },
  {
    agrupacion_meta: "ONCO",
    asegurados: 59,
    meta: 60,
    cumplimiento_pct: 98.33,
    tarifa_uf: 1.5,
    ingreso_uf: 88.5,
    ingreso_clp: 3614950,
  },
];

const PROYECCION: PuntoProyeccion[] = [
  ["2026-08-01", false, 0, 0, 0, 0, false],
  ["2026-08-04", true, 21, 21, 21, 29.5, false],
  ["2026-08-08", false, 0, 54, 54, 73.8, false],
  ["2026-08-12", true, 17, 88, 88, 118.1, false],
  ["2026-08-18", true, 0, 126, 126, 177.1, false],
  ["2026-08-21", true, 0, 126, 157.5, 221.4, true],
  ["2026-08-26", true, 0, 126, 189, 265.7, true],
  ["2026-08-31", true, 0, 126, 220.5, 310, true],
].map(([fecha, es_habil, asegurados_dia, acumulado, proyectado, linea_meta, es_futuro]) => ({
  fecha: fecha as string,
  es_habil: es_habil as boolean,
  asegurados_dia: asegurados_dia as number,
  acumulado: acumulado as number,
  proyectado: proyectado as number,
  linea_meta: linea_meta as number,
  es_futuro: es_futuro as boolean,
}));

const EMBUDO: EtapaEmbudo[] = [
  [1, "Gestiones", 8391, null, "Intentos de contacto registrados por el discador."],
  [2, "Contactos", 5799, 69.1, "Conversaciones efectivas con la base."],
  [3, "Compromisos", 3453, 59.5, "Rellamadas y seguimientos todavía vivos."],
  [4, "Cotizaciones", 4818, 139.5, "Cotizaciones emitidas durante el periodo."],
  [5, "Ventas", 102, 2.1, "Contratos ingresados durante el periodo."],
  [6, "Asegurados", 126, 123.5, "Titulares y cargas cubiertos."],
].map(([orden, etapa, valor, tasa_pct, detalle]) => ({
  orden: orden as number,
  etapa: etapa as string,
  valor: valor as number,
  tasa_pct: tasa_pct as number | null,
  detalle: detalle as string,
}));

const CONTROL: FilaControl[] = [
  ["Marjorie Venegas Gonzalez", 30, 0, 0, 15, 20, 13.5, 148.1, 7.8, 1225407, 791274, 434133, 10.4, "en meta"],
  ["Marta Orellana Leiva", 30, 2, 2, 10, 13, 13.5, 96.3, 7.8, 816938, 647274, 169664, 9.6, "en ritmo"],
  ["Millaray Guzman Gajardo", 30, 4, 4, 9, 13, 13.5, 96.3, 7.8, 796514, 642954, 153560, 9.8, "en ritmo"],
  ["Francisca Valenzuela", 42, 302, 963, 10, 14, 18.9, 74.1, 11.0, 796514, 808264, -11750, 14.3, "no cubre su costo"],
  ["Daniela Guzman Contreras", 30, 0, 0, 6, 9, 13.5, 66.7, 7.8, 551433, 591114, -39681, 9.8, "no cubre su costo"],
  ["Veronica Muñoz Montes", 30, 0, 0, 4, 7, 13.5, 51.9, 7.8, 428892, 565194, -136302, 9.8, "no cubre su costo"],
  ["Isabel Tarifeño", 42, 861, 937, 8, 9, 18.9, 47.6, 11.0, 594322, 779464, -185142, 12.5, "no cubre su costo"],
  ["Rommy Gormaz", 30, 542, 671, 5, 5, 13.5, 37.0, 7.8, 326775, 546474, -219699, 9.3, "no cubre su costo"],
  ["Jacqueline López", 42, 551, 785, 7, 8, 18.9, 42.3, 11.0, 520798, 765064, -244266, 12.7, "no cubre su costo"],
  ["Marcela Gómez", 30, 228, 350, 4, 4, 13.5, 29.6, 7.8, 275717, 532074, -256357, 8.7, "no cubre su costo"],
  ["Marisela Landeros", 42, 639, 802, 7, 7, 18.9, 37.0, 11.0, 502417, 765064, -262647, 11.6, "no cubre su costo"],
  ["Fresia Rojas", 30, 471, 587, 2, 2, 13.5, 14.8, 7.8, 122541, 503274, -380733, 10.1, "no cubre su costo"],
  ["Camila Marchant", 42, 470, 927, 5, 5, 18.9, 26.5, 11.0, 349241, 736264, -387023, 12.0, "no cubre su costo"],
  ["José Zuñiga", 42, 275, 419, 5, 5, 18.9, 26.5, 11.0, 347199, 736264, -389065, 12.1, "no cubre su costo"],
  ["Sofia San Martin", 42, 465, 767, 4, 4, 18.9, 21.2, 11.0, 308394, 721864, -413470, 10.6, "no cubre su costo"],
  ["Elvira Alviña", 30, 404, 504, 1, 1, 13.5, 7.4, 7.8, 71482, 488874, -417392, 8.3, "no cubre su costo"],
  ["Margarita Astorga", 42, 588, 673, 0, 0, 18.9, 0, 11.0, 0, 664264, -664264, null, "sin produccion"],
  ["Francisco Javier Saez", 42, 0, 0, 0, 0, 18.9, 0, 11.0, 0, 664264, -664264, null, "sin produccion"],
  ["Liliana Garrido Benavides", 42, 0, 0, 0, 0, 18.9, 0, 11.0, 0, 664264, -664264, null, "sin produccion"],
].map(
  (
    [
      ejecutivo, jornada, contactos, gestiones, contratos, asegurados, meta,
      pct, ritmo, ingreso, costo, margen, equilibrio, estado,
    ],
    i,
  ) => ({
    ejecutivo_id: `e${i}`,
    ejecutivo: ejecutivo as string,
    jornada_horas: jornada as number,
    gestiones: gestiones as number,
    contactos: contactos as number,
    // Mismo piso estadístico que la función de la base.
    contactabilidad_pct:
      (gestiones as number) >= 20
        ? Math.round(((contactos as number) / (gestiones as number)) * 1000) / 10
        : null,
    conversion_pct:
      (contactos as number) >= 20
        ? Math.round(((contratos as number) / (contactos as number)) * 1000) / 10
        : null,
    contratos: contratos as number,
    asegurados: asegurados as number,
    meta_asignada: meta as number,
    meta_es_propia: false,
    cumplimiento_pct: pct as number,
    ritmo_esperado: ritmo as number,
    proyeccion: null,
    ingreso_clp: ingreso as number,
    costo_fijo_clp: 0,
    costo_variable_clp: 0,
    costo_total_clp: costo as number,
    margen_clp: margen as number,
    equilibrio_aseg: equilibrio as number | null,
    estado: estado as string,
  }),
);

export default function VistaPrevia() {
  const { setTheme } = useTheme();
  useEffect(() => {
    const t = new URLSearchParams(location.search).get("tema");
    if (t) setTheme(t);
  }, [setTheme]);

  return (
    <>
      <Nav email="paula@ejemplo.cl" />
      <main className="mx-auto max-w-[1560px] px-6 py-7">
        <div className="mb-6">
          <p className="etiqueta">Contact center · gestión de venta</p>
          <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
            Cuadro de mando integral
          </h1>
        </div>

        <Tablero
          indicadores={IND}
          lineas={LINEAS}
          equilibrio={{
            asegurados_equilibrio: 181.9,
            asegurados_reales: 126,
            tarifa_media_clp: 63767,
            costo_total_clp: 11598102,
            ultima_venta: "2026-08-17",
          }}
          proyeccion={PROYECCION}
          embudo={EMBUDO}
        />

        <section className="mt-8 space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="etiqueta shrink-0 text-[var(--text-muted)]">4</span>
            <h2 className="text-[15px] font-semibold tracking-tight">Gestión del equipo</h2>
            <span className="text-xs text-[var(--text-muted)]">Meta, ritmo, forecast y equilibrio en una sola vista</span>
            <span className="h-px flex-1 bg-[var(--vidrio-borde)]" />
          </div>
          <Control filas={CONTROL} />
        </section>
      </main>
    </>
  );
}
