/**
 * Quién creó cada campaña, conjunto o anuncio. Puro (sin red ni base de datos).
 *
 * Ni Google ni Meta entregan el autor por Windsor, así que la única fuente
 * confiable es la bitácora de `ejecuciones`: lo que se publicó desde WiWO.ADS
 * queda con quien lo publicó. Lo creado directamente en la plataforma (o antes
 * de que existiera la bitácora) no tiene autor conocido y se muestra sin dato:
 * no se adivina.
 *
 * Solo cuentan las acciones de CREACIÓN. Editar, pausar o agregar un conjunto a
 * una campaña ajena no convierte a esa persona en su creadora.
 */
import { idDeResultado } from "./ids-de-resultado";

export type NivelCreado = "campana" | "conjunto" | "anuncio";

const CREACIONES: Record<string, { nivel: NivelCreado; claves: string[] }> = {
  create_campaign: { nivel: "campana", claves: ["campaign_id", "campaignId", "id"] },
  create_ad_group: { nivel: "conjunto", claves: ["ad_group_id", "adGroupId", "id"] },
  create_adset: { nivel: "conjunto", claves: ["adset_id", "adsetId", "id"] },
  create_ad: { nivel: "anuncio", claves: ["ad_id", "adId", "id"] },
  create_responsive_search_ad: { nivel: "anuncio", claves: ["ad_id", "adId", "id"] },
};

export type PasoGuardado = { platform?: string; action?: string; ok?: boolean; raw?: unknown };

export type EntidadCreada = { provider: string; nivel: NivelCreado; id: string };

export function claveDeCreador(provider: string, nivel: NivelCreado, id: string): string {
  return `${provider}:${nivel}:${id}`;
}

/** Lo que una ejecución creó de verdad: solo pasos de creación que salieron bien y dejaron un id. */
export function entidadesCreadas(pasos: PasoGuardado[]): EntidadCreada[] {
  const creadas: EntidadCreada[] = [];
  for (const paso of pasos) {
    if (!paso || paso.ok !== true || !paso.platform || !paso.action) continue;
    const regla = CREACIONES[paso.action];
    if (!regla) continue;
    const id = idDeResultado(paso.raw, regla.claves);
    if (id) creadas.push({ provider: paso.platform, nivel: regla.nivel, id });
  }
  return creadas;
}

export type Creador = { nombre: string; email: string; creadoEn: number };

/** «Amaro Veas» → «Amaro V.»; sin nombre, la parte local del correo. */
export function nombreCorto(nombre: string | null | undefined, email: string): string {
  const limpio = (nombre ?? "").trim();
  if (!limpio || limpio.includes("@")) return email.split("@")[0] || email;
  const [primero, ...resto] = limpio.split(/\s+/);
  return resto.length > 0 ? `${primero} ${resto[0][0].toUpperCase()}.` : primero;
}

export type EjecucionGuardada = { actorEmail: string; creadaEn: number; pasos: PasoGuardado[] };

/**
 * Mapa «plataforma:nivel:id» → creador. Si el mismo id aparece en más de una
 * ejecución (un reintento), gana la primera: quien de verdad lo creó.
 */
export function mapaDeCreadores(
  ejecuciones: EjecucionGuardada[],
  nombres: ReadonlyMap<string, string>,
): Record<string, Creador> {
  const mapa: Record<string, Creador> = {};
  const ordenadas = [...ejecuciones].sort((a, b) => a.creadaEn - b.creadaEn);
  for (const e of ordenadas) {
    for (const c of entidadesCreadas(e.pasos)) {
      const clave = claveDeCreador(c.provider, c.nivel, c.id);
      if (mapa[clave]) continue;
      mapa[clave] = {
        nombre: nombreCorto(nombres.get(e.actorEmail.toLowerCase()), e.actorEmail),
        email: e.actorEmail,
        creadoEn: e.creadaEn,
      };
    }
  }
  return mapa;
}
