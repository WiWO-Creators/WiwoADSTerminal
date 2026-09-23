import { getSession } from "@/app/sesion";
import { geocodificarLugar } from "@/lib/geocoding";
import { can } from "@/lib/permisos";

/**
 * Resuelve una región/ciudad ya elegida a lat/lng/radio real, para que Meta
 * —que no tiene su propio id de región/ciudad vía Windsor— también pueda
 * segmentar por ese lugar (con un círculo, `geo_locations.custom_locations`).
 * Se llama una sola vez, al momento de elegir el lugar en el selector, no en
 * cada letra de la búsqueda: así no se golpea Nominatim de más.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "crear_campanas")) {
    return fail("Tu rol no puede construir campañas", 403);
  }

  const params = new URL(request.url).searchParams;
  const nombre = params.get("nombre") ?? "";
  const countryCode = params.get("countryCode") ?? "";
  if (!nombre.trim() || !countryCode.trim()) {
    return fail("Falta el nombre o el país del lugar", 400);
  }

  try {
    const coordenadas = await geocodificarLugar(nombre, countryCode);
    return Response.json({ coordenadas }, { headers: NO_STORE });
  } catch (error) {
    console.error("WiWO.ADS geo-targets/geocode", error);
    return fail("No se pudo ubicar el lugar", 500);
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
