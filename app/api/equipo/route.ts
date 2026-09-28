import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import {
  EquipoError,
  inviteMember,
  listTeam,
  updateMember,
} from "@/lib/equipo";
import { mismoOrigen } from "@/lib/origen-publico";
import { can } from "@/lib/permisos";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "administrar_equipo")) {
    return fail("No tienes permiso para administrar el equipo", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  }

  try {
    return Response.json(
      { members: await listTeam(session.actor) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);

  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    const body = (await request.json()) as {
      email?: string;
      role?: string;
      portfolioIds?: string[];
    };
    await inviteMember(session.actor, {
      email: String(body.email ?? ""),
      role: String(body.role ?? ""),
      portfolioIds: Array.isArray(body.portfolioIds) ? body.portfolioIds : [],
    });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);

  const guard = guardMutation(request);
  if (guard) return guard;

  try {
    const body = (await request.json()) as {
      userId?: string;
      role?: string;
      isActive?: boolean;
      portfolioIds?: string[];
    };
    if (!body.userId) throw new EquipoError("Falta identificar a la persona");
    await updateMember(session.actor, {
      userId: body.userId,
      role: body.role,
      isActive: body.isActive,
      portfolioIds: body.portfolioIds,
    });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return fromError(error);
  }
}

/** Mismo origen y JSON: las mutaciones no se aceptan desde otro sitio. */
function guardMutation(request: Request) {
  if (!mismoOrigen(request)) {
    return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }
  return null;
}

function fromError(error: unknown) {
  const status = error instanceof EquipoError ? error.status : 500;
  const message =
    error instanceof EquipoError
      ? error.message
      : "No pudimos completar la acción";
  if (status === 500) console.error("WiWO.ADS equipo", error);
  return fail(message, status);
}
