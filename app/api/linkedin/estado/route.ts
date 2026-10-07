import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { estadoDeLinkedin, usarMiConexionParaElEquipo } from "@/lib/linkedin-conexion";
import { ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";
import { mismoOrigen } from "@/lib/origen-publico";
import { can } from "@/lib/permisos";

/**
 * Estado de la conexión de LinkedIn DEL EQUIPO. Lo puede ver cualquier persona con sesión (para saber si puede actuar o si un
 * administrador debe reconectar); solo quien administra conexiones ve quién la conectó. Nunca devuelve el token.
 *
 * `POST { accion: "usar-para-el-equipo" }`: marca la conexión de quien pregunta como la de todo el equipo. Solo administración.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const estado = await estadoDeLinkedin(session.actor);
  return Response.json({ estado, puedeAdministrar: can(session.actor, "administrar_conexiones") }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const cuerpo = (await request.json().catch(() => ({}))) as { accion?: string };
  if (cuerpo.accion !== "usar-para-el-equipo") return fail("Acción desconocida", 400);
  try {
    await usarMiConexionParaElEquipo(session.actor);
    const estado = await estadoDeLinkedin(session.actor);
    return Response.json({ estado, puedeAdministrar: true }, { headers: NO_STORE });
  } catch (error) {
    const estado = error instanceof ErrorDeLinkedin ? error.status : 500;
    return fail(error instanceof Error ? error.message : "No se pudo fijar la conexión del equipo", estado >= 400 && estado < 600 ? estado : 500);
  }
}
