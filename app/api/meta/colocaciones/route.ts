import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { colocacionesDeConjuntoMeta, ErrorDeMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { enAlcance, puedeArmarCampanas } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

export const dynamic = "force-dynamic";

/** Qué ubicaciones (feed, stories, reels) cubre un conjunto de Meta, para avisar si un contenido no se vería ahí. Solo lectura. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!puedeArmarCampanas(session.actor)) return fail("Tu rol no arma contenido.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const p = new URL(request.url).searchParams;
  const clienteId = p.get("clienteId") ?? "";
  const accountId = (p.get("accountId") ?? "").trim();
  const conjuntoId = p.get("conjuntoId") ?? "";
  if (!clienteId || !accountId || !/^\d+$/.test(conjuntoId)) return fail("Faltan datos.", 400);
  if (!enAlcance(session.actor, clienteId)) return fail("Ese cliente no está en tu alcance", 403);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || duenio.id !== clienteId) return fail("Esa cuenta no pertenece a este cliente", 403);
  try {
    return Response.json(await colocacionesDeConjuntoMeta(conjuntoId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    return fail("No se pudieron leer las ubicaciones", 500);
  }
}
