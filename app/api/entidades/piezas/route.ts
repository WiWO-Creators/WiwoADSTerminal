import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { enAlcance, puedeArmarCampanas } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";
import { conjuntoEsDeLasCuentas, piezasDelConjunto } from "@/lib/renovar-piezas";

export const dynamic = "force-dynamic";

/**
 * Los anuncios activos de un conjunto de Meta (más viejos primero, con su rendimiento de 30 días), para elegir cuáles retirar al
 * subir contenido nuevo. Solo lectura. El conjunto debe pertenecer a la cuenta indicada, y la cuenta a un cliente del alcance.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!puedeArmarCampanas(session.actor)) return fail("Tu rol no puede construir campañas", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  const params = new URL(request.url).searchParams;
  const accountId = (params.get("accountId") ?? "").trim();
  const conjuntoId = (params.get("conjuntoId") ?? "").trim();
  if (!accountId || !/^\d+$/.test(conjuntoId)) return fail("Falta la cuenta o el conjunto", 400);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || !enAlcance(session.actor, duenio.id)) return fail("Esa cuenta no está en tu alcance", 403);
  if (!(await conjuntoEsDeLasCuentas(conjuntoId, [accountId]))) return fail("Ese conjunto no pertenece a esa cuenta", 403);
  try {
    return Response.json({ piezas: await piezasDelConjunto(conjuntoId) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("WiWO.ADS piezas del conjunto", error instanceof Error ? error.message : "error");
    return fail("No se pudieron leer los anuncios del conjunto", 502);
  }
}
