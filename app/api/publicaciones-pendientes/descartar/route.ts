import { getSession } from "@/app/sesion";
import { descartarPendiente } from "@/lib/publicaciones-pendientes";
import { can } from "@/lib/permisos";

/**
 * Deja de mostrar una campaña/anuncio "pendiente de sincronizar" — el
 * escape manual para cuando de verdad se borró en la plataforma real. Esta
 * app no tiene su propia acción para borrar campañas, así que no hay forma
 * de saberlo sola (ver `lib/publicaciones-pendientes.ts`). No toca ninguna
 * plataforma: solo deja de ofrecer esta fila sintética acá adentro.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "aprobar_cambios")) {
    return fail("Este rol no puede descartar campañas pendientes", 403);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fail("Origen no permitido", 403);
  }

  try {
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    if (ids.length === 0) return fail("Falta el id a descartar", 400);
    await Promise.all(ids.map((id) => descartarPendiente(id)));
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("WiWO.ADS publicaciones-pendientes/descartar", error);
    return fail("No se pudo descartar", 500);
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
