/**
 * Búsqueda de ubicaciones con la API oficial de Meta (`GET /search?type=adgeolocation`): devuelve el `key` REAL de cada
 * región o ciudad (por ejemplo, la región del Maule es `672`), que es lo que Meta pide en `geo_locations.regions` y
 * `geo_locations.cities`. Antes WiWO.ADS solo sabía ubicar un lugar con latitud, longitud y un radio aproximado.
 *
 * El catálogo de lugares de Meta no es información de ningún cliente, así que alcanza con una conexión de Meta del
 * equipo con permiso de lectura. Este archivo es puro salvo `buscarEnMeta`, que recibe el token y hace la llamada.
 */
export type TipoMeta = "region" | "city";

export type LugarDeMeta = {
  /** El `key` de Meta (texto numérico). */
  key: string;
  nombre: string;
  tipo: TipoMeta;
  countryCode: string;
  /** Región a la que pertenece una ciudad, para mostrarla («Talca · Maule»). */
  region: string | null;
};

type FilaMeta = {
  key?: string;
  name?: string;
  type?: string;
  country_code?: string;
  region?: string;
};

/** Interpreta la respuesta de `adgeolocation`; ignora filas incompletas o de otro tipo. */
export function interpretarLugaresDeMeta(cuerpo: unknown, tipo: TipoMeta): LugarDeMeta[] {
  const datos = (cuerpo as { data?: FilaMeta[] } | null)?.data;
  if (!Array.isArray(datos)) return [];
  const resultado: LugarDeMeta[] = [];
  for (const f of datos) {
    if (!f?.key || !f.name || f.type !== tipo || !f.country_code) continue;
    resultado.push({ key: String(f.key), nombre: f.name, tipo, countryCode: f.country_code.toUpperCase(), region: f.region ?? null });
  }
  return resultado;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El lugar de Meta que corresponde a un nombre de Google (mismo país, mismo nombre sin tildes, o uno contiene al otro). */
export function lugarDeMetaPara(
  lugares: LugarDeMeta[],
  nombre: string,
  countryCode: string,
): LugarDeMeta | null {
  const buscado = sinTildes(nombre.replace(/^(región|region|provincia|comuna|estado)( del| de la| de)?\s+/i, ""));
  const delPais = lugares.filter((l) => l.countryCode === countryCode.toUpperCase());
  const exacto = delPais.find((l) => sinTildes(l.nombre) === buscado);
  if (exacto) return exacto;
  const parecidos = delPais.filter((l) => {
    const n = sinTildes(l.nombre);
    return n.includes(buscado) || buscado.includes(n);
  });
  // Solo si es inequívoco: con varios candidatos no se adivina.
  return parecidos.length === 1 ? parecidos[0] : null;
}

const VERSION = "v26.0";

/** Busca regiones o ciudades en Meta por texto. Lanza si Meta rechaza el token o no responde. */
export async function buscarEnMeta(
  token: string,
  opciones: { tipo: TipoMeta; texto: string; countryCode?: string | null; limite?: number },
): Promise<LugarDeMeta[]> {
  const q = opciones.texto.trim();
  if (q.length < 2) return [];
  const url = new URL(`https://graph.facebook.com/${VERSION}/search`);
  url.searchParams.set("type", "adgeolocation");
  url.searchParams.set("q", q);
  url.searchParams.set("location_types", JSON.stringify([opciones.tipo]));
  if (opciones.countryCode) url.searchParams.set("country_code", opciones.countryCode.toUpperCase());
  url.searchParams.set("limit", String(opciones.limite ?? 10));
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) {
    const mensaje = (cuerpo as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${r.status}`;
    throw new Error(`Meta rechazó la búsqueda de ubicaciones: ${mensaje}`);
  }
  return interpretarLugaresDeMeta(cuerpo, opciones.tipo);
}
