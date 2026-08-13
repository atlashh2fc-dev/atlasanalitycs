"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs text-[var(--text-secondary)]">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

const input =
  "w-full rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--series-1)]";

const boton =
  "rounded-xl bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60";

/**
 * Alta de meta. La vigencia es obligatoria: cambiar una meta nunca
 * reescribe los periodos ya cerrados.
 */
export function FormMeta({
  campanas,
}: {
  campanas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [campana, setCampana] = useState(campanas[0]?.id ?? "");
  const [agrupacion, setAgrupacion] = useState("CM+CAT");
  const [valor, setValor] = useState("250");
  const [dg, setDg] = useState("22");
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const [anio, m] = mes.split("-").map(Number);
    const inicio = new Date(Date.UTC(anio, m - 1, 1));
    const fin = new Date(Date.UTC(anio, m, 0));

    const supabase = createClient();
    const { data: perfil } = await supabase
      .from("perfil")
      .select("tenant_id")
      .maybeSingle();

    const { error } = await supabase.from("meta").insert({
      tenant_id: perfil?.tenant_id,
      campana_id: campana,
      agrupacion_meta: agrupacion,
      unidad: "asegurados",
      valor: Number(valor),
      dg_esperados: Number(dg),
      periodo_inicio: inicio.toISOString().slice(0, 10),
      periodo_fin: fin.toISOString().slice(0, 10),
    });

    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Campo label="Campaña">
        <select
          value={campana}
          onChange={(e) => setCampana(e.target.value)}
          className={input}
        >
          {campanas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Agrupación">
        <input
          value={agrupacion}
          onChange={(e) => setAgrupacion(e.target.value)}
          className={input}
        />
      </Campo>
      <Campo label="Asegurados">
        <input
          type="number"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className={input}
        />
      </Campo>
      <Campo label="Días gestionados">
        <input
          type="number"
          value={dg}
          onChange={(e) => setDg(e.target.value)}
          className={input}
        />
      </Campo>
      <Campo label="Mes">
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className={input}
        />
      </Campo>

      <div className="col-span-2 flex items-center gap-3 sm:col-span-5">
        <button type="submit" disabled={guardando} className={boton}>
          {guardando ? "Guardando…" : "Agregar meta"}
        </button>
        {error ? (
          <p className="text-xs" style={{ color: "var(--critical)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function FormCampana() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("venta");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    const supabase = createClient();
    const { data: perfil } = await supabase
      .from("perfil")
      .select("tenant_id")
      .maybeSingle();

    const { error } = await supabase.from("campana").insert({
      tenant_id: perfil?.tenant_id,
      nombre,
      tipo,
      fecha_inicio: new Date().toISOString().slice(0, 10),
    });

    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNombre("");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="flex flex-wrap items-end gap-3">
      <Campo label="Nombre de la campaña">
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Venta Seguros"
          className={`${input} min-w-[220px]`}
        />
      </Campo>
      <Campo label="Tipo">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={input}>
          <option value="venta">Venta</option>
          <option value="outbound">Outbound</option>
          <option value="inbound">Inbound</option>
          <option value="mixta">Mixta</option>
        </select>
      </Campo>
      <button type="submit" disabled={guardando} className={boton}>
        {guardando ? "Creando…" : "Crear campaña"}
      </button>
      {error ? (
        <p className="pb-1.5 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Primer arranque: crea el tenant, el perfil admin y una campaña base.
 * Se hace una sola vez y deja el sistema listo para la primera carga.
 */
export function Semilla() {
  const router = useRouter();
  const [organizacion, setOrganizacion] = useState("Atlas");
  const [estado, setEstado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function crear() {
    setCargando(true);
    setEstado(null);

    const res = await fetch("/api/inicializar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizacion }),
    });

    const json = await res.json();
    setCargando(false);

    if (!res.ok) {
      setEstado(json.error);
      return;
    }

    setEstado("Listo. Ya puedes cargar tu primer Excel.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Campo label="Nombre de la organización">
        <input
          value={organizacion}
          onChange={(e) => setOrganizacion(e.target.value)}
          className={`${input} min-w-[220px]`}
        />
      </Campo>
      <button onClick={crear} disabled={cargando} className={boton}>
        {cargando ? "Creando…" : "Inicializar"}
      </button>
      {estado ? (
        <p className="pb-1.5 text-xs text-[var(--text-secondary)]">{estado}</p>
      ) : null}
    </div>
  );
}
