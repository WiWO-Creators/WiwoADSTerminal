import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { tokenDeLinkedin } from "@/lib/linkedin-conexion";
import { ubicacionesDeLinkedin } from "@/lib/linkedin-nativo";
import { ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";
import { can } from "@/lib/permisos";

/**
 * Nombre de una o varias ubicaciones de LinkedIn por su id (`?ids=104621616,102927786`). Solo lectura y solo para quien administra
 * conexiones. Sirve para comprobar que un id apunta de verdad al país que se cree antes de segmentar con él.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "administrar_conexiones")) return fail("Tu usuario no tiene permiso para administrar conexiones", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 50 || ids.some((id) => !/^\d{1,15}$/.test(id))) return fail("Indica hasta 50 ids numéricos en «ids».", 400);
  try {
    const ubicaciones = await ubicacionesDeLinkedin(ids, await tokenDeLinkedin(session.actor));
    return Response.json({ ubicaciones }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const estado = error instanceof ErrorDeLinkedin ? error.status : 500;
    const mensaje = error instanceof Error ? error.message : "No se pudieron leer las ubicaciones de LinkedIn";
    console.error("WiWO.ADS ubicaciones linkedin", mensaje);
    return fail(mensaje, estado >= 400 && estado < 600 ? estado : 502);
  }
}
