import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { buscarLugaresPorMapa } from "@/lib/geocoding";
import { buscarGeoTargets, type NivelGeo } from "@/lib/geo-targets-store";
import { puedeArmarCampanas } from "@/lib/permisos";
import { tokensMetaParaBuscarLugares } from "@/lib/integration-store";
import { buscarEnMeta, lugarDeMetaPara, type LugarDeMeta } from "@/lib/meta-geo";

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
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!puedeArmarCampanas(session.actor)) {
    return fail("Tu rol no puede construir campañas", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  }

  const params = new URL(request.url).searchParams;
  const tier = params.get("tier") as NivelGeo | null;
  if (!tier || !TIERS.includes(tier)) {
    return fail("Falta indicar qué tipo de lugar buscar (region o city)", 400);
  }
  const query = params.get("q") ?? "";
  const countryCode = params.get("countryCode");
  // Países ya elegidos en la cuenta/campaña — un nombre repetido en el mundo
  // (hay un "Santiago" en Chile, Brasil, España, Cuba...) queda ordenado con
  // esos primero, sin dejar de mostrar los demás.
  const paisesPreferidos = new Set(
    (params.get("paisesPreferidos") ?? "")
      .split(",")
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean),
  );
  const priorizar = <T extends { countryCode: string }>(lista: T[]): T[] =>
    paisesPreferidos.size === 0
      ? lista
      : [...lista].sort(
          (a, b) =>
            Number(paisesPreferidos.has(b.countryCode)) -
            Number(paisesPreferidos.has(a.countryCode)),
        );

  try {
    // Meta, en paralelo: su `key` real de región o ciudad. Si falla (sin conexión, token vencido), se sigue sin él.
    const tokensMeta = await tokensMetaParaBuscarLugares(session.actor);
    const deMeta: Promise<LugarDeMeta[]> = (async () => {
      let ultimoError: unknown = null;
      for (const token of tokensMeta) {
        try {
          return await buscarEnMeta(token, { tipo: tier, texto: query, countryCode, limite: 15 });
        } catch (error) {
          ultimoError = error; // se prueba con el siguiente token; solo se avisa si ninguno sirve
        }
      }
      if (ultimoError) console.error("WiWO.ADS búsqueda de ubicaciones en Meta", ultimoError instanceof Error ? ultimoError.message : ultimoError);
      return [] as LugarDeMeta[];
    })();
    const [deGoogle, lugaresMeta] = await Promise.all([buscarGeoTargets({ tier, query, countryCode }), deMeta]);
    const resultados = priorizar(deGoogle).map((r) => {
      const m = lugarDeMetaPara(lugaresMeta, r.nombre, r.countryCode);
      return m ? { ...r, metaKey: m.key } : r;
    });
    if (resultados.length > 0) {
      return Response.json({ resultados }, { headers: NO_STORE });
    }
    // Google no lo tiene pero Meta sí: se ofrece con el key real de Meta (sin id de Google, queda «solo Meta»).
    if (lugaresMeta.length > 0) {
      const soloMeta = priorizar(
        lugaresMeta.map((l) => ({
          id: `meta:${l.key}`,
          nombre: l.nombre,
          nombreCanonico: l.region ? `${l.nombre}, ${l.region}` : l.nombre,
          countryCode: l.countryCode,
          targetType: l.tipo,
          metaKey: l.key,
        })),
      );
      return Response.json({ resultados: soloMeta, soloMeta: true }, { headers: NO_STORE });
    }
    // La lista de Google es curada y bastante más angosta que lo que Meta
    // Ads Manager reconoce (pueblos, colonias, localidades chicas) — cuando
    // no hay nada, se busca contra Nominatim/OpenStreetMap en vez de dejar
    // la búsqueda en seco. Estos resultados nunca tienen un id real de
    // Google: ya vienen con lat/lng/radio resueltos, listos para Meta.
    const porMapa = priorizar(await buscarLugaresPorMapa(query, tier));
    return Response.json({ resultados: porMapa, soloMeta: porMapa.length > 0 }, { headers: NO_STORE });
  } catch (error) {
    console.error("WiWO.ADS geo-targets", error);
    return fail("No se pudo buscar el lugar", 500);
  }
}

