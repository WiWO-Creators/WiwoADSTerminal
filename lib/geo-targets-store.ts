import { getRawDb } from "@/db";

export type NivelGeo = "region" | "city";

export type GeoTargetEncontrado = {
  id: string;
  nombre: string;
  nombreCanonico: string;
  countryCode: string;
  targetType: string;
};

const LIMITE_MAXIMO = 20;

/** Sin tildes ni mayúsculas, para comparar contra `geo_targets.name`: esa
 * tabla viene del CSV oficial de Google en inglés/sin acentos, así que
 * buscar "Concepción" (con tilde) no encontraba "Concepcion" (sin tilde) —
 * ninguno de los dos lados inventa un caracter, solo se ignora el acento al
 * comparar. */
function sinAcentos(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Quien pide una región casi siempre la nombra "Región de/del/Metropolitana
 * de <nombre>" — pero `geo_targets.name` viene del CSV oficial de Google en
 * inglés y sin ese prefijo ("Maule", no "Región del Maule"; "Santiago
 * Metropolitan Region", no "Región Metropolitana"). Sin quitarlo, la
 * búsqueda de "Región del Maule" no encontraba nada contra "Maule" — el
 * `LIKE` exige que el nombre guardado CONTENGA la consulta completa — y la
 * región pedida quedaba descartada en silencio, cayendo la campaña a
 * segmentar el país entero (confirmado en vivo con Colbún, 2026-09-24).
 */
const PREFIJO_REGION = /^region\s+(?:de\s+la\s+|del\s+|de\s+)?/;

/**
 * Nombre real en español de ciudades cuyo nombre oficial en la tabla de
 * Google es sustancialmente distinto (no solo una tilde) — Google entrega
 * "Mexico City", no "Ciudad de México", y buscar la segunda no encontraba
 * nada. Cada valor es el `name` real y verificado tal como está en
 * `geo_targets` (no un id inventado: el id que se devuelve sigue siendo el
 * de Google, esto solo redirige el término de búsqueda). Lista curada y
 * acotada a los casos que de verdad importan para los mercados que ya
 * atiende la agencia (LatAm) más un puñado de capitales globales conocidas
 * — no pretende cubrir los ~100.000 nombres de la tabla.
 */
const ALIAS_EN_ESPANOL: Record<string, string> = {
  "ciudad de mexico": "Mexico City",
  cdmx: "Mexico City",
  "nueva york": "New York",
  londres: "London",
  paris: "Paris",
  moscu: "Moscow",
  "san petersburgo": "Saint Petersburg",
  "el cairo": "Cairo",
  pekin: "Beijing",
  tokio: "Tokyo",
  "nueva delhi": "New Delhi",
  metropolitana: "Santiago Metropolitan Region",
  amberes: "Antwerp",
  florencia: "Florence",
  napoles: "Naples",
  venecia: "Venice",
  turin: "Turin",
  ginebra: "Geneva",
  copenhague: "Copenhagen",
  filadelfia: "Philadelphia",
  "nueva orleans": "New Orleans",
  "los angeles": "Los Angeles",
  varsovia: "Warsaw",
  viena: "Vienna",
  bruselas: "Brussels",
  atenas: "Athens",
  estocolmo: "Stockholm",
};

/**
 * Busca regiones/estados/provincias o ciudades/comunas reales por texto,
 * contra la tabla `geo_targets` (sembrada desde la misma tabla oficial de
 * Google que ya usa `GOOGLE_GEO_TARGET_IDS`). Sin `query`, no devuelve nada:
 * a diferencia de países (219, cabe mostrarlos todos), acá hay decenas de
 * miles — listarlos sin buscar no tiene sentido y sería carísimo.
 */
export async function buscarGeoTargets(opciones: {
  tier: NivelGeo;
  query: string;
  countryCode?: string | null;
  limite?: number;
}): Promise<GeoTargetEncontrado[]> {
  const texto = opciones.query.trim();
  if (texto.length < 2) return [];
  const limite = Math.min(opciones.limite ?? LIMITE_MAXIMO, LIMITE_MAXIMO);
  const normalizado = sinAcentos(texto).replace(PREFIJO_REGION, "");

  const db = getRawDb();
  const condicionesBase = ["tier = ?"];
  const paramsBase: unknown[] = [opciones.tier];
  if (opciones.countryCode) {
    condicionesBase.push("country_code = ?");
    paramsBase.push(opciones.countryCode.toUpperCase());
  }

  // El alias, si aplica, exige coincidencia exacta de `name` (no LIKE): es
  // un redireccionamiento puntual, no una búsqueda parcial nueva.
  const aliasCoincidente = Object.entries(ALIAS_EN_ESPANOL).find(
    ([clave]) => normalizado.includes(clave) || clave.includes(normalizado),
  );

  const condicionesLike = [...condicionesBase, "name LIKE ? COLLATE NOCASE"];
  const paramsLike = [...paramsBase, `%${normalizado}%`];

  const consultas = [
    db
      .prepare(
        `SELECT id, name, canonical_name, country_code, target_type
         FROM geo_targets
         WHERE ${condicionesLike.join(" AND ")}
         ORDER BY LENGTH(name) ASC, name ASC
         LIMIT ?`,
      )
      .bind(...paramsLike, limite)
      .all<Fila>(),
  ];

  if (aliasCoincidente) {
    const condicionesAlias = [...condicionesBase, "name = ? COLLATE NOCASE"];
    const paramsAlias = [...paramsBase, aliasCoincidente[1]];
    consultas.push(
      db
        .prepare(
          `SELECT id, name, canonical_name, country_code, target_type
           FROM geo_targets
           WHERE ${condicionesAlias.join(" AND ")}
           LIMIT 5`,
        )
        .bind(...paramsAlias)
        .all<Fila>(),
    );
  }

  const resultados = await Promise.all(consultas);
  const vistos = new Set<string>();
  const combinados: GeoTargetEncontrado[] = [];
  for (const resultado of resultados) {
    for (const fila of resultado.results ?? []) {
      if (vistos.has(fila.id)) continue;
      vistos.add(fila.id);
      combinados.push({
        id: fila.id,
        nombre: fila.name,
        nombreCanonico: fila.canonical_name,
        countryCode: fila.country_code,
        targetType: fila.target_type,
      });
    }
  }
  return combinados.slice(0, limite);
}

type Fila = {
  id: string;
  name: string;
  canonical_name: string;
  country_code: string;
  target_type: string;
};
