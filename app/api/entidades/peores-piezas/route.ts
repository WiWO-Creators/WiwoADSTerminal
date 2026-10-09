import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { enAlcance, puedeArmarCampanas } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";
import { peoresPiezasDeCampana } from "@/lib/renovar-piezas";
import { graphJson, metaNativoConfigurado } from "@/lib/meta-nativo";

export const dynamic = "force-dynamic";

/**
 * Los 3 anuncios activos de una campaña de Meta que peor rinden (con el porqué), para elegir cuáles reemplazar al subir contenido
 * nuevo. Solo lectura. La campaña debe ser de la cuenta indicada y la cuenta de un cliente del alcance.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!puedeArmarCampanas(session.actor)) return fail("Tu rol no puede construir campañas", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  const params = new URL(request.url).searchParams;
  const accountId = (params.get("accountId") ?? "").trim();
  const campaignId = (params.get("campaignId") ?? "").trim();
  if (!accountId || !/^\d+$/.test(campaignId)) return fail("Falta la cuenta o la campaña", 400);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || !enAlcance(session.actor, duenio.id)) return fail("Esa cuenta no está en tu alcance", 403);
  if (!metaNativoConfigurado()) return Response.json({ piezas: [], total: 0, comparado: false });
  try {
    // La campaña se lee de Meta: su cuenta y su nombre no se toman de lo que manda el navegador.
    const c = await graphJson<{ name?: string; account_id?: string }>(campaignId, "GET", { fields: "name,account_id" });
    if (String(c.account_id ?? "").replace(/^act_/, "") !== accountId.replace(/\D/g, "")) return fail("Esa campaña no pertenece a esa cuenta", 403);
    const cuenta = await graphJson<{ currency?: string }>(`act_${accountId.replace(/\D/g, "")}`, "GET", { fields: "currency" }).catch(() => ({ currency: undefined }));
    return Response.json(await peoresPiezasDeCampana(campaignId, c.name ?? "", cuenta.currency ?? null), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("WiWO.ADS peores piezas", error instanceof Error ? error.message : "error");
    return fail("No se pudieron leer los anuncios de la campaña", 502);
  }
}
