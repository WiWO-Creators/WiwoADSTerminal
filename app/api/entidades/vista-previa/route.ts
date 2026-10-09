import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { FORMATOS_DE_VISTA_PREVIA, metaNativoConfigurado, vistaPreviaDeAnuncio, type FormatoDeVistaPrevia } from "@/lib/meta-nativo";
import { enAlcance } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

export const dynamic = "force-dynamic";

/** La vista previa real que Meta arma de un anuncio (iframe de Meta), en el formato pedido. Solo lectura. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const p = new URL(request.url).searchParams;
  const accountId = (p.get("accountId") ?? "").trim();
  const id = (p.get("id") ?? "").trim();
  const formato = (p.get("formato") ?? "MOBILE_FEED_STANDARD") as FormatoDeVistaPrevia;
  if (!accountId || !/^\d+$/.test(id)) return fail("Faltan la cuenta o el anuncio", 400);
  if (!(formato in FORMATOS_DE_VISTA_PREVIA)) return fail("Formato no válido", 400);
  if (!metaNativoConfigurado()) return fail("La lectura directa de Meta no está configurada", 503);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || !enAlcance(session.actor, duenio.id)) return fail("Esa cuenta no está en tu alcance", 403);
  try {
    const vista = await vistaPreviaDeAnuncio(id, formato);
    return Response.json({ url: vista?.url ?? null, ancho: vista?.ancho ?? null, alto: vista?.alto ?? null }, { headers: { "cache-control": "private, max-age=300" } });
  } catch {
    return Response.json({ url: null }, { headers: { "cache-control": "no-store" } });
  }
}
