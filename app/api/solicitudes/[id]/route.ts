import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { mismoOrigen } from "@/lib/origen-publico";
import {
  aprobarSolicitud,
  cancelarSolicitud,
  ErrorDeSolicitud,
  marcarActiva,
  rechazarSolicitud,
} from "@/lib/solicitudes";

export const dynamic = "force-dynamic";

/** Una acción sobre una solicitud: `aprobar`, `rechazar` (con `nota`), `cancelar` o `marcar_activa`. */
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }
  const { id } = await contexto.params;
  const body = (await request.json()) as { accion?: string; nota?: string };
  try {
    let solicitud;
    switch (body.accion) {
      case "aprobar":
        solicitud = await aprobarSolicitud(session.actor, id);
        break;
      case "rechazar":
        solicitud = await rechazarSolicitud(session.actor, id, body.nota ?? "");
        break;
      case "cancelar":
        solicitud = await cancelarSolicitud(session.actor, id);
        break;
      case "marcar_activa":
        solicitud = await marcarActiva(session.actor, id);
        break;
      default:
        return fail("Acción no válida", 400);
    }
    return Response.json({ solicitud }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ErrorDeSolicitud) return fail(error.message, error.status);
    return fail(error instanceof Error ? error.message : "No se pudo completar", 500);
  }
}
