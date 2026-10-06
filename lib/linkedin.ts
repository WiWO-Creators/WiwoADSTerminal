/**
 * LinkedIn Ads (solo lectura) a través de Windsor.
 *
 * LinkedIn nombra distinto a casi todo: lo que su interfaz llama «Campaña» es el
 * `campaign_group` de la API, y lo que llama «Conjunto de anuncios» es `campaign`. Aquí se traduce cada
 * fila a las claves que el resto de la app ya entiende (las de Meta y Google), para no abrir un
 * camino aparte en cada pantalla:
 *
 *   Campaña (UI)    ← campaign_group_name / campaign_group_id / campaign_group_status
 *   Conjunto        ← campaign / campaign_id            (la API lo llama «campaign»)
 *   Anuncio         ← creative_id + título del creativo
 *   Interacciones   ← engagements          (como `actions_post_engagement` de Meta)
 *   Clics al enlace ← landingpageclicks, o clics si no vienen
 *   Leads           ← oneclickleads
 *   Conversiones    ← externalwebsiteconversions
 *
 * Es puro (no importa nada de la app) para poder probarlo solo.
 */
export type FilaCruda = Record<string, unknown>;

const hay = (v: unknown): boolean => v !== undefined && v !== null && v !== "";
/** El primer valor que trae algo: `??` no sirve porque una cadena vacía cuenta como presente. */
const primero = (...valores: unknown[]): unknown => valores.find(hay);

/** Misma fila, con las claves de la app añadidas. No pisa ninguna clave que ya exista. */
export function adaptarFilaLinkedin(fila: FilaCruda): FilaCruda {
  const f: FilaCruda = { ...fila };
  const poner = (clave: string, valor: unknown) => {
    if (hay(valor) && !hay(f[clave])) f[clave] = valor;
  };

  // Campaña = grupo de campañas de la API.
  if (hay(fila.campaign_group_name)) {
    // `campaign` (conjunto en la API) pasa a ser el conjunto; el grupo toma su lugar como campaña.
    poner("adset_name", fila.campaign);
    poner("adset_id", fila.campaign_id);
    f.campaign = fila.campaign_group_name;
    f.campaign_id = fila.campaign_group_id ?? null;
    // El estado de la campaña es el de su grupo, no el del conjunto.
    if (hay(fila.campaign_group_status)) f.campaign_status = fila.campaign_group_status;
  }
  poner("campaign_status", fila.campaign_status);
  poner("effective_status", primero(fila.creative_status, fila.campaign_group_status, fila.campaign_status));
  poner("objective", fila.objective_type);

  // Anuncio.
  poner("ad_id", fila.creative_id);
  poner("ad_name", primero(fila.sponsored_creative_content_title, fila.creative_content_data_share_ad_context_dsc_name, fila.creative_id));
  poner("thumbnail_url", fila.creative_thumbnail);
  poner("title", fila.sponsored_creative_content_title);
  poner("body", primero(fila.sponsored_creative_content_commentary, fila.share_text));
  poner("link", primero(fila.landing_page, fila.share_landing_page));

  // Métricas con el vocabulario de Meta.
  poner("reach", fila.approximate_unique_impressions);
  poner("actions_post_engagement", fila.engagements);
  poner("actions_link_click", primero(fila.landingpageclicks, fila.clicks));
  poner("actions_lead", fila.oneclickleads);
  poner("conversions", fila.externalwebsiteconversions);
  poner("actions_video_view", fila.video_views);
  return f;
}
