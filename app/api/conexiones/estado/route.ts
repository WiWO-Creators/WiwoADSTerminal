import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { conexionesDelEquipo } from "@/lib/conexiones-equipo";

/**
 * Qué conexiones del equipo (Google, Meta, LinkedIn) están activas. Lo puede ver cualquier persona con sesión: así quien no administra
 * sabe por qué algo no está disponible y a quién avisar. No devuelve tokens ni correos.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  try {
    return Response.json(await conexionesDelEquipo(session.actor), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("WiWO.ADS conexiones del equipo", error instanceof Error ? error.message : "error");
    return fail("No se pudo leer el estado de las conexiones", 500);
  }
}
