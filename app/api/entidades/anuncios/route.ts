import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { fetchDetalleDeCuenta } from "@/lib/detalle-entidad-store";
import { enAlcance, puedeArmarCampanas } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";
import { WindsorError } from "@/lib/windsor";

/**
 * Anuncios ya publicados de una cuenta de Meta, con el id de la publicación que
 * usa cada uno: lo que el Constructor necesita para impulsarlos (`boost_post`).
 * Solo lectura. Mismo alcance por cliente que el resto del Constructor.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!puedeArmarCampanas(session.actor)) {
    return fail("Tu rol no puede construir campañas", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  }

  const params = new URL(request.url).searchParams;
  const portfolioId = params.get("portfolioId") ?? "";
  const accountId = (params.get("accountId") ?? "").trim();
  if (!portfolioId || !accountId) return fail("Falta identificar el cliente o la cuenta de Meta", 400);
  if (!enAlcance(session.actor, portfolioId)) return fail("Ese cliente no está en tu alcance", 403);

  // La cuenta la dice el navegador: debe ser una de este cliente.
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || duenio.id !== portfolioId) return fail("Esa cuenta no pertenece a este cliente", 403);

  try {
    const detalle = await fetchDetalleDeCuenta("meta", accountId);
    const campanas = new Map(detalle.campanas.map((c) => [c.id, c.nombre]));
    const conjuntos = new Map(detalle.conjuntos.map((c) => [c.id, c.nombre]));
    const anuncios = detalle.anuncios
      .filter((a) => a.publicacion.id)
      .map((a) => ({
        id: a.id,
        nombre: a.nombre,
        estado: a.estado,
        postId: a.publicacion.id,
        reusaPublicacion: a.publicacion.existente,
        miniatura: a.contenido.miniaturaUrl ?? a.contenido.imagenUrl,
        texto: a.contenido.textoPrincipal,
        campana: a.campaignId ? (campanas.get(a.campaignId) ?? null) : null,
        conjunto: a.conjuntoId ? (conjuntos.get(a.conjuntoId) ?? null) : null,
      }));
    return Response.json({ anuncios, avisos: detalle.avisos }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof WindsorError) {
      return fail("Windsor no respondió a tiempo. Intenta de nuevo en un momento.", 502);
    }
    console.error("WiWO.ADS anuncios para impulsar", error);
    return fail("No se pudieron leer los anuncios", 500);
  }
}
