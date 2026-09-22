import { getSession } from "@/app/sesion";
import { buscarGeoTargets, type NivelGeo } from "@/lib/geo-targets-store";
import { can } from "@/lib/permisos";

/**
 * Busca regiones/estados/provincias o ciudades/comunas reales de Google Ads
 * por texto, para el selector de segmentación geográfica del Constructor.
 * Mismo alcance por permisos que el resto del Constructor: no es una
 * búsqueda genérica, es parte de armar una campaña.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const TIERS: NivelGeo[] = ["region", "city"];

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "crear_campanas")) {
    return fail("Tu rol no puede construir campañas", 403);
  }

  const params = new URL(request.url).searchParams;
  const tier = params.get("tier") as NivelGeo | null;
  if (!tier || !TIERS.includes(tier)) {
    return fail("Falta indicar qué tipo de lugar buscar (region o city)", 400);
  }
  const query = params.get("q") ?? "";
  const countryCode = params.get("countryCode");

  try {
    const resultados = await buscarGeoTargets({ tier, query, countryCode });
    return Response.json({ resultados }, { headers: NO_STORE });
  } catch (error) {
    console.error("WiWO.ADS geo-targets", error);
    return fail("No se pudo buscar el lugar", 500);
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
