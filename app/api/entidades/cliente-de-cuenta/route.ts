import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { enAlcance } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

export const dynamic = "force-dynamic";

/** El cliente al que pertenece una cuenta publicitaria, si esta persona puede verlo. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const accountId = (new URL(request.url).searchParams.get("accountId") ?? "").trim();
  if (!accountId) return fail("Falta la cuenta", 400);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || !enAlcance(session.actor, duenio.id)) return fail("Esa cuenta no está en tu alcance", 403);
  return Response.json({ portfolioId: duenio.id }, { headers: { "cache-control": "no-store" } });
}
