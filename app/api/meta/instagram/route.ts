import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { registrarEjecucion } from "@/lib/constructor-ejecutar";
import { crearAnuncioDesdeInstagram, ErrorDeMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { mismoOrigen } from "@/lib/origen-publico";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, listPortfolios, normalizeAccountId } from "@/lib/portafolios-store";

/**
 * Impulsar una publicación de Instagram: crea un anuncio dentro de un conjunto existente, con la API de Meta directa.
 * Solo supervisores y administradores. Queda activo (decisión del equipo: la revisión es la aprobación previa).
 */
export const dynamic = "force-dynamic";

type Cuerpo = { portfolioId?: string; accountId?: string; conjuntoId?: string; mediaId?: string; nombre?: string };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "aprobar_cambios")) return fail("Solo un supervisor o administrador puede crear anuncios.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!metaNativoConfigurado()) return fail("La conexión directa con Meta todavía no está configurada.", 503);
  const b = (await request.json()) as Cuerpo;
  const accountId = (b.accountId ?? "").trim();
  if (!b.portfolioId || !accountId || !b.conjuntoId || !b.mediaId) return fail("Faltan datos: cliente, cuenta, conjunto y publicación.", 400);
  if (!enAlcance(session.actor, b.portfolioId)) return fail("Ese cliente no está en tu alcance", 403);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || duenio.id !== b.portfolioId) return fail("Esa cuenta no pertenece a este cliente", 403);
  const cliente = (await listPortfolios()).find((p) => p.id === b.portfolioId);
  if (!cliente?.instagramId) return fail("Este cliente no tiene su cuenta de Instagram declarada.", 409);
  const nombre = (b.nombre ?? "").trim() || "Impulso de Instagram";
  try {
    const r = await crearAnuncioDesdeInstagram(accountId, {
      nombre,
      conjuntoId: b.conjuntoId,
      instagramUserId: cliente.instagramId,
      mediaId: b.mediaId,
      paginaId: cliente.accountPages[accountId] ?? cliente.pageId,
    });
    await registrarEjecucion(
      { portfolioId: b.portfolioId, name: nombre, platforms: ["meta"] },
      session.actor.email,
      [{ platform: "meta", action: "ads:create_from_instagram", label: nombre, ok: true, error: null, raw: r } as never],
      true,
    );
    return Response.json({ ...r, estado: "PAUSED", enlace: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${r.anuncioId}` }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ErrorDeMeta) return fail(error.message, error.status);
    console.error("WiWO.ADS impulso de Instagram", error);
    return fail("No se pudo crear el anuncio", 500);
  }
}
