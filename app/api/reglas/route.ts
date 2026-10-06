import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { mismoOrigen } from "@/lib/origen-publico";
import { cambiarRegla, crearRegla, ErrorDeRegla, evaluarReglas, listarReglas, type EntradaDeRegla } from "@/lib/reglas-automaticas";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  return Response.json({ reglas: await listarReglas(session.actor) }, { headers: NO_STORE });
}

/** `{ regla }` crea; `{ evaluar: true }` evalúa y ejecuta; `{ id, activa | rearmar | borrar }` cambia una regla. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }
  const body = (await request.json()) as { regla?: EntradaDeRegla; evaluar?: boolean; id?: string; activa?: boolean; rearmar?: boolean; borrar?: boolean };
  try {
    if (body.evaluar) return Response.json(await evaluarReglas(session.actor), { headers: NO_STORE });
    if (body.regla) return Response.json({ regla: await crearRegla(session.actor, body.regla) }, { status: 201, headers: NO_STORE });
    if (body.id) {
      await cambiarRegla(session.actor, body.id, { activa: body.activa, rearmar: body.rearmar, borrar: body.borrar });
      return Response.json({ ok: true }, { headers: NO_STORE });
    }
    return fail("Pedido no válido", 400);
  } catch (error) {
    if (error instanceof ErrorDeRegla) return fail(error.message, error.status);
    console.error("WiWO.ADS reglas", error);
    return fail(error instanceof Error ? error.message : "No se pudo completar", 500);
  }
}
