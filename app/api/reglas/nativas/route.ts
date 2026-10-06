import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { listarReglasNativas } from "@/lib/reglas-nativas";

export const dynamic = "force-dynamic";

/** Reglas que ya existen dentro de las plataformas, por cliente y cuenta. Solo lectura. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const clienteId = new URL(request.url).searchParams.get("clienteId");
  return Response.json(await listarReglasNativas(session.actor, clienteId), { headers: { "cache-control": "no-store" } });
}
