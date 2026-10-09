import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { leerDetalleParaMostrar } from "@/lib/detalle-entidad-store";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { enAlcance, puedeArmarCampanas } from "@/lib/permisos";
import { isActivePlatform } from "@/lib/plataformas";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";
import { WindsorError } from "@/lib/windsor";

/**
 * Campañas, conjuntos y (con `?anuncios=1`) anuncios ya publicados de una cuenta, para elegir adónde impulsar o qué
 * vigilar con una regla. Meta por defecto; `provider=google` también. Solo lectura.
 */
export const dynamic = "force-dynamic";

/** Google no da nombre a los anuncios: en el árbol se identifican por su primer titular. */
function nombreDeAnuncio(a: { contenido: { titulares: Array<{ texto: string }>; visual?: { titulares: string[] } | null } }): string | null {
  return a.contenido.titulares[0]?.texto ?? a.contenido.visual?.titulares[0] ?? null;
}
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
  const provider = params.get("provider") ?? "meta";
  if (!isActivePlatform(provider)) return fail("Plataforma no reconocida", 400);
  if (!portfolioId || !accountId) return fail("Falta identificar el cliente o la cuenta", 400);
  if (!enAlcance(session.actor, portfolioId)) return fail("Ese cliente no está en tu alcance", 403);
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  if (!duenio || duenio.id !== portfolioId) return fail("Esa cuenta no pertenece a este cliente", 403);

  try {
    const credencialesGoogle = provider === "google" ? await accesoNativoGoogle(session.actor, accountId) : null;
    const d = await leerDetalleParaMostrar(provider, accountId, { credencialesGoogle, permitirViejo: true }).datos;
    return Response.json(
      {
        campanas: d.campanas.map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado, objetivo: c.objetivo })),
        conjuntos: d.conjuntos.map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado, campaignId: c.campaignId })),
        anuncios:
          params.get("anuncios") === "1"
            ? d.anuncios.map((a) => ({ id: a.id, nombre: a.nombre ?? nombreDeAnuncio(a), estado: a.estado, campaignId: a.campaignId, conjuntoId: a.conjuntoId }))
            : undefined,
        // Performance Max no tiene grupos de anuncios: sus grupos de recursos hacen de «conjunto» en el árbol.
        gruposDeRecursos: (d.gruposDeRecursos ?? []).map((g) => ({ id: g.id, nombre: g.nombre, estado: g.estado, campaignId: g.campaignId })),
        avisos: d.avisos,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof WindsorError) return fail("Windsor no respondió a tiempo. Intenta de nuevo en un momento.", 502);
    console.error("WiWO.ADS árbol de cuenta", error);
    return fail("No se pudieron leer las campañas", 500);
  }
}
