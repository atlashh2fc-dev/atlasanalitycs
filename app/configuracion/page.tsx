import { hayCredenciales } from "@/lib/supabase/client";
import { redirect } from "next/navigation";

/**
 * Página pública de diagnóstico. Existe para que un despliegue sin
 * variables de entorno muestre qué falta, en vez de un 500 opaco.
 */
export default function Configuracion() {
  if (hayCredenciales()) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight">Atlas</span>
        <span className="text-2xl font-light text-[var(--text-secondary)]">
          Analytics
        </span>
      </div>

      <div
        className="mt-6 rounded-lg border p-5"
        style={{
          borderColor: "color-mix(in srgb, var(--serious) 40%, transparent)",
          background: "color-mix(in srgb, var(--serious) 8%, transparent)",
        }}
      >
        <h1 className="text-base font-semibold">Falta configurar Supabase</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          El despliegue no encuentra las credenciales. Agrega estas dos
          variables de entorno en tu proyecto y vuelve a desplegar:
        </p>

        <pre className="mt-4 overflow-x-auto rounded-md border bg-[var(--surface-2)] p-3 text-xs">
{`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>`}
        </pre>

        <p className="mt-4 text-xs text-[var(--text-secondary)]">
          En Vercel: Settings → Environment Variables. Deben quedar
          habilitadas para Production, Preview y Development. Un redeploy
          posterior es obligatorio: las variables que empiezan con
          <code className="mx-1 rounded bg-[var(--surface-0)] px-1">NEXT_PUBLIC_</code>
          se inyectan en tiempo de build, no en tiempo de ejecución.
        </p>
      </div>
    </main>
  );
}
