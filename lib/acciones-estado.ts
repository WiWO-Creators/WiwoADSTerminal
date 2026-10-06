/**
 * Las acciones de Windsor para pausar o activar, por plataforma y nivel, y qué dato llena cada parámetro.
 * Verificadas con `list_actions` de Windsor: Google (10-09-2026), Meta (10-09-2026) y LinkedIn (02-10-2026).
 * Está aparte de la ruta porque las rutas solo pueden exportar sus manejadores.
 */
export type Nivel = "campana" | "conjunto" | "anuncio";

export const ACCION: Record<
  string,
  Record<Nivel, { enable: string; pause: string; params: string[] }>
> = {
  google: {
    campana: {
      enable: "enable_campaign",
      pause: "pause_campaign",
      params: ["campaign_id"],
    },
    conjunto: {
      enable: "enable_ad_group",
      pause: "pause_ad_group",
      params: ["ad_group_id"],
    },
    anuncio: {
      enable: "enable_ad",
      pause: "pause_ad",
      params: ["ad_group_id", "ad_id"],
    },
  },
  meta: {
    campana: {
      enable: "enable_campaign",
      pause: "pause_campaign",
      params: ["campaign_id"],
    },
    conjunto: {
      enable: "enable_adset",
      pause: "pause_adset",
      params: ["adset_id"],
    },
    anuncio: { enable: "enable_ad", pause: "pause_ad", params: ["ad_id"] },
  },
  // Declaradas pero inactivas: si algún día se activan, sus acciones de
  // pausa/activación reales van acá, no antes.
  tiktok: {
    campana: { enable: "", pause: "", params: [] },
    conjunto: { enable: "", pause: "", params: [] },
    anuncio: { enable: "", pause: "", params: [] },
  },
  // Verificado con `list_actions` de Windsor (2026-10-02). En LinkedIn lo que su interfaz llama «Campaña» es el
  // grupo de campañas (campaign_group) y «Conjunto de anuncios» es la campaña (campaign): WiWO.ADS usa los
  // nombres de la interfaz, así que `campaña` → campaign_group_* y `conjunto` → campaign_*.
  linkedin: {
    campana: {
      enable: "enable_campaign_group",
      pause: "pause_campaign_group",
      params: ["campaign_group_id"],
    },
    conjunto: {
      enable: "enable_campaign",
      pause: "pause_campaign",
      params: ["campaign_id"],
    },
    anuncio: {
      enable: "enable_creative",
      pause: "pause_creative",
      params: ["creative_id"],
    },
  },
};

/** Qué dato de la solicitud llena cada parámetro, según la plataforma (los ids no se llaman igual). */
export function valoresDeParametros(
  provider: string,
  ids: { campaignId?: string | null; adsetId?: string | null; adId?: string | null },
): Record<string, string | null | undefined> {
  if (provider === "linkedin") {
    return { campaign_group_id: ids.campaignId, campaign_id: ids.adsetId, creative_id: ids.adId };
  }
  return {
    campaign_id: ids.campaignId,
    ad_group_id: ids.adsetId,
    adset_id: ids.adsetId,
    ad_id: ids.adId,
  };
}
