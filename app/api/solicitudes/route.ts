import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import type { CampaignDraft } from "@/lib/constructor";
import { mismoOrigen } from "@/lib/origen-publico";
import {
  crearSolicitud,
  crearSolicitudDeInstagram,
  type ImpulsoDeInstagram,
  resumenDeSolicitudes,
  ErrorDeSolicitud,
  listarSolicitudes,
  marcarComoLeidas,
  revisarActivaciones,
} from "@/lib/solicitudes";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

/** Las solicitudes de esta persona (y las que le toca revisar). `?revisar=1` comprueba si algo ya quedó activo. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("resumen") === "1") {
      return Response.json(await resumenDeSolicitudes(session.actor), { headers: NO_STORE });
    }
    if (url.searchParams.get("revisar") === "1") await revisarActivaciones(session.actor);
    const datos = await listarSolicitudes(session.actor);
    return Response.json(datos, { headers: NO_STORE });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "No se pudieron leer las solicitudes", 500);
  }
}

/** Crea una solicitud (`{ drafts: [...] }`) o marca las novedades como vistas (`{ leidas: true }`). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }
  const body = (await request.json()) as { drafts?: Array<Partial<CampaignDraft>>; impulsosInstagram?: ImpulsoDeInstagram[]; leidas?: boolean };
  try {
    if (body.leidas) {
      await marcarComoLeidas(session.actor);
      return Response.json({ ok: true }, { headers: NO_STORE });
    }
    if (body.impulsosInstagram?.length) {
      const marcados = body.impulsosInstagram.map((i) => ({ ...i, __instagram: true as const }));
      return Response.json({ solicitud: await crearSolicitudDeInstagram(session.actor, marcados) }, { status: 201, headers: NO_STORE });
    }
    const solicitud = await crearSolicitud(session.actor, body.drafts ?? []);
    return Response.json({ solicitud }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof ErrorDeSolicitud) return fail(error.message, error.status);
    return fail(error instanceof Error ? error.message : "No se pudo enviar", 500);
  }
}
