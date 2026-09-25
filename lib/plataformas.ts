/**
 * Registro único de plataformas publicitarias.
 *
 * Antes cada archivo resolvía el nombre con un ternario
 * `provider === "google" ? "Google Ads" : "Meta Ads"`. Eso funciona con dos
 * plataformas y falla en silencio con tres: TikTok se mostraría como Meta. Acá
 * se declara una vez y el resto del sistema pregunta.
 *
 * Agregar TikTok o LinkedIn es cambiar `activa` a true y completar sus campos:
 * Windsor ya expone ambos conectores. No hay que tocar la interfaz.
 */

export const PLATFORMS = ["google", "meta", "tiktok", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type PlatformSpec = {
  id: Platform;
  label: string;
  /**
   * Sigla de plataforma para el nombre de campaña, ej. "[MT]" en
   * `[TRF] [MT] Campaña Halloween 2026`.
   *
   * Va aparte de la sigla de objetivo (ver `lib/objetivos.ts`): esa dice para
   * qué es la campaña, esta dice en qué plataforma vive. Ninguna coincide con
   * las siglas de objetivo (AE, VTA, LDS, TRF, OCV) a propósito — si algún día
   * chocaran, un nombre como "[AE] [AE] Prueba" dejaría de decir dos cosas
   * distintas y pasaría a decir una sola, dos veces.
   */
  sigla: string;
  /** Id del conector en Windsor. */
  connector: string;
  /** false: declarada pero todavía no se lee ni se muestra. */
  activa: boolean;
  /** Campos de Windsor para la serie diaria por cuenta. */
  camposDiarios: string[];
  /**
   * Campos de Windsor para el corte por campaña.
   *
   * Incluye el id nativo de la plataforma (`campaign_id`), no solo el nombre.
   * Sin él, "añadir un conjunto de anuncios a esta campaña" no tiene forma de
   * decir a qué campaña: Windsor exige el id real, no el nombre, para escribir.
   */
  camposCampana: string[];
  /**
   * Campos para el corte por anuncio, con sus niveles superiores.
   *
   * Mismo motivo que en `camposCampana`, un nivel más abajo: `ad_group_id` /
   * `adset_id` es lo que hace falta para crear un anuncio dentro de un
   * conjunto que ya existe.
   */
  camposAnuncio: string[];
  /**
   * Campos del **catálogo**: identidad y estado, sin métricas ni fecha.
   *
   * La API REST de Windsor solo devuelve lo que tuvo actividad en el rango
   * pedido: una cuenta con 3 campañas activas y 22 pausadas devolvía 3. La
   * opción `include_inactive` del conector arregla eso, pero **solo existe en
   * la interfaz de Windsor y en su MCP, no en la API REST** — se probó con
   * todas las grafías (`include_inactive`, `options={...}`, `_renew`) y el
   * endpoint las ignora en silencio.
   *
   * La vía que sí funciona por REST: `campaign_status` y `effective_status`
   * son el estado de **hoy**, no el del rango. Una consulta de rango amplio
   * sin campos de métrica devuelve entonces el catálogo completo con su estado
   * actual, y las métricas del rango se piden por separado.
   */
  camposCatalogoCampana: string[];
  /** Igual que el anterior, al nivel de conjunto y anuncio. */
  camposCatalogoAnuncio: string[];
  /**
   * Divisor del importe que devuelve la plataforma al escribir presupuestos.
   * Google trabaja en micros; Meta y TikTok, en la unidad menor de la moneda.
   */
  unidadPresupuesto: "micros" | "centavos";
};

export const PLATFORM: Record<Platform, PlatformSpec> = {
  google: {
    id: "google",
    sigla: "GO",
    label: "Google Ads",
    connector: "google_ads",
    activa: true,
    camposDiarios: [
      "date",
      "account_id",
      "account_name",
      "currency",
      // `cost` ya viene en unidades de la moneda, no en micras. No dividir.
      "cost",
      "impressions",
      "clicks",
      "ctr",
      "average_cpm",
      // `conversions` a secas mezcla compras con vistas de página. Se guarda
      // como total de control; el resultado real sale del desglose por
      // categoría de acción (ver lib/conversiones.ts).
      "conversions",
      "conversions_value",
    ],
    camposCampana: [
      "account_id",
      "account_name",
      "currency",
      "campaign_id",
      "campaign_name",
      "campaign_status",
      "advertising_channel_type",
      "cost",
      "impressions",
      "clicks",
      "conversions",
      "conversions_value",
      // Ya en la moneda de la cuenta, igual que `cost` — no en micras.
      "budget_amount",
    ],
    camposCatalogoCampana: [
      "account_id",
      "account_name",
      "currency",
      "campaign_id",
      "campaign_name",
      "campaign_status",
      "advertising_channel_type",
    ],
    camposCatalogoAnuncio: [
      "account_id",
      "account_name",
      "currency",
      "campaign_id",
      "campaign_name",
      "ad_group_id",
      "ad_group_name",
      "ad_id",
      "ad_name",
      "ad_group_ad_status",
    ],
    camposAnuncio: [
      "account_id",
      "account_name",
      "currency",
      "campaign_id",
      "campaign_name",
      "ad_group_id",
      "ad_group_name",
      "ad_id",
      // En anuncios responsivos de búsqueda, `ad_name` trae todos los títulos
      // concatenados con "|". Performance Max no tiene grupo ni anuncio: sus
      // filas vienen con ambos en null.
      "ad_name",
      "ad_group_ad_status",
      "cost",
      "impressions",
      "clicks",
      "conversions",
      // Verificados con datos reales (get_data) el 24-09-2026: cobertura alta,
      // valores creíbles y variados. Alimentan "Interacciones" (unificado con
      // Meta) y "Puntuación de optimización".
      "engagements",
      "campaign_optimization_score",
    ],
    unidadPresupuesto: "micros",
  },
  meta: {
    id: "meta",
    sigla: "MT",
    label: "Meta Ads",
    connector: "facebook",
    activa: true,
    // Conjunto verificado por MetriQ contra cuentas reales. Meta no tiene una
    // métrica única de "resultado": depende del objetivo de la campaña, por eso
    // se traen las de cada familia y se elige según la sigla del nombre.
    camposDiarios: [
      "date",
      "account_id",
      "account_name",
      "account_currency",
      "spend",
      "impressions",
      "reach",
      "clicks",
      "actions_link_click",
      "actions_post_engagement",
      "actions_lead",
      // `actions_omni_purchase` y no `actions_purchase`: omni incluye compras
      // web, en app y offline. Es el campo que usa MetriQ para ventas.
      "actions_omni_purchase",
      "action_values_omni_purchase",
      "actions_onsite_conversion_messaging_conversation_started_7d",
    ],
    camposCampana: [
      "account_id",
      "account_name",
      "account_currency",
      "campaign_id",
      // Meta nombra la campaña `campaign`; pedir `campaign_name` devolvería
      // null sin ningún error.
      "campaign",
      "effective_status",
      "objective",
      "spend",
      "impressions",
      "reach",
      "clicks",
      "actions_link_click",
      "actions_post_engagement",
      "actions_lead",
      "actions_omni_purchase",
      "action_values_omni_purchase",
      // En unidad menor de la moneda (centavos) — se convierte al leerlo,
      // igual que Windsor lo exige al revés al escribir un presupuesto nuevo.
      "campaign_daily_budget",
    ],
    camposCatalogoCampana: [
      "account_id",
      "account_name",
      "account_currency",
      "campaign_id",
      "campaign",
      "effective_status",
      "objective",
    ],
    camposCatalogoAnuncio: [
      "account_id",
      "account_name",
      "account_currency",
      "campaign_id",
      "campaign",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "effective_status",
      // Botón del anuncio (WHATSAPP_MESSAGE, CALL_NOW, MESSAGE_PAGE…): es lo
      // que permite encontrar los anuncios de mensajería de un vistazo.
      // Verificado contra get_fields de Windsor, tabla "Ad".
      "call_to_action_type",
      // Miniatura real de la pieza. Verificado contra get_fields (tabla "Ad")
      // y contra datos reales de una cuenta activa: viene poblada de forma
      // consistente, a diferencia de `link_url` (el destino), que llega
      // vacío incluso en anuncios sin botón de mensajería.
      "thumbnail_url",
    ],
    camposAnuncio: [
      "account_id",
      "account_name",
      "account_currency",
      "campaign_id",
      "campaign",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "effective_status",
      "call_to_action_type",
      "thumbnail_url",
      // Contenido real de la pieza, para poder precargarlo al editar en vez
      // de mostrar un formulario en blanco — verificado con datos reales de
      // Colbún (2026-09-24, get_data): `body` y `link` vienen poblados de
      // forma consistente; `link_url` (el otro candidato para el destino)
      // siempre viene vacío, igual que ya se sabía para `thumbnail_url` vs
      // `link_url` más arriba. `title` viene null en piezas que reusan un
      // post orgánico (no tienen título propio) — esperable, no un error.
      "body",
      "title",
      "link",
      "spend",
      "impressions",
      "reach",
      "clicks",
      "actions_link_click",
      "actions_post_engagement",
      "actions_lead",
      "actions_omni_purchase",
      // Verificados con datos reales (get_data) el 24-09-2026: cobertura alta,
      // valores creíbles. `action_values_omni_purchase` es el valor de las
      // compras (para derivar ROAS = valor/gasto, nunca se pide el ratio
      // directo a Windsor porque no se puede sumar entre filas partidas).
      "action_values_omni_purchase",
      "actions_landing_page_view",
      "video_thruplay_watched_actions_video_view",
      "actions_video_view",
      // Categóricos (ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE_xx / UNKNOWN).
      // UNKNOWN domina en cuentas de bajo volumen (86-92% en la muestra
      // verificada) — es esperable, no un error de mapeo.
      "quality_ranking",
      "engagement_rate_ranking",
      "conversion_rate_ranking",
    ],
    unidadPresupuesto: "centavos",
  },
  tiktok: {
    id: "tiktok",
    sigla: "TT",
    label: "TikTok Ads",
    connector: "tiktok",
    // Pendiente de activar. MetriQ ya tiene su mapeo verificado: reach,
    // impressions, frequency, cpm, clicks, ctr, cpc, spend, profile_visits,
    // follows, likes, comments, shares. Ojo: en TikTok `engagement_rate`
    // significa CTR, no el ER% del reporte.
    activa: false,
    camposDiarios: [],
    camposCampana: [],
    camposAnuncio: [],
    camposCatalogoCampana: [],
    camposCatalogoAnuncio: [],
    unidadPresupuesto: "centavos",
  },
  linkedin: {
    id: "linkedin",
    sigla: "LI",
    label: "LinkedIn Ads",
    connector: "linkedin",
    activa: false,
    camposDiarios: [],
    camposCampana: [],
    camposAnuncio: [],
    camposCatalogoCampana: [],
    camposCatalogoAnuncio: [],
    unidadPresupuesto: "centavos",
  },
};

/** Las plataformas que hoy se leen y se muestran. */
export const ACTIVE_PLATFORMS: Platform[] = PLATFORMS.filter(
  (id) => PLATFORM[id].activa,
);

/**
 * Nombre visible de una plataforma.
 *
 * Nunca cae en otra plataforma por descarte: un id desconocido se muestra tal
 * cual, que es feo pero honesto, en vez de mentir.
 */
export function platformLabel(id: string): string {
  return isPlatform(id) ? PLATFORM[id].label : id;
}

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function isActivePlatform(value: string): value is Platform {
  return isPlatform(value) && PLATFORM[value].activa;
}
