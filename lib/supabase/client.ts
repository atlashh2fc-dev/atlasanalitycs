import { createBrowserClient } from "@supabase/ssr";
import { leerCredenciales, MENSAJE_SIN_CONFIGURAR } from "./env";

export function createClient() {
  const credenciales = leerCredenciales();
  if (!credenciales) throw new Error(MENSAJE_SIN_CONFIGURAR);

  return createBrowserClient(credenciales.url, credenciales.key);
}

export function hayCredenciales(): boolean {
  return leerCredenciales() !== null;
}
