/**
 * TikTok Ads (solo lectura) a través de Windsor.
 *
 * Se traduce cada fila a las claves que el resto de la app ya entiende (las de Meta y Google):
 *
 *   Campaña       ← campaign_name / campaign_id / campaign_status
 *   Conjunto      ← ad_group_name / ad_group_id         (TikTok lo llama «grupo de anuncios»)
 *   Anuncio       ← ad_id / ad_name
 *   Interacciones ← likes + comments + shares + follows (como `actions_post_engagement` de Meta)
 *   Clics         ← clicks
 *   Resultados    ← results (el evento de optimización de la campaña: leads, compras, clics…)
 *
 * Ojo: en TikTok `engagement_rate` es el CTR, no el ER% de un reporte, por eso no se usa. Es puro (no importa nada de
 * la app) para poder probarlo solo.
 */
export type FilaCruda = Record<string, unknown>;

const hay = (v: unknown): boolean => v !== undefined && v !== null && v !== "";
const numero = (v: unknown): number | null => {
  if (!hay(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Suma lo que venga; `null` solo si ninguno trae dato (cero es un dato). */
function sumar(...valores: unknown[]): number | null {
  const conDato = valores.map(numero).filter((n): n is number => n !== null);
  return conDato.length > 0 ? conDato.reduce((a, b) => a + b, 0) : null;
}

/** Estado en el vocabulario común: TikTok dice `ENABLE`/`DISABLE`/`DELETE`; la app entiende ACTIVE/PAUSED. */
export function estadoDeTiktok(valor: unknown): string | null {
  if (!hay(valor)) return null;
  const v = String(valor).toUpperCase();
  if (v.includes("DELETE")) return "REMOVED";
  if (v.includes("DISABLE") || v.includes("PAUSE")) return "PAUSED";
  if (v.includes("ENABLE") || v === "ACTIVE" || v.includes("DELIVERY_OK")) return "ACTIVE";
  return v;
}

/** Misma fila, con las claves de la app añadidas. No pisa ninguna clave que ya exista. */
export function adaptarFilaTiktok(fila: FilaCruda): FilaCruda {
  const f: FilaCruda = { ...fila };
  const poner = (clave: string, valor: unknown) => {
    if (hay(valor) && !hay(f[clave])) f[clave] = valor;
  };

  poner("campaign", fila.campaign_name);
  poner("campaign_id", fila.campaign_id);
  poner("adset_name", fila.ad_group_name);
  poner("adset_id", fila.ad_group_id);
  poner("campaign_status", estadoDeTiktok(fila.campaign_operation_status ?? fila.campaign_status));
  poner("effective_status", estadoDeTiktok(fila.ad_operation_status ?? fila.ad_status ?? fila.ad_group_operation_status ?? fila.campaign_operation_status));
  poner("objective", fila.objective_type ?? fila.objective);

  poner("thumbnail_url", fila.image_url);
  poner("body", fila.ad_text);
  poner("link", fila.landing_page_url);

  poner("actions_post_engagement", sumar(fila.likes, fila.comments, fila.shares, fila.follows));
  poner("actions_link_click", fila.clicks);
  poner("actions_video_view", fila.video_views_p25 ?? fila.video_play_actions ?? fila.video_views);
  // `results` es el evento por el que se optimiza; sin saber cuál es, se deja como conversiones (nunca como leads o compras).
  poner("conversions", fila.results ?? fila.conversion);
  return f;
}
