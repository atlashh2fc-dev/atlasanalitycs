"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Nav } from "@/components/nav";
import {
  Tablero,
  type FilaEconomia,
  type FilaLinea,
  type Indicador,
} from "@/components/bsc/tablero";

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
  ["Financiera", 2, "Costo total", 0, "clp", null, null, "Remuneración con leyes sociales más los costos de operación cargados en el mantenedor."],
  ["Financiera", 3, "Margen", 8034584, "clp", null, null, "Ingreso menos costo. Sin remuneración cargada, es igual al ingreso."],
  ["Financiera", 4, "Margen sobre ingreso", 100, "pct", null, null, "Qué porcentaje de cada peso facturado queda después de costos."],
  ["Financiera", 5, "Ingreso por asegurado", 1.561, "uf", null, null, "Tarifa media obtenida. Sube con el mix: titulares mayores y pólizas con adicionales pagan más."],
  ["Financiera", 6, "Costo por asegurado", 0, "clp", null, null, "Cuánto cuesta producir un asegurado. Es el número que hay que comparar contra la tarifa."],

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

const ECONOMIA: FilaEconomia[] = [
  ["Marjorie Venegas Gonzalez", 15, 20, 0, 30.0, 1225407],
  ["Marta Orellana Leiva", 10, 13, 2, 20.0, 816938],
  ["Francisca Valenzuela", 10, 14, 963, 19.5, 796514],
  ["Millaray Guzman Gajardo", 9, 13, 4, 19.5, 796514],
  ["Isabel Tarifeño", 8, 9, 937, 14.55, 594322],
  ["Daniela Guzman Contreras", 6, 9, 0, 13.5, 551433],
  ["Jacqueline López", 7, 8, 785, 12.75, 520798],
  ["Marisela Landeros", 7, 7, 802, 12.3, 502417],
  ["Veronica Muñoz Montes", 4, 7, 0, 10.5, 428892],
  ["Camila Marchant", 5, 5, 927, 8.55, 349241],
  ["José Zuñiga", 5, 5, 419, 8.5, 347199],
  ["Rommy Gormaz", 5, 5, 671, 8.0, 326775],
].map(([ejecutivo, contratos, asegurados, gestiones, ingreso_uf, ingreso_clp]) => ({
  ejecutivo: ejecutivo as string,
  contratos: contratos as number,
  asegurados: asegurados as number,
  gestiones: gestiones as number,
  ingreso_uf: ingreso_uf as number,
  ingreso_clp: ingreso_clp as number,
  costo_empresa_clp: 0,
  margen_clp: ingreso_clp as number,
  margen_pct: 100,
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
          economia={ECONOMIA}
          lineas={LINEAS}
          periodo={{ desde: "2026-08-01", hasta: "2026-08-31" }}
        />
      </main>
    </>
  );
}
