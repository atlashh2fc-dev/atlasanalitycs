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

/**
 * Busca un usuario de Auth por correo.
 *
 * La API de admin no expone filtro por email, así que se pagina. Con
 * volúmenes de contact center (decenas de usuarios) una página basta.
 */
export async function buscarUsuarioPorEmail(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string,
) {
  const objetivo = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) return null;

    const encontrado = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === objetivo,
    );
    if (encontrado) return encontrado;

    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Usuarios de Auth que todavía no tienen perfil: existen para iniciar
 * sesión pero no pertenecen a ninguna organización, así que no ven nada.
 * Se listan para poder darles acceso sin crearlos de nuevo.
 */
export async function usuariosSinPerfil(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<{ id: string; email: string; creado: string }[]> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (!data?.users?.length) return [];

  const { data: perfiles } = await admin.from("perfil").select("id");
  const conPerfil = new Set((perfiles ?? []).map((p) => p.id));

  return data.users
    .filter((u) => !conPerfil.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.email ?? "(sin correo)",
      creado: u.created_at,
    }));
}
