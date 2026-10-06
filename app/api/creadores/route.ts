import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { creadoresDelCliente, ErrorDeCreadores } from "@/lib/creadores-store";

/**
 * Quién creó cada campaña, conjunto y anuncio de un cliente, según la bitácora
 * de lo publicado desde WiWO.ADS. Solo lectura, acotada al alcance de quien pregunta.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const cliente = new URL(request.url).searchParams.get("cliente") ?? "";
  if (!cliente) return fail("Falta el cliente", 400);
  try {
    const creadores = await creadoresDelCliente(session.actor, cliente);
    return Response.json({ creadores }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ErrorDeCreadores) return Response.json({ error: error.message }, { status: error.status });
    console.error("WiWO.ADS creadores", error);
    return fail("No se pudieron leer los creadores", 500);
  }
}
