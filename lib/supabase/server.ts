import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { leerCredenciales, MENSAJE_SIN_CONFIGURAR } from "./env";

export async function createClient() {
  const credenciales = leerCredenciales();
  if (!credenciales) throw new Error(MENSAJE_SIN_CONFIGURAR);

  const cookieStore = await cookies();

  return createServerClient(credenciales.url, credenciales.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component: el middleware refresca la sesión
        }
      },
    },
  });
}
