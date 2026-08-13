import { createClient } from "@supabase/supabase-js";
import { leerCredenciales } from "./env";

/**
 * Cliente con service role. SÓLO para route handlers del servidor.
 *
 * Salta RLS por completo, así que jamás debe importarse desde un
 * componente cliente ni exponerse al navegador. Todo endpoint que lo
 * use tiene que verificar antes, con el cliente normal, que quien llama
 * es administrador del tenant sobre el que va a operar.
 */
export function createAdminClient() {
  const credenciales = leerCredenciales();

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    // nombres que inyecta la integración Supabase de Vercel
    process.env.Storage_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.Storage_SUPABASE_SECRET_KEY ||
    "";

  if (!credenciales || !serviceKey) return null;

  return createClient(credenciales.url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Contraseña temporal legible, para entregarla al usuario nuevo. */
export function claveTemporal(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}
