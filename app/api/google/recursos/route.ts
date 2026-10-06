import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { GoogleAdsNativoError, listarRecursosDeGoogle } from "@/lib/google-ads-nativo";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

export const dynamic = "force-dynamic";

/** Catálogo de recursos que la API de Google Ads ofrece (para saber qué se puede leer o crear). Solo lectura. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "aprobar_cambios")) return fail("Solo un supervisor o administrador.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  const accountId = (new URL(request.url).searchParams.get("accountId") ?? "").trim();
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || !enAlcance(session.actor, duenio.id)) return fail("Esa cuenta no está en tu alcance", 403);
  try {
    const cred = await accesoNativoGoogle(session.actor, accountId);
    if (!cred) return fail("Google no está conectado para esta cuenta.", 409);
    return Response.json({ recursos: await listarRecursosDeGoogle(cred) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof GoogleAdsNativoError) return fail(error.message, error.status === 401 ? 409 : error.status);
    return fail("No se pudo leer el catálogo", 500);
  }
}
