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

  const db = getRawDb();
  const condiciones = ["tier = ?", "name LIKE ? COLLATE NOCASE"];
  const params: unknown[] = [opciones.tier, `%${texto}%`];
  if (opciones.countryCode) {
    condiciones.push("country_code = ?");
    params.push(opciones.countryCode.toUpperCase());
  }

  const resultado = await db
    .prepare(
      `SELECT id, name, canonical_name, country_code, target_type
       FROM geo_targets
       WHERE ${condiciones.join(" AND ")}
       ORDER BY LENGTH(name) ASC, name ASC
       LIMIT ?`,
    )
    .bind(...params, limite)
    .all<{
      id: string;
      name: string;
      canonical_name: string;
      country_code: string;
      target_type: string;
    }>();

  return (resultado.results ?? []).map((fila) => ({
    id: fila.id,
    nombre: fila.name,
    nombreCanonico: fila.canonical_name,
    countryCode: fila.country_code,
    targetType: fila.target_type,
  }));
}
