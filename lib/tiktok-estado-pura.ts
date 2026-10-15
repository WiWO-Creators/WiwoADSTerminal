/**
 * En qué punto está TikTok en WiWO.ADS, para mostrarlo en Cuentas sin llamar a nadie. Hoy TikTok se LEE por Windsor; crear y editar
 * directo depende de que TikTok apruebe la app «WiwoAds» (enviada a revisión el 2026-10-07) y de cargar su App ID y su Secret en el
 * servidor. Puro (sin red ni `env`).
 */

/** La URL de retorno que hay que dejar registrada, exacta, en la app de TikTok (la del anunciante, no la del titular orgánico). */
export const RUTA_DE_RETORNO_TIKTOK = "/api/integrations/tiktok/callback";

export type EstadoDeTiktok = {
  /** El servidor tiene el App ID y el Secret de la app. */
  configurado: boolean;
  /** Lo que falta cargar en el servidor (solo nombres, nunca valores). */
  falta: string[];
  /** Desde cuándo está hoy la lectura: siempre por Windsor hasta que exista la conexión directa. */
  lectura: "windsor";
  /** La conexión directa del equipo todavía no existe en el código: lo dice la tarjeta. */
  conexionDirecta: false;
};

export function estadoDeTiktok(env: { TIKTOK_APP_ID?: string; TIKTOK_APP_SECRET?: string }): EstadoDeTiktok {
  const falta = [env.TIKTOK_APP_ID?.trim() ? null : "TIKTOK_APP_ID", env.TIKTOK_APP_SECRET?.trim() ? null : "TIKTOK_APP_SECRET"].filter((x): x is string => x !== null);
  return { configurado: falta.length === 0, falta, lectura: "windsor", conexionDirecta: false };
}

/** Lo que se habilita cuando TikTok apruebe la app y se conecte, en lo que la persona hace (no en términos técnicos). */
export const LO_QUE_HABILITA_TIKTOK = [
  "Crear campañas, grupos de anuncios y anuncios con video, solo o junto con Google, Meta y LinkedIn",
  "Editar nombre, presupuesto, fechas, público y estado de lo ya publicado",
  "Cambiar o subir videos e imágenes nuevos, y usar publicaciones existentes",
  "Informes por campaña, grupo y anuncio, y vistas previas en formato vertical",
  "Formularios instantáneos para captar leads",
] as const;

// ─── Conexión directa (OAuth del anunciante) ──────────────────────────────────────────────────────────────────────────

/** Dirección a la que se manda a un administrador para que autorice la app: es la pantalla de autorización de anunciantes. */
export function urlDeAutorizacionTiktok(p: { appId: string; state: string; redirectUri: string }): string {
  const url = new URL("https://business-api.tiktok.com/portal/auth");
  url.searchParams.set("app_id", p.appId);
  url.searchParams.set("state", p.state);
  url.searchParams.set("redirect_uri", p.redirectUri);
  return url.toString();
}

/** El código de autorización que TikTok devuelve: según la versión del portal llega como `auth_code` o como `code`. */
export function codigoDeRetornoTiktok(params: { get(nombre: string): string | null }): string {
  return (params.get("auth_code") ?? params.get("code") ?? "").trim();
}

export type AnuncianteDeTiktok = { id: string; nombre: string | null; moneda: string | null; estado: string | null };

/** Los anunciantes de la respuesta de `advertiser/info/`, con sus campos útiles y sin repetir. */
export function anunciantesDeRespuesta(datos: unknown): AnuncianteDeTiktok[] {
  const lista = Array.isArray((datos as { list?: unknown })?.list) ? ((datos as { list: unknown[] }).list as Array<Record<string, unknown>>) : [];
  const vistos = new Set<string>();
  const salida: AnuncianteDeTiktok[] = [];
  for (const a of lista) {
    const id = a.advertiser_id !== undefined ? String(a.advertiser_id) : "";
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    salida.push({
      id,
      nombre: typeof a.name === "string" && a.name.trim() ? a.name.trim() : null,
      moneda: typeof a.currency === "string" && a.currency.trim() ? a.currency.trim() : null,
      estado: typeof a.status === "string" && a.status.trim() ? a.status.trim() : null,
    });
  }
  return salida;
}

/** Ids de anunciantes de la respuesta del canje del código (`advertiser_ids`) o de `oauth2/advertiser/get/` (`list[].advertiser_id`). */
export function idsDeAnunciantes(datos: unknown): string[] {
  const d = (datos ?? {}) as { advertiser_ids?: unknown; list?: unknown };
  const directos = Array.isArray(d.advertiser_ids) ? d.advertiser_ids.map((x) => String(x)) : [];
  const deLista = Array.isArray(d.list) ? (d.list as Array<Record<string, unknown>>).map((a) => (a.advertiser_id !== undefined ? String(a.advertiser_id) : "")) : [];
  return [...new Set([...directos, ...deLista].filter((x) => /^\d+$/.test(x)))];
}
