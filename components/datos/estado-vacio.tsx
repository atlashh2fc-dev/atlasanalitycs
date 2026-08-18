import Link from "next/link";
import { ArrowRight, Tags } from "lucide-react";

export function EstadoVacioDatos({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="vidrio rounded-2xl border-dashed px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-xl border border-[var(--vidrio-borde)] bg-[var(--vidrio-alto)] text-[var(--series-1)]">
        <Tags className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold">
        Crea tu primera campaña
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">
        {compacto
          ? "Crea la campaña y luego carga ahí tus Excel o CSV diarios."
          : "La campaña será el contenedor de sus cargas, usuarios, equipo, configuración e indicadores."}
      </p>
      <Link
        href="/administracion"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--series-1)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Tags className="size-4" />
        Crear campaña
        <ArrowRight className="size-3.5" />
      </Link>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Después podrás sumar todos los archivos diarios a la misma campaña
      </p>
    </div>
  );
}
