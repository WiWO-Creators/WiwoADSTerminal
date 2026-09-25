import { getRawDb } from "@/db";
import { RADIO_MAXIMO_KM, RADIO_MINIMO_KM } from "@/lib/constructor";

/**
 * Meta no expone, a través de Windsor, una forma de buscar sus propios ids de
 * región/ciudad (son un sistema aparte del de Google) — así que la única
 * segmentación real que Meta acepta para un lugar así es un círculo
 * (`geo_locations.custom_locations`, lat/lng + radio, 1-80 km, ya verificado
 * en `RADIO_MINIMO_KM`/`RADIO_MAXIMO_KM`). Esta función resuelve esas
 * coordenadas de verdad contra Nominatim (OpenStreetMap) — la misma fuente
 * que ya dibuja el mapa del selector — en vez de inventar un centro o un
 * radio fijo.
 *
 * El radio sale del cuadro delimitador (`boundingbox`) real que devuelve
 * Nominatim para ese lugar, no de una constante adivinada: una comuna chica
 * y una región entera dan radios muy distintos porque miden cosas muy
 * distintas. Para una región más grande que el máximo que Meta acepta
 * (80 km), el círculo queda acotado ahí — es una aproximación real, no una
 * cobertura exacta de toda la región; quien arma la campaña lo ve marcado en
 * el Constructor.
 */
export type CoordenadasDeLugar = { lat: number; lng: number; radiusKm: number; aproximado: boolean };

const CACHE_KEY = "geocode_v1";
// Nominatim exige un User-Agent descriptivo que identifique la app — sin
// esto, o con uno genérico, rechaza la consulta.
const USER_AGENT = "WiWO.ADS/1.0 (agencia de medios pagados; segmentacion por radio en Meta Ads)";

function claveDeCache(nombre: string, countryCode: string): string {
  return `${CACHE_KEY}:${countryCode.toUpperCase()}:${nombre.trim().toLowerCase()}`;
}

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type LugarEncontradoPorMapa = {
  /** Sintético (`osm:<place_id>`), nunca un id real de Google — Google Ads
   * solo puede segmentar por un lugar de su propia lista curada de destinos
   * geográficos, y estos vienen de una fuente completamente distinta
   * (Nominatim/OpenStreetMap). Quien arma el plan filtra por esto para no
   * mandarle a Google un id que no le pertenece. */
  id: string;
  nombre: string;
  nombreCanonico: string;
  countryCode: string;
  tier: NivelGeoAproximado;
  lat: number;
  lng: number;
  radiusKm: number;
  aproximado: boolean;
};

export type NivelGeoAproximado = "region" | "city";

// Solo la división administrativa más alta cuenta como "región" acá —
// county/municipality (como "Tabasco, Zacatecas", que Nominatim clasifica
// como county pero tanto Meta como el habla común llaman "ciudad") caen en
// "city" más abajo, no en este set.
const TIPOS_DE_REGION = new Set(["state", "province", "region"]);

/**
 * Busca lugares reales por texto contra Nominatim/OpenStreetMap — pensada
 * como respaldo cuando `buscarGeoTargets` (la lista curada de Google) no
 * encuentra nada, para que la búsqueda de todos modos recomiende algo, igual
 * que hace el buscador de ubicaciones de Meta Ads Manager (que no está
 * limitado a la lista de Google). Nunca aporta un id real de Google: lo que
 * encuentra acá solo puede segmentar a Meta, con el mismo círculo
 * lat/lng/radio que ya arma `geocodificarLugar`.
 */
