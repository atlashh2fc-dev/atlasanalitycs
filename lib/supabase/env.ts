/**
 * Resolución de las credenciales de Supabase.
 *
 * La integración Supabase de Vercel inyecta las variables con nombres
 * distintos a los del proyecto (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
 * `SUPABASE_PUBLISHABLE_KEY`). Se aceptan todas para que conectar desde
 * el panel de Vercel funcione sin renombrar nada a mano.
 *
 * Ojo: en el navegador sólo existen las que empiezan con NEXT_PUBLIC_,
 * porque Next las inyecta en tiempo de build. Las demás sirven en
 * servidor y middleware.
 */

export interface CredencialesSupabase {
  url: string;
  key: string;
}

export function leerCredenciales(): CredencialesSupabase | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "";

  if (!url || !key) return null;
  return { url, key };
}

export const MENSAJE_SIN_CONFIGURAR =
  "Faltan las variables de entorno de Supabase. Configura " +
  "NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY y vuelve a desplegar.";
