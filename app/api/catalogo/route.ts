import { getSession } from "@/app/sesion";
import { can } from "@/lib/permisos";
import { PLATFORM, platformLabel } from "@/lib/plataformas";
import { fetchWindsorCatalog, windsorConfigured } from "@/lib/windsor";

/**
 * Catálogo de campañas, conjuntos y anuncios que existen en las cuentas.
 *
 * Vive en su propio endpoint, y no dentro del tablero, porque construirlo
 * obliga a barrer años de historial en Windsor: 116 s en Google y 254 s en
 * Meta, medidos. Nadie puede esperar eso cargando una página, así que el
 * tablero solo lee lo ya construido y aquí se decide cuándo reconstruirlo.
 *
 * GET informa del estado. POST lo reconstruye: es una lectura pesada contra
 * Windsor, no escribe nada en ninguna plataforma.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);

  const hoy = new Date().toISOString().slice(0, 10);
  const catalogo = await fetchWindsorCatalog(hoy);
  return Response.json(resumen(catalogo), { headers: NO_STORE });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  // Construirlo no cambia nada en las plataformas, pero consume cuota de
  // Windsor y tarda minutos: queda en manos de quien administra conexiones.
  if (!can(session.actor, "administrar_conexiones")) {
    return fail("No tienes permiso para reconstruir el catálogo", 403);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fail("Origen no permitido", 403);
  }
  if (!windsorConfigured()) return fail("Falta configurar WINDSOR_API_KEY", 503);

  const hoy = new Date().toISOString().slice(0, 10);
  const catalogo = await fetchWindsorCatalog(hoy, { construir: true });
  return Response.json(resumen(catalogo), { headers: NO_STORE });
}

function resumen(catalogo: Awaited<ReturnType<typeof fetchWindsorCatalog>>) {
  const porPlataforma = Object.keys(PLATFORM)
    .filter((id) => PLATFORM[id as keyof typeof PLATFORM].activa)
    .map((id) => {
      const campanas = catalogo.campanas.filter((c) => c.provider === id);
      const anuncios = catalogo.anuncios.filter((a) => a.provider === id);
      return {
        provider: id,
        plataforma: platformLabel(id),
        campanas: campanas.length,
        conjuntos: new Set(
          anuncios.map((a) => `${a.accountId}::${a.campaignName}::${a.adsetName ?? ""}`),
        ).size,
        anuncios: anuncios.length,
        cuentas: new Set(campanas.map((c) => c.accountId)).size,
      };
    });

  return {
    disponible: catalogo.construidoEn !== null,
    construidoEn: catalogo.construidoEn,
    rango: catalogo.rango,
    totales: {
      campanas: catalogo.campanas.length,
      anuncios: catalogo.anuncios.length,
    },
    porPlataforma,
    fallos: catalogo.fallos.map((f) => ({
      plataforma: platformLabel(f.provider),
      mensaje: f.mensaje,
    })),
  };
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
