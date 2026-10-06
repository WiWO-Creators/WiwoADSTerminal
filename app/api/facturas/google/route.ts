import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { GoogleAdsNativoError, listarFacturasGoogle } from "@/lib/google-ads-nativo";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

/** Facturas de Google Ads de un mes (solo cuentas con facturación mensual). Solo lectura; supervisores y administradores. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "aprobar_cambios")) return fail("Las facturas las ven administradores y supervisores", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  const p = new URL(request.url).searchParams;
  const portfolioId = p.get("portfolioId") ?? "";
  const accountId = (p.get("accountId") ?? "").trim();
  const anio = Number(p.get("anio"));
  const mes = Number(p.get("mes"));
  if (!portfolioId || !accountId) return fail("Falta el cliente o la cuenta", 400);
  if (!enAlcance(session.actor, portfolioId)) return fail("Ese cliente no está en tu alcance", 403);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || duenio.id !== portfolioId) return fail("Esa cuenta no pertenece a este cliente", 403);
  try {
    const cred = await accesoNativoGoogle(session.actor, accountId);
    if (!cred) return fail("Google no está conectado para esta cuenta.", 409);
    const facturas = await listarFacturasGoogle(cred, accountId, anio, mes);
    // La URL del PDF exige la autorización de Google: no se entrega al navegador.
    return Response.json({ facturas: facturas.map((f) => ({ ...f, pdfUrl: undefined, tienePdf: Boolean(f.pdfUrl) })) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof GoogleAdsNativoError) {
      console.error("WiWO.ADS facturas Google", error.status, JSON.stringify(error.detalle).slice(0, 600));
      return fail(error.message, error.status === 401 ? 409 : error.status);
    }
    console.error("WiWO.ADS facturas Google", error);
    return fail("No se pudieron leer las facturas", 500);
  }
}
