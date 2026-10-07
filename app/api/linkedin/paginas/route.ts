import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { tokenDeLinkedin } from "@/lib/linkedin-conexion";
import { paginasDeLinkedin } from "@/lib/linkedin-nativo";
import { ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";
import { can } from "@/lib/permisos";

/**
 * Las páginas de empresa de LinkedIn sobre las que la persona conectada tiene un rol. Solo lectura y solo para quien
 * administra conexiones. Responde «¿en nombre de qué página puedo crear anuncios?». Nunca devuelve el token.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "administrar_conexiones")) return fail("Tu usuario no tiene permiso para administrar conexiones", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  try {
    const paginas = await paginasDeLinkedin(await tokenDeLinkedin(session.actor));
    return Response.json({ paginas }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const estado = error instanceof ErrorDeLinkedin ? error.status : 500;
    const mensaje = error instanceof Error ? error.message : "No se pudieron leer las páginas de LinkedIn";
    console.error("WiWO.ADS páginas linkedin", mensaje);
    return fail(mensaje, estado >= 400 && estado < 600 ? estado : 502);
  }
}
