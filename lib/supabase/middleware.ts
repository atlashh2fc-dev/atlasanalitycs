import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { leerCredenciales } from "./env";

export async function updateSession(request: NextRequest) {
  const credenciales = leerCredenciales();

  // Sin credenciales el middleware no puede validar sesión. Antes esto
  // lanzaba y Vercel devolvía MIDDLEWARE_INVOCATION_FAILED en TODAS las
  // rutas: un 500 opaco en vez de un problema de configuración visible.
  // Se deja pasar la petición y la propia página explica qué falta.
  if (!credenciales) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(credenciales.url, credenciales.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  let usuario = null;
  try {
    const { data } = await supabase.auth.getUser();
    usuario = data.user;
  } catch {
    // Un error de red hacia Supabase no debe tumbar el sitio: se trata
    // como sesión ausente y la ruta protegida redirige al login.
    usuario = null;
  }

  const publica =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/configuracion");

  if (!usuario && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
