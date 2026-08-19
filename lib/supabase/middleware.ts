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

  let usuarioId: string | null = null;
  try {
    // Verifica la firma/expiración del JWT usando JWKS cacheable. A diferencia
    // de getUser(), no exige una ida al servicio Auth en cada navegación.
    const { data } = await supabase.auth.getClaims();
    usuarioId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  } catch {
    // Un error de red hacia Supabase no debe tumbar el sitio: se trata
    // como sesión ausente y la ruta protegida redirige al login.
    usuarioId = null;
  }

  const publica =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/configuracion") ||
    // Sólo existe en desarrollo: su layout devuelve 404 en producción.
    request.nextUrl.pathname.startsWith("/vista-previa");

  if (!usuarioId && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