export async function buscarLugaresPorMapa(
  query: string,
  tier: NivelGeoAproximado,
): Promise<LugarEncontradoPorMapa[]> {
  const texto = query.trim();
  if (texto.length < 2) return [];

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: texto,
      addressdetails: "1",
      limit: "8",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return [];
    const resultados = (await response.json()) as Array<{
      place_id: number;
      lat: string;
      lon: string;
      display_name: string;
      addresstype?: string;
      boundingbox: [string, string, string, string];
      address?: { country_code?: string };
    }>;

    const salida: LugarEncontradoPorMapa[] = [];
    for (const item of resultados) {
      const countryCode = item.address?.country_code?.toUpperCase();
      if (!countryCode) continue;
      const tierReal: NivelGeoAproximado = TIPOS_DE_REGION.has(item.addresstype ?? "")
        ? "region"
        : "city";
      // Se respeta la pestaña que la persona ya eligió (región o ciudad) en
      // vez de reclasificar sola: evita mezclar un estado en una búsqueda de
      // "Ciudad / Comuna" solo porque Nominatim lo etiquetó distinto.
      if (tierReal !== tier) continue;

      const [sur, norte, oeste, este] = item.boundingbox.map(Number);
      const radioReal = distanciaKm(sur, oeste, norte, este) / 2;
      const nombreCorto = item.display_name.split(",")[0]?.trim() || item.display_name;
      salida.push({
        id: `osm:${item.place_id}`,
        nombre: nombreCorto,
        nombreCanonico: item.display_name,
        countryCode,
        tier: tierReal,
        lat: Number(item.lat),
        lng: Number(item.lon),
        radiusKm: Math.min(Math.max(radioReal, RADIO_MINIMO_KM), RADIO_MAXIMO_KM),
        aproximado: radioReal > RADIO_MAXIMO_KM,
      });
    }
    return salida;
  } catch (error) {
    console.error("WiWO.ADS buscarLugaresPorMapa", error);
    return [];
  }
}

/**
 * Coordenadas y radio reales de una región/ciudad, con caché en `app_meta`
 * (los lugares se repiten entre campañas: sin caché, cada selección volvería
 * a golpear Nominatim). `null` si Nominatim no encuentra el lugar — nunca se
 * inventa un centro aproximado.
 */
export async function geocodificarLugar(
  nombre: string,
  countryCode: string,
): Promise<CoordenadasDeLugar | null> {
  const db = getRawDb();
  const clave = claveDeCache(nombre, countryCode);

  try {
    const cacheado = await db
      .prepare("SELECT value FROM app_meta WHERE key = ? LIMIT 1")
      .bind(clave)
      .first<{ value: string }>();
    if (cacheado) return JSON.parse(cacheado.value) as CoordenadasDeLugar;
  } catch (error) {
    console.error("WiWO.ADS geocodificarLugar (caché)", error);
  }

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: nombre,
      countrycodes: countryCode.toLowerCase(),
      limit: "1",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return null;
    const resultados = (await response.json()) as Array<{
      lat: string;
      lon: string;
      boundingbox: [string, string, string, string];
    }>;
    const primero = resultados[0];
    if (!primero) return null;

    const lat = Number(primero.lat);
    const lng = Number(primero.lon);
    const [sur, norte, oeste, este] = primero.boundingbox.map(Number);
    const radioReal = distanciaKm(sur, oeste, norte, este) / 2;
    const radiusKm = Math.min(Math.max(radioReal, RADIO_MINIMO_KM), RADIO_MAXIMO_KM);
    const coordenadas: CoordenadasDeLugar = {
      lat,
      lng,
      radiusKm,
      aproximado: radioReal > RADIO_MAXIMO_KM,
    };

    try {
      await db
        .prepare(
          `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value,
             updated_at = excluded.updated_at`,
        )
        .bind(clave, JSON.stringify(coordenadas), Date.now())
        .run();
    } catch (error) {
      // Cortesía de caché — perderla no debe tumbar la geocodificación real.
      console.error("WiWO.ADS geocodificarLugar (guardar caché)", error);
    }

    return coordenadas;
  } catch (error) {
    console.error("WiWO.ADS geocodificarLugar", error);
    return null;
  }
}
