"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Primer acceso sin formularios de negocio: crea un espacio neutro y continúa. */
export function PrepararEspacio({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    async function preparar() {
      try {
        const res = await fetch("/api/inicializar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ organizacion: nombre || "Mi espacio" }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "No se pudo preparar el espacio.");
        if (vigente) router.refresh();
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : "No se pudo preparar el espacio.");
      }
    }
    preparar();
    return () => { vigente = false; };
  }, [nombre, router]);

  return (
    <div className="rounded-xl border bg-[var(--surface-1)] p-6 text-center">
      <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[var(--series-1)] border-t-transparent" />
      <p className="font-medium">Preparando tu espacio…</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Enseguida podrás cargar tu primera base.
      </p>
      {error ? <p className="mt-3 text-sm text-[var(--critical)]">{error}</p> : null}
    </div>
  );
}
