import { env } from "cloudflare:workers";
import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { estadoDeEntorno } from "@/lib/entorno-pura";
import { can } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/** Qué variables del servidor están cargadas y cuáles faltan. Solo nombres y sí/no: nunca un valor. Solo administradores. */
export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "ver_cuentas")) return fail("Solo un administrador.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  return Response.json({ variables: estadoDeEntorno(env as unknown as Record<string, unknown>) }, { headers: { "cache-control": "no-store" } });
}
