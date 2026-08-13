"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Nav } from "@/components/nav";
import { TarjetaCifra } from "@/components/panel/tarjeta";
import { GraficoCumplimiento } from "@/components/charts/cumplimiento";
import { GraficoRanking } from "@/components/charts/ranking";
import { tonoDe } from "@/lib/tonos";

/**
 * Banco de pruebas visual.
 *
 * Existe para revisar el diseño en pantalla con datos conocidos, sin
 * depender de una sesión ni de la base. Se sirve sólo en desarrollo: en
 * producción devuelve 404, así que no hay ruta pública que exponga nada.
 */

const serie = [3, 7, 5, 12, 9, 15, 11, 18, 14, 21, 17, 24].map((v, i) => ({
  clave: `2026-08-${String(i + 1).padStart(2, "0")}`,
  valor: v,
}));

const KPIS = [
  { t: "Asegurados del periodo", fuente: "venta", total: 104, obj: 310, ant: 78, u: "entero", reg: 83 },
  { t: "Contratos", fuente: "venta", total: 83, ant: 91, u: "entero", reg: 83 },
  { t: "UF vendida", fuente: "venta", total: 36.08, ant: 31.2, u: "uf", reg: 83 },
  { t: "Cotizaciones", fuente: "cotizacion", total: 2064, ant: 1890, u: "entero", reg: 2064 },
] as const;

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
          <p className="etiqueta">Gestión de venta</p>
          <h1 className="mt-1.5 text-[27px] font-semibold leading-none tracking-[-0.03em]">
            Mi panel
          </h1>
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-4">
          {KPIS.map((k, i) => {
            const t = tonoDe(k.fuente);
            const Icono = t.icono;
            return (
              <motion.div
                key={k.t}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.045, type: "spring", stiffness: 260, damping: 26 }}
                data-tono
                style={{ "--tono": t.css } as React.CSSProperties}
                className="vidrio h-[196px] rounded-2xl p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="grid size-6 place-items-center rounded-lg"
                    style={{
                      background: "color-mix(in srgb, var(--tono) 18%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--tono) 38%, transparent)",
                      color: "var(--tono)",
                    }}
                  >
                    <Icono className="size-3.5" strokeWidth={2.2} />
                  </span>
                  <h3 className="truncate text-[13px] font-semibold">{k.t}</h3>
                </div>
                <div className="h-[130px]">
                  <TarjetaCifra
                    total={k.total}
                    unidad={k.u as "entero"}
                    registros={k.reg}
                    objetivo={"obj" in k ? k.obj : undefined}
                    anterior={k.ant}
                    serie={serie}
                    granularidad="dia"
                    tono={t.css}
                    ritmo={0.42}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div
            data-tono
            style={{ "--tono": "var(--tono-venta)" } as React.CSSProperties}
            className="vidrio rounded-2xl p-5"
          >
            <h3 className="text-[13px] font-semibold">Cumplimiento por línea</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Una línea sobre ritmo puede tapar el atraso de la otra.
            </p>
            <GraficoCumplimiento
              datos={[
                { agrupacion: "CM+CAT", asegurados: 57, meta: 250, ritmoEsperado: 91, proyeccion: 157 },
                { agrupacion: "ONCO", asegurados: 47, meta: 60, ritmoEsperado: 22, proyeccion: 129 },
              ]}
            />
          </div>

          <div
            data-tono
            style={{ "--tono": "var(--tono-venta)" } as React.CSSProperties}
            className="vidrio rounded-2xl p-5"
          >
            <h3 className="mb-3 text-[13px] font-semibold">Ranking y dispersión</h3>
            <GraficoRanking
              mediana={10}
              datos={[
                { ejecutivo: "Marjorie Venegas", asegurados: 17, cuartil: 4, ipD: 2.12 },
                { ejecutivo: "Francisca Valenzuela", asegurados: 14, cuartil: 4, ipD: 1.75 },
                { ejecutivo: "Marta Orellana", asegurados: 10, cuartil: 3, ipD: 1.25 },
                { ejecutivo: "Isabel Tarifeño", asegurados: 7, cuartil: 2, ipD: 0.88 },
                { ejecutivo: "Fresia Rojas", asegurados: 2, cuartil: 1, ipD: 0.25 },
              ]}
            />
          </div>
        </div>
      </main>
    </>
  );
}
