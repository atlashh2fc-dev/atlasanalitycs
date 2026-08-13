import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buscarUsuarioPorEmail,
  claveTemporal,
  createAdminClient,
} from "@/lib/supabase/admin";

/**
 * Verifica que quien llama sea administrador y devuelve su tenant.
 * Se hace con el cliente normal (sujeto a RLS) ANTES de tocar el
 * cliente de service role, que salta todas las políticas.
 */
async function exigirAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sesión no válida.", status: 401 as const };
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("tenant_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.tenant_id) {
    return { error: "Tu usuario no tiene organización.", status: 400 as const };
  }

  if (perfil.rol !== "admin") {
    return {
      error: "Sólo un administrador puede gestionar usuarios.",
      status: 403 as const,
    };
  }

  return { tenantId: perfil.tenant_id, userId: user.id };
}

/* ------------------------------------------------------------------ */
/* Crear usuario                                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const ctx = await exigirAdmin();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Falta la service role key en el entorno. Agrega SUPABASE_SERVICE_ROLE_KEY para poder crear usuarios.",
      },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    email?: string;
    nombre?: string;
    rol?: "admin" | "supervisor";
    campanas?: string[];
  };

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
  }

  const rol = body.rol === "admin" ? "admin" : "supervisor";

  // Un usuario puede existir ya en Auth —creado a mano en Supabase o en
  // un intento anterior— pero sin perfil: existe para iniciar sesión y
  // no pertenece a ninguna organización, así que no ve nada. En ese
  // caso NO se crea de nuevo: se vincula.
  const existente = await buscarUsuarioPorEmail(admin, email);

  let usuarioId: string;
  let clave: string | undefined;
  let vinculado = false;

  if (existente) {
    const { data: perfilPrevio } = await admin
      .from("perfil")
      .select("tenant_id")
      .eq("id", existente.id)
      .maybeSingle();

    if (perfilPrevio) {
      return NextResponse.json(
        {
          error:
            perfilPrevio.tenant_id === ctx.tenantId
              ? "Ese usuario ya está en tu organización."
              : "Ese correo ya pertenece a otra organización.",
        },
        { status: 400 },
      );
    }

    usuarioId = existente.id;
    vinculado = true;
  } else {
    clave = claveTemporal();
    const { data: creado, error: errAuth } = await admin.auth.admin.createUser({
      email,
      password: clave,
      email_confirm: true,
    });

    if (errAuth || !creado?.user) {
      return NextResponse.json(
        { error: errAuth?.message ?? "No se pudo crear el usuario." },
        { status: 400 },
      );
    }
    usuarioId = creado.user.id;
  }

  const { error: errPerfil } = await admin.from("perfil").insert({
    id: usuarioId,
    tenant_id: ctx.tenantId,
    nombre: body.nombre?.trim() || email,
    email,
    rol,
  });

  if (errPerfil) {
    // Sin perfil el usuario quedaría autenticable pero sin acceso a
    // nada. Sólo se borra la cuenta si la acabamos de crear nosotros:
    // una cuenta preexistente no se toca.
    if (!vinculado) await admin.auth.admin.deleteUser(usuarioId);
    return NextResponse.json({ error: errPerfil.message }, { status: 500 });
  }

  const campanas = (body.campanas ?? []).filter(Boolean);
  if (rol === "supervisor" && campanas.length > 0) {
    await admin.from("perfil_campana").insert(
      campanas.map((campana_id) => ({ perfil_id: usuarioId, campana_id })),
    );
  }

  return NextResponse.json({ id: usuarioId, email, clave, vinculado });
}

/* ------------------------------------------------------------------ */
/* Actualizar rol, campañas, estado o contraseña                       */
/* ------------------------------------------------------------------ */

export async function PATCH(request: Request) {
  const ctx = await exigirAdmin();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Falta la service role key en el entorno." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    id?: string;
    rol?: "admin" | "supervisor";
    campanas?: string[];
    activo?: boolean;
    reiniciarClave?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "Falta el usuario." }, { status: 400 });
  }

  // El usuario objetivo debe pertenecer al mismo tenant: el service role
  // salta RLS, así que este chequeo es la única barrera.
  const { data: objetivo } = await admin
    .from("perfil")
    .select("id, tenant_id, rol")
    .eq("id", body.id)
    .maybeSingle();

  if (!objetivo || objetivo.tenant_id !== ctx.tenantId) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  if (body.id === ctx.userId && (body.rol === "supervisor" || body.activo === false)) {
    return NextResponse.json(
      { error: "No puedes quitarte a ti mismo el acceso de administrador." },
      { status: 400 },
    );
  }

  const cambios: Record<string, unknown> = {};
  if (body.rol) cambios.rol = body.rol;
  if (typeof body.activo === "boolean") cambios.activo = body.activo;

  if (Object.keys(cambios).length > 0) {
    const { error } = await admin.from("perfil").update(cambios).eq("id", body.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (Array.isArray(body.campanas)) {
    await admin.from("perfil_campana").delete().eq("perfil_id", body.id);
    if (body.campanas.length > 0) {
      await admin.from("perfil_campana").insert(
        body.campanas.map((campana_id) => ({ perfil_id: body.id!, campana_id })),
      );
    }
  }

  let clave: string | undefined;
  if (body.reiniciarClave) {
    clave = claveTemporal();
    const { error } = await admin.auth.admin.updateUserById(body.id, {
      password: clave,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, clave });
}
