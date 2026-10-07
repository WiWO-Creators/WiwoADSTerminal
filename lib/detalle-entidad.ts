/**
 * Configuración completa de campañas, conjuntos y anuncios ya publicados.
 *
 * Es el "antes" del modo editar del Constructor: todo lo que hace falta para
 * mostrar una entidad tal como está en la plataforma y, después, saber qué
 * cambió. No lleva métricas —eso vive en `WindsorAd`/`WindsorCampaign` y es un
 * pipeline cacheado y pesado—, así que se pide bajo demanda por cuenta.
 *
 * Este archivo es solo interpretación de filas (sin red ni base de datos), para
 * poder probarlo con filas reales de Windsor. La lectura está en
 * `detalle-entidad-store.ts`.
 *
 * Nombres de campo verificados con `get_data` sobre cuentas reales el
 * 2026-09-29. Dos rarezas de Windsor que no son un error de este código:
 *  - Meta escribe `adsset_optimization_goal` (doble "s").
 *  - Los presupuestos de Meta llegan en la unidad menor de la moneda y en null
 *    cuando el presupuesto vive en la campaña (Advantage Campaign Budget).
 */
import { unidadesMenoresMeta } from "./monedas";
import {
  capacidadDe,
  type Platform,
  type ViaEscritura,
} from "./plataformas";

export type Row = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Campos que se piden a Windsor                                              */
/* -------------------------------------------------------------------------- */

export const CAMPOS_DETALLE = {
  // LinkedIn (verificado con una lectura real, 2026-10-02): «campaign_group» = campaña de la interfaz,
  // «campaign» = conjunto. Los presupuestos llegan como texto ("250000") o null; el total del grupo 0 = sin tope.
  linkedin: {
    campana: [
      "account_id",
      "currency",
      "campaign_group_id",
      "campaign_group_name",
      "campaign_group_status",
      "campaign_group_total_budget",
      "campaign_group_run_scedule_start_time",
      "campaign_group_run_scedule_end_time",
    ],
    conjunto: [
      "account_id",
      "currency",
      "campaign_group_id",
      "campaign_id",
      "campaign",
      "campaign_status",
      "campaign_daily_budget_amount",
      "campaign_total_budget_amount",
      "campaign_start_date",
      "campaign_end_date",
      "campaign_type",
    ],
    anuncio: [
      "account_id",
      "campaign_group_id",
      "campaign_id",
      "creative_id",
      "creative_status",
      "sponsored_creative_content_title",
      "creative_thumbnail",
      "landing_page",
    ],
  },
  google: {
    campana: [
      "account_id",
      "currency",
      "campaign_id",
      "campaign_name",
      "campaign_status",
      "campaign_primary_status",
      "advertising_channel_type",
      "bidding_strategy_type",
      "budget_amount",
      "campaign_target_cpa_target_cpa_micros",
      "campaign_target_roas_target_roas",
      "campaign_maximize_conversions_target_cpa_micros",
      "campaign_network_settings_target_google_search",
      "campaign_network_settings_target_search_network",
      "campaign_network_settings_target_content_network",
      "campaign_tracking_setting_tracking_url",
    ],
    conjunto: [
      "account_id",
      "campaign_id",
      "ad_group_id",
      "ad_group_name",
      "ad_group_status",
      "ad_group_type",
      "ad_group_effective_cpc_bid_micros",
      "ad_group_target_cpa_micros",
      "ad_group_target_roas",
    ],
    anuncio: [
      "account_id",
      "campaign_id",
      "ad_group_id",
      "ad_id",
      "ad_type",
      "ad_group_ad_status",
      "ad_responsive_search_ad_headlines",
      "ad_responsive_search_ad_descriptions",
      "ad_responsive_search_ad_path1",
      "ad_responsive_search_ad_path2",
      "ad_final_urls",
      "ad_display_url",
      "ad_final_url_suffix",
    ],
  },
  meta: {
    campana: [
      "account_id",
      "account_currency",
      "campaign_id",
      "campaign",
      "campaign_effective_status",
      "campaign_configured_status",
      "campaign_objective",
      "campaign_buying_type",
      "campaign_bid_strategy",
      "campaign_daily_budget",
      "campaign_lifetime_budget",
      "campaign_special_ad_categories",
      "campaign_spend_cap",
      "campaign_start_time",
      "campaign_stop_time",
    ],
    // Conjunto y anuncio de Meta viven en la misma tabla ("Ad"): una sola
    // consulta trae las dos capas, y se separan al interpretar.
    conjuntoYAnuncio: [
      "account_id",
      "account_currency",
      "campaign_id",
      "adset_id",
      "adset_name",
      "adset_status",
      "adset_effective_status",
      "adset_daily_budget",
      "adset_lifetime_budget",
      "adset_bid_strategy",
      "adset_bid_amount",
      "adset_billing_event",
      "adsset_optimization_goal",
      "adset_destination_type",
      "adset_start_time",
      "adset_end_time",
      "adset_promoted_object",
      "adset_targeting",
      "ad_id",
      "ad_name",
      "effective_status",
      "creative_id",
      "image_hash",
      "image_url",
      "url_tags",
      "link",
      "link_url",
      "body",
      "title",
      "call_to_action_type",
      "thumbnail_url",
      "instagram_permalink_url",
      "ad_preview_shareable_link",
      "source_instagram_media_id",
      "effective_object_story_id",
    ],
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export type Presupuesto = {
  /** En la moneda de la cuenta (no micros ni centavos). `null`: no aplica a este nivel. */
  diario: number | null;
  total: number | null;
  /**
   * true: el presupuesto no está en esta entidad sino en la campaña (Meta con
   * Advantage Campaign Budget). Un `null` acá NO significa "sin presupuesto".
   */
  enLaCampana?: boolean;
};

export type DetalleCampana = {
  provider: Platform;
  accountId: string;
  id: string;
  nombre: string | null;
  estado: string | null;
  /** Meta: objetivo (`OUTCOME_*`). Google: tipo de canal (`SEARCH`, `VIDEO`…). */
  objetivo: string | null;
  presupuesto: Presupuesto;
  puja: {
    estrategia: string | null;
    /** Moneda de la cuenta. */
    objetivoCpa: number | null;
    objetivoRoas: number | null;
  };
  inicio: string | null;
  fin: string | null;
  categoriasEspeciales: string[];
  /** Meta: tope de gasto total de la campaña, en la moneda de la cuenta. `null`: sin tope. */
  limiteGasto: number | null;
  /** Solo Google. */
  redes: { busqueda: boolean; asociadas: boolean; display: boolean } | null;
  urlSeguimiento: string | null;
  /** Solo Google (lectura nativa): opciones de ubicación (`PRESENCE`, `PRESENCE_OR_INTEREST`). */
  presencia?: string | null;
  /** Solo Google (lectura nativa): rotación de anuncios (`OPTIMIZE`, `ROTATE_INDEFINITELY`…). */
  rotacion?: string | null;
  /** Solo Google Performance Max (lectura nativa): sus grupos de recursos. */
  gruposDeRecursos?: GrupoDeRecursos[];
  /** Solo Google (lectura nativa): enlaces de sitio y textos destacados de la campaña. */
  extensiones?: {
    sitelinks: Array<{ texto: string; url: string; descripcion1: string; descripcion2: string }>;
    destacados: string[];
  };
};

/**
 * Segmentación de un conjunto de Meta, interpretada para mostrarla.
 *
 * **Solo para leer.** Para editar, `update_adset` REEMPLAZA el `targeting`
 * completo: hay que partir de `DetalleConjunto.segmentacionCruda`, cambiar lo
 * que corresponda y enviarla entera. Reconstruirla desde este resumen perdería
 * en silencio todo lo que el resumen no modela.
 */
export type SegmentacionMeta = {
  edadMin: number | null;
  edadMax: number | null;
  /** Con Advantage+ Audience, Meta trata la edad como una sugerencia. */
  edadSugerida: [number, number] | null;
  /** 1 = hombres, 2 = mujeres; `null` = todos. */
  generos: number[] | null;
  paises: string[];
  regiones: Array<{ key: string; name: string; country: string | null }>;
  ciudades: Array<{ key: string; name: string; radio: number | null }>;
  ubicacionesPersonalizadas: number;
  tiposDeUbicacion: string[];
  paisesExcluidos: string[];
  audiencias: Array<{ id: string; name: string | null }>;
  audienciasExcluidas: Array<{ id: string; name: string | null }>;
  intereses: Array<{ id: string; name: string | null }>;
  plataformas: string[];
  /** Ej. `{ instagram: ["stream","story","reels"] }`. Vacío: ubicaciones automáticas. */
  posiciones: Record<string, string[]>;
  dispositivos: string[];
  advantageAudience: boolean | null;
};

export type PalabraClave = {
  /** Id de criterio del grupo: lo que piden `update_keywords` y `remove_keywords`. */
  criterionId: string;
  texto: string;
  concordancia: "BROAD" | "PHRASE" | "EXACT";
  estado: string | null;
  /** CPC máximo propio, en la moneda de la cuenta. */
  cpc: number | null;
};

export type DetalleConjunto = {
  provider: Platform;
  accountId: string;
  campaignId: string | null;
  id: string;
  nombre: string | null;
  estado: string | null;
  /** Google: tipo de grupo (`SEARCH_STANDARD`, `VIDEO_RESPONSIVE`…). */
  tipo: string | null;
  presupuesto: Presupuesto;
  puja: {
    estrategia: string | null;
    /** Meta: monto de la puja; Google: CPC efectivo. Moneda de la cuenta. */
    monto: number | null;
    objetivoCpa: number | null;
    objetivoRoas: number | null;
  };
  /** Meta: meta de optimización (`THRUPLAY`, `REACH`, `LEAD_GENERATION`…). */
  optimizacion: string | null;
  /** Meta: evento de cobro (`IMPRESSIONS`, `LINK_CLICKS`…). */
  cobroPor: string | null;
  /** Meta: dónde termina la persona (`WEBSITE`, `INSTAGRAM_PROFILE`…). */
  destino: string | null;
  inicio: string | null;
  fin: string | null;
  /** Meta: página, píxel o evento que promueve el conjunto. */
  objetoPromovido: Record<string, unknown> | null;
  segmentacion: SegmentacionMeta | null;
  /** El `targeting` tal como lo entrega Meta, para editarlo sin perder nada. */
  segmentacionCruda: Record<string, unknown> | null;
  /**
   * Google: palabras clave del grupo. `null` cuando no se pudieron leer (Windsor
   * no las entrega: solo la API de Google, con la cuenta conectada) — distinto de
   * una lista vacía, que significa "el grupo no tiene ninguna".
   */
  palabrasClave: PalabraClave[] | null;
};

export type TextoRsa = {
  texto: string;
  /** Posición fijada (`HEADLINE_1`…) o `null` si Google la reparte libremente. */
  fijado: string | null;
  /** Etiqueta de rendimiento de Google (`GOOD`, `LOW`, `PENDING`…). */
  rendimiento: string | null;
  /** `APPROVED`, `DISAPPROVED`, `REVIEW_IN_PROGRESS`… */
  revision: string | null;
};

export type ContenidoAnuncio = {
  /** Meta: texto principal. */
  textoPrincipal: string | null;
  /** Meta: título. */
  titulo: string | null;
  /** Google (RSA): hasta 15 titulares. */
  titulares: TextoRsa[];
  /** Google (RSA): hasta 4 descripciones. */
  descripciones: TextoRsa[];
  /** Adonde lleva el anuncio. Meta: `link`. Google: primera URL final. */
  urlDestino: string | null;
  urlsFinales: string[];
  /** Google: los dos segmentos visibles de la URL. */
  path1: string | null;
  path2: string | null;
  sufijoUrl: string | null;
  urlVisible: string | null;
  cta: string | null;
  /** Imagen a tamaño de uso. Las URLs de Meta caducan: no se guardan, se piden de nuevo. */
  imagenUrl: string | null;
  miniaturaUrl: string | null;
  imageHash: string | null;
  urlTags: string | null;
  creativeId: string | null;
  publicacionInstagram: string | null;
  vistaPreviaUrl: string | null;
};

export type EdicionDeContenido = {
  editable: boolean;
  /** Por dónde se escribiría si fuera editable. */
  via: ViaEscritura;
  /** Por qué no, y quién impone el límite. `null` cuando es editable. */
  motivo: string | null;
};

export type DetalleAnuncio = {
  provider: Platform;
  accountId: string;
  campaignId: string | null;
  conjuntoId: string | null;
  id: string;
  nombre: string | null;
  estado: string | null;
  /** Google: `RESPONSIVE_SEARCH_AD`, `VIDEO_RESPONSIVE_AD`… */
  tipo: string | null;
  contenido: ContenidoAnuncio;
  edicionDeContenido: EdicionDeContenido;
  /**
   * La publicación detrás del anuncio. `id` es el de página
   * (`{page_id}_{post_id}`) que pide `boost_post`; `existente` es true cuando el
   * anuncio se armó desde una publicación ya publicada, y entonces su contenido
   * se edita en la publicación, no en el anuncio.
   */
  publicacion: { id: string | null; existente: boolean };
};

/* -------------------------------------------------------------------------- */
/* Utilidades de lectura                                                      */
/* -------------------------------------------------------------------------- */

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  return String(valor).trim() || null;
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function booleano(valor: unknown): boolean | null {
  if (valor === true || valor === "true" || valor === 1) return true;
  if (valor === false || valor === "false" || valor === 0) return false;
  return null;
}

/**
 * Windsor entrega los campos estructurados como texto JSON. Un JSON roto no
 * debe tumbar toda la lectura de una cuenta: se trata como ausente.
 */
export function jsonSeguro(valor: unknown): unknown {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "string") return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return null;
  }
}

function objeto(valor: unknown): Record<string, unknown> | null {
  const v = jsonSeguro(valor);
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function lista(valor: unknown): unknown[] {
  const v = jsonSeguro(valor);
  return Array.isArray(v) ? v : [];
}

function registro(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

function micros(valor: unknown): number | null {
  const n = numero(valor);
  return n === null ? null : n / 1_000_000;
}

/** Monto de Meta (unidad menor de la moneda) → unidades de la moneda. */
function deMeta(valor: unknown, moneda: string | null): number | null {
  const n = numero(valor);
  // Meta entrega 0 en el presupuesto del tipo que NO se usa (un conjunto de presupuesto total trae diario 0): es
  // «no aplica», no «presupuesto cero». Confundirlos hacía creer que ese conjunto tenía presupuesto diario.
  if (n === null || n === 0) return null;
  return n / unidadesMenoresMeta(moneda);
}

/* -------------------------------------------------------------------------- */
/* Google                                                                     */
/* -------------------------------------------------------------------------- */

/** Titulares o descripciones de un anuncio responsivo de búsqueda. */
export function parseTextosRsa(valor: unknown): TextoRsa[] {
  return lista(valor)
    .map((item): TextoRsa | null => {
      const fila = registro(item);
      const t = texto(fila.text);
      if (!t) return null;
      const politica = registro(fila.policySummaryInfo);
      return {
        texto: t,
        fijado: texto(fila.pinnedField),
        rendimiento: texto(fila.assetPerformanceLabel),
        revision: texto(politica.approvalStatus) ?? texto(politica.reviewStatus),
      };
    })
    .filter((item): item is TextoRsa => item !== null);
}

export function parseUrlsFinales(valor: unknown): string[] {
  return lista(valor).filter((u): u is string => typeof u === "string" && u !== "");
}

export function detalleCampanaGoogle(fila: Row): DetalleCampana | null {
  const id = texto(fila.campaign_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  // `budget_amount` viene ya en la moneda de la cuenta (ver plataformas.ts).
  // Llega en 0 en campañas sin presupuesto propio —visto en una campaña de
  // video de Colbún—: un 0 ahí no es "presupuesto cero", es "no hay uno en la
  // campaña", y mostrarlo como monto sería mentir.
  const monto = numero(fila.budget_amount);
  return {
    provider: "google",
    accountId,
    id,
    nombre: texto(fila.campaign_name),
    estado: texto(fila.campaign_status),
    objetivo: texto(fila.advertising_channel_type),
    presupuesto: {
      diario: monto !== null && monto > 0 ? monto : null,
      total: null,
    },
    puja: {
      estrategia: texto(fila.bidding_strategy_type),
      objetivoCpa:
        micros(fila.campaign_target_cpa_target_cpa_micros) ??
        micros(fila.campaign_maximize_conversions_target_cpa_micros),
      objetivoRoas: numero(fila.campaign_target_roas_target_roas),
    },
    inicio: null,
    fin: null,
    categoriasEspeciales: [],
    limiteGasto: null,
    redes: {
      busqueda: booleano(fila.campaign_network_settings_target_google_search) ?? false,
      asociadas: booleano(fila.campaign_network_settings_target_search_network) ?? false,
      display: booleano(fila.campaign_network_settings_target_content_network) ?? false,
    },
    urlSeguimiento: texto(fila.campaign_tracking_setting_tracking_url),
  };
}

export function detalleConjuntoGoogle(fila: Row): DetalleConjunto | null {
  const id = texto(fila.ad_group_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  return {
    provider: "google",
    accountId,
    campaignId: texto(fila.campaign_id),
    id,
    nombre: texto(fila.ad_group_name),
    estado: texto(fila.ad_group_status),
    tipo: texto(fila.ad_group_type),
    // Google no tiene presupuesto a nivel de grupo de anuncios.
    presupuesto: { diario: null, total: null },
    puja: {
      estrategia: null,
      monto: micros(fila.ad_group_effective_cpc_bid_micros),
      objetivoCpa: micros(fila.ad_group_target_cpa_micros),
      objetivoRoas: numero(fila.ad_group_target_roas),
    },
    optimizacion: null,
    cobroPor: null,
    destino: null,
    inicio: null,
    fin: null,
    objetoPromovido: null,
    segmentacion: null,
    segmentacionCruda: null,
    palabrasClave: null,
  };
}

const RSA = "RESPONSIVE_SEARCH_AD";

export function edicionDeContenidoGoogle(tipo: string | null): EdicionDeContenido {
  const cap = capacidadDe("google", "anuncio", "titulo");
  if (tipo !== RSA) {
    return {
      editable: false,
      via: "ninguna",
      motivo: `Solo se editan por API los anuncios de búsqueda responsivos; este es ${tipo ?? "de otro tipo"}. Edítalo en Google Ads.`,
    };
  }
  return {
    editable: cap?.via === "windsor" || cap?.via === "nativa",
    via: cap?.via ?? "ninguna",
    motivo: cap && cap.via !== "ninguna" ? null : (cap?.nota ?? "Google no lo declara editable"),
  };
}

export function detalleAnuncioGoogle(fila: Row): DetalleAnuncio | null {
  const id = texto(fila.ad_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  const urlsFinales = parseUrlsFinales(fila.ad_final_urls);
  const tipo = texto(fila.ad_type);
  return {
    provider: "google",
    accountId,
    campaignId: texto(fila.campaign_id),
    conjuntoId: texto(fila.ad_group_id),
    id,
    // Los anuncios responsivos de Google no tienen un nombre propio.
    nombre: null,
    estado: texto(fila.ad_group_ad_status),
    tipo,
    contenido: {
      textoPrincipal: null,
      titulo: null,
      titulares: parseTextosRsa(fila.ad_responsive_search_ad_headlines),
      descripciones: parseTextosRsa(fila.ad_responsive_search_ad_descriptions),
      urlDestino: urlsFinales[0] ?? null,
      urlsFinales,
      path1: texto(fila.ad_responsive_search_ad_path1),
      path2: texto(fila.ad_responsive_search_ad_path2),
      sufijoUrl: texto(fila.ad_final_url_suffix),
      urlVisible: texto(fila.ad_display_url),
      cta: null,
      imagenUrl: null,
      miniaturaUrl: null,
      imageHash: null,
      urlTags: null,
      creativeId: null,
      publicacionInstagram: null,
      vistaPreviaUrl: null,
    },
    edicionDeContenido: edicionDeContenidoGoogle(tipo),
    publicacion: { id: null, existente: false },
  };
}

/* -------------------------------------------------------------------------- */
/* Google vía API nativa (GAQL)                                               */
/* -------------------------------------------------------------------------- */

// Las filas de `searchStream` vienen en camelCase, con los ids como texto y el
// dinero en micros. A diferencia de Windsor, traen TODAS las entidades no
// eliminadas, con o sin actividad en un rango.

export function detalleCampanaGaql(fila: Row, accountId: string): DetalleCampana | null {
  const c = registro(fila.campaign);
  const id = texto(c.id);
  if (!id) return null;
  const presupuesto = micros(registro(fila.campaignBudget).amountMicros);
  const redes = registro(c.networkSettings);
  return {
    provider: "google",
    accountId,
    id,
    nombre: texto(c.name),
    estado: texto(c.status),
    objetivo: texto(c.advertisingChannelType),
    // Sin presupuesto propio (compartido) llega 0 o ausente: no es "cero".
    presupuesto: {
      diario: presupuesto !== null && presupuesto > 0 ? presupuesto : null,
      total: null,
    },
    puja: {
      estrategia: texto(c.biddingStrategyType),
      objetivoCpa:
        micros(registro(c.targetCpa).targetCpaMicros) ??
        micros(registro(c.maximizeConversions).targetCpaMicros),
      objetivoRoas: numero(registro(c.targetRoas).targetRoas),
    },
    inicio: soloFecha(c.startDateTime),
    // Google marca «sin fin» con el 30-12-2037: no es una fecha de término real.
    fin: soloFecha(c.endDateTime)?.startsWith("2037-12-3") ? null : soloFecha(c.endDateTime),
    rotacion: texto(c.adServingOptimizationStatus),
    categoriasEspeciales: [],
    limiteGasto: null,
    redes: {
      busqueda: booleano(redes.targetGoogleSearch) ?? false,
      asociadas: booleano(redes.targetSearchNetwork) ?? false,
      display: booleano(redes.targetContentNetwork) ?? false,
    },
    urlSeguimiento: texto(c.trackingUrlTemplate),
    presencia: texto(registro(c.geoTargetTypeSetting).positiveGeoTargetType),
  };
}

export function detalleConjuntoGaql(fila: Row, accountId: string): DetalleConjunto | null {
  const g = registro(fila.adGroup);
  const id = texto(g.id);
  if (!id) return null;
  return {
    provider: "google",
    accountId,
    campaignId: texto(registro(fila.campaign).id),
    id,
    nombre: texto(g.name),
    estado: texto(g.status),
    tipo: texto(g.type),
    presupuesto: { diario: null, total: null },
    puja: {
      estrategia: null,
      monto: micros(g.cpcBidMicros),
      objetivoCpa: micros(g.targetCpaMicros),
      objetivoRoas: numero(g.targetRoas),
    },
    optimizacion: null,
    cobroPor: null,
    destino: null,
    inicio: null,
    fin: null,
    objetoPromovido: null,
    segmentacion: null,
    segmentacionCruda: null,
    palabrasClave: null,
  };
}

/** Una fila de `GAQL_PALABRAS` → el grupo al que pertenece y la palabra clave. */
export function palabraClaveGaql(fila: Row): { grupoId: string; palabra: PalabraClave } | null {
  const c = registro(fila.adGroupCriterion);
  const criterionId = texto(c.criterionId);
  const kw = registro(c.keyword);
  const t = texto(kw.text);
  const grupoId = texto(registro(fila.adGroup).id);
  if (!criterionId || !t || !grupoId) return null;
  const m = texto(kw.matchType);
  return {
    grupoId,
    palabra: {
      criterionId,
      texto: t,
      concordancia: m === "EXACT" || m === "PHRASE" ? m : "BROAD",
      estado: texto(c.status),
      cpc: micros(c.cpcBidMicros),
    },
  };
}

function textosGaql(valor: unknown, revision: string | null): TextoRsa[] {
  return (Array.isArray(valor) ? valor : [])
    .map((item): TextoRsa | null => {
      const fila = registro(item);
      const t = texto(fila.text);
      if (!t) return null;
      const pinned = texto(fila.pinnedField);
      return {
        texto: t,
        // Sin posición fijada, Google devuelve el valor "UNSPECIFIED".
        fijado: pinned && pinned !== "UNSPECIFIED" ? pinned : null,
        rendimiento: texto(fila.assetPerformanceLabel),
        revision,
      };
    })
    .filter((item): item is TextoRsa => item !== null);
}

export function detalleAnuncioGaql(fila: Row, accountId: string): DetalleAnuncio | null {
  const ga = registro(fila.adGroupAd);
  const ad = registro(ga.ad);
  const id = texto(ad.id);
  if (!id) return null;
  const rsa = registro(ad.responsiveSearchAd);
  const tipo = texto(ad.type);
  const urlsFinales = (Array.isArray(ad.finalUrls) ? ad.finalUrls : []).filter(
    (u): u is string => typeof u === "string" && u !== "",
  );
  // Google aprueba a nivel de anuncio, no de cada texto.
  const revision = texto(registro(ga.policySummary).approvalStatus);
  return {
    provider: "google",
    accountId,
    campaignId: texto(registro(fila.campaign).id),
    conjuntoId: texto(registro(fila.adGroup).id),
    id,
    nombre: null,
    estado: texto(ga.status),
    tipo,
    contenido: {
      textoPrincipal: null,
      titulo: null,
      titulares: textosGaql(rsa.headlines, revision),
      descripciones: textosGaql(rsa.descriptions, revision),
      urlDestino: urlsFinales[0] ?? null,
      urlsFinales,
      path1: texto(rsa.path1),
      path2: texto(rsa.path2),
      sufijoUrl: texto(ad.finalUrlSuffix),
      urlVisible: texto(ad.displayUrl),
      cta: null,
      imagenUrl: null,
      miniaturaUrl: null,
      imageHash: null,
      urlTags: null,
      creativeId: null,
      publicacionInstagram: null,
      vistaPreviaUrl: null,
    },
    edicionDeContenido: edicionDeContenidoGoogle(tipo),
    publicacion: { id: null, existente: false },
  };
}

/* -------------------------------------------------------------------------- */
/* Meta                                                                       */
/* -------------------------------------------------------------------------- */

export function detalleCampanaMeta(fila: Row): DetalleCampana | null {
  const id = texto(fila.campaign_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  const moneda = texto(fila.account_currency);
  // Windsor no usa la misma unidad en los tres presupuestos de Meta (verificado en una cuenta en USD, 2026-10-02):
  //  - `campaign_daily_budget` y los de conjunto (`adset_*_budget`) vienen en la unidad menor (2000 = US$ 20);
  //  - `campaign_lifetime_budget` viene en la unidad de la moneda y con decimales (2524.64 = US$ 2.524,64),
  //    contrastado con lo gastado por esa campaña. Dividirlo por 100 lo subestimaba 100 veces en monedas con centavos.
  const diario = deMeta(fila.campaign_daily_budget, moneda);
  const totalCrudo = numero(fila.campaign_lifetime_budget);
  const total = totalCrudo !== null && totalCrudo > 0 ? totalCrudo : null;
  return {
    provider: "meta",
    accountId,
    id,
    nombre: texto(fila.campaign),
    // El estado efectivo ya combina el configurado con el del padre/cuenta.
    estado: texto(fila.campaign_effective_status) ?? texto(fila.campaign_configured_status),
    objetivo: texto(fila.campaign_objective),
    presupuesto: {
      diario,
      total,
      // Sin presupuesto en la campaña, vive en cada conjunto.
      enLaCampana: diario !== null || total !== null,
    },
    puja: {
      estrategia: texto(fila.campaign_bid_strategy),
      objetivoCpa: null,
      objetivoRoas: null,
    },
    inicio: texto(fila.campaign_start_time),
    fin: texto(fila.campaign_stop_time),
    categoriasEspeciales: lista(fila.campaign_special_ad_categories).filter(
      (c): c is string => typeof c === "string",
    ),
    // Meta entrega 0 cuando no hay tope: un cero no es "gasto máximo cero".
    limiteGasto: (() => {
      const tope = deMeta(fila.campaign_spend_cap, moneda);
      return tope !== null && tope > 0 ? tope : null;
    })(),
    redes: null,
    urlSeguimiento: null,
  };
}

function entidades(valor: unknown): Array<{ id: string; name: string | null }> {
  return (Array.isArray(valor) ? valor : [])
    .map((item) => {
      const fila = registro(item);
      const id = texto(fila.id);
      return id ? { id, name: texto(fila.name) } : null;
    })
    .filter((item): item is { id: string; name: string | null } => item !== null);
}

function textos(valor: unknown): string[] {
  return (Array.isArray(valor) ? valor : []).filter(
    (v): v is string => typeof v === "string",
  );
}

export function parseSegmentacionMeta(cruda: Record<string, unknown> | null): SegmentacionMeta | null {
  if (!cruda) return null;
  const geo = registro(cruda.geo_locations);
  const geoExcluida = registro(cruda.excluded_geo_locations);
  const edadSugerida = Array.isArray(cruda.age_range) && cruda.age_range.length === 2
    ? ([Number(cruda.age_range[0]), Number(cruda.age_range[1])] as [number, number])
    : null;
  const generos = Array.isArray(cruda.genders)
    ? cruda.genders.map(Number).filter((g) => Number.isFinite(g))
    : null;

  const posiciones: Record<string, string[]> = {};
  for (const [clave, valor] of Object.entries(cruda)) {
    if (clave.endsWith("_positions") && Array.isArray(valor)) {
      posiciones[clave.replace(/_positions$/, "")] = textos(valor);
    }
  }

  const flexible = Array.isArray(cruda.flexible_spec) ? cruda.flexible_spec : [];
  const intereses = flexible.flatMap((grupo) => entidades(registro(grupo).interests));
  const automatizacion = registro(cruda.targeting_automation);

  return {
    edadMin: numero(cruda.age_min),
    edadMax: numero(cruda.age_max),
    edadSugerida,
    generos: generos && generos.length > 0 ? generos : null,
    paises: textos(geo.countries),
    regiones: (Array.isArray(geo.regions) ? geo.regions : []).map((r) => {
      const fila = registro(r);
      return {
        key: String(fila.key ?? ""),
        name: String(fila.name ?? ""),
        country: texto(fila.country),
      };
    }),
    ciudades: (Array.isArray(geo.cities) ? geo.cities : []).map((c) => {
      const fila = registro(c);
      return {
        key: String(fila.key ?? ""),
        name: String(fila.name ?? ""),
        radio: numero(fila.radius),
      };
    }),
    ubicacionesPersonalizadas: Array.isArray(geo.custom_locations) ? geo.custom_locations.length : 0,
    tiposDeUbicacion: textos(geo.location_types),
    paisesExcluidos: textos(geoExcluida.countries),
    audiencias: entidades(cruda.custom_audiences),
    audienciasExcluidas: entidades(cruda.excluded_custom_audiences),
    intereses,
    plataformas: textos(cruda.publisher_platforms),
    posiciones,
    dispositivos: textos(cruda.device_platforms),
    advantageAudience: numero(automatizacion.advantage_audience) === null
      ? null
      : numero(automatizacion.advantage_audience) === 1,
  };
}

export function detalleConjuntoMeta(fila: Row): DetalleConjunto | null {
  const id = texto(fila.adset_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  const moneda = texto(fila.account_currency);
  const diario = deMeta(fila.adset_daily_budget, moneda);
  const total = deMeta(fila.adset_lifetime_budget, moneda);
  const cruda = objeto(fila.adset_targeting);
  return {
    provider: "meta",
    accountId,
    campaignId: texto(fila.campaign_id),
    id,
    nombre: texto(fila.adset_name),
    estado: texto(fila.adset_effective_status) ?? texto(fila.adset_status),
    tipo: null,
    presupuesto: {
      diario,
      total,
      // `null` en ambos: el presupuesto está en la campaña, no falta.
      enLaCampana: diario === null && total === null,
    },
    puja: {
      estrategia: texto(fila.adset_bid_strategy),
      monto: deMeta(fila.adset_bid_amount, moneda),
      objetivoCpa: null,
      objetivoRoas: null,
    },
    optimizacion: texto(fila.adsset_optimization_goal),
    cobroPor: texto(fila.adset_billing_event),
    destino: texto(fila.adset_destination_type),
    inicio: texto(fila.adset_start_time),
    fin: texto(fila.adset_end_time),
    objetoPromovido: objeto(fila.adset_promoted_object),
    segmentacion: parseSegmentacionMeta(cruda),
    segmentacionCruda: cruda,
    palabrasClave: null,
  };
}

/**
 * Meta no deja editar el contenido de un anuncio que reusa una publicación ya
 * existente (`update_ad_creative`: "content fields on those ads cannot be
 * edited; edit the post itself instead").
 *
 * La señal fiable es `source_instagram_media_id`: viene poblado exactamente en
 * los anuncios armados desde una publicación de Instagram y en null en los
 * propios (verificado con Colbún, 2026-09-29). Antes se adivinaba por la forma
 * del `link`, y fallaba: algunas de esas piezas llegan con `link` en null. El
 * `link` apuntando a una publicación se conserva como segunda señal, para las
 * publicaciones de Facebook, que no traen ese campo.
 */
export function reusaPublicacion(link: string | null, sourceInstagramMediaId?: string | null): boolean {
  if (sourceInstagramMediaId) return true;
  if (!link) return false;
  return /^https?:\/\/(www\.)?(instagram\.com\/(p|reel|tv)\/|facebook\.com\/[^/]+\/(posts|videos)\/)/i.test(link);
}

export function edicionDeContenidoMeta(
  link: string | null,
  sourceInstagramMediaId?: string | null,
): EdicionDeContenido {
  const cap = capacidadDe("meta", "anuncio", "texto");
  if (reusaPublicacion(link, sourceInstagramMediaId)) {
    return {
      editable: false,
      via: "ninguna",
      motivo:
        "Este anuncio usa una publicación existente: Meta no permite editar su contenido desde el anuncio. Edita la publicación original, o impúlsala de nuevo con otro texto.",
    };
  }
  return {
    editable: cap?.via === "windsor" || cap?.via === "nativa",
    via: cap?.via ?? "ninguna",
    motivo: null,
  };
}

export function detalleAnuncioMeta(fila: Row): DetalleAnuncio | null {
  const id = texto(fila.ad_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  const link = texto(fila.link) ?? texto(fila.link_url);
  const origenInstagram = texto(fila.source_instagram_media_id);
  return {
    provider: "meta",
    accountId,
    campaignId: texto(fila.campaign_id),
    conjuntoId: texto(fila.adset_id),
    id,
    nombre: texto(fila.ad_name),
    estado: texto(fila.effective_status),
    tipo: null,
    contenido: {
      textoPrincipal: texto(fila.body),
      titulo: texto(fila.title),
      titulares: [],
      descripciones: [],
      urlDestino: link,
      urlsFinales: link ? [link] : [],
      path1: null,
      path2: null,
      sufijoUrl: null,
      urlVisible: null,
      cta: texto(fila.call_to_action_type),
      imagenUrl: texto(fila.image_url),
      miniaturaUrl: texto(fila.thumbnail_url),
      imageHash: texto(fila.image_hash),
      urlTags: texto(fila.url_tags),
      creativeId: texto(fila.creative_id),
      publicacionInstagram: texto(fila.instagram_permalink_url),
      vistaPreviaUrl: texto(fila.ad_preview_shareable_link),
    },
    edicionDeContenido: edicionDeContenidoMeta(link, origenInstagram),
    publicacion: {
      id: texto(fila.effective_object_story_id),
      existente: reusaPublicacion(link, origenInstagram),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Resultado agregado                                                         */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* LinkedIn                                                                   */
/* -------------------------------------------------------------------------- */

/** Fecha o marca de tiempo de LinkedIn → solo la fecha (aaaa-mm-dd), o null. */
function soloFecha(valor: unknown): string | null {
  const t = texto(valor);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

/** El grupo de campañas de LinkedIn (la «campaña» de la interfaz). */
export function detalleCampanaLinkedin(fila: Row): DetalleCampana | null {
  const id = texto(fila.campaign_group_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  const total = numero(fila.campaign_group_total_budget);
  return {
    provider: "linkedin",
    accountId,
    id,
    nombre: texto(fila.campaign_group_name),
    estado: texto(fila.campaign_group_status),
    objetivo: null,
    // 0 es «sin tope», no «presupuesto cero».
    presupuesto: { diario: null, total: total !== null && total > 0 ? total : null },
    puja: { estrategia: null, objetivoCpa: null, objetivoRoas: null },
    inicio: soloFecha(fila.campaign_group_run_scedule_start_time),
    fin: soloFecha(fila.campaign_group_run_scedule_end_time),
    categoriasEspeciales: [],
    limiteGasto: null,
    redes: null,
    urlSeguimiento: null,
  };
}

/** La campaña de LinkedIn (el «conjunto» de la interfaz): trae su propio presupuesto y fechas. */
export function detalleConjuntoLinkedin(fila: Row): DetalleConjunto | null {
  const id = texto(fila.campaign_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  return {
    provider: "linkedin",
    accountId,
    campaignId: texto(fila.campaign_group_id),
    id,
    nombre: texto(fila.campaign),
    estado: texto(fila.campaign_status),
    tipo: texto(fila.campaign_type),
    presupuesto: {
      diario: numero(fila.campaign_daily_budget_amount),
      total: numero(fila.campaign_total_budget_amount),
    },
    puja: { estrategia: null, monto: null, objetivoCpa: null, objetivoRoas: null },
    optimizacion: null,
    cobroPor: null,
    destino: null,
    inicio: soloFecha(fila.campaign_start_date),
    fin: soloFecha(fila.campaign_end_date),
    objetoPromovido: null,
    segmentacion: null,
    segmentacionCruda: null,
    palabrasClave: null,
  };
}

/** El anuncio (creative) de LinkedIn: se pausa y se activa, pero su contenido no se edita desde aquí. */
export function detalleAnuncioLinkedin(fila: Row): DetalleAnuncio | null {
  const id = texto(fila.creative_id);
  const accountId = texto(fila.account_id);
  if (!id || !accountId) return null;
  const destino = texto(fila.landing_page);
  return {
    provider: "linkedin",
    accountId,
    campaignId: texto(fila.campaign_group_id),
    conjuntoId: texto(fila.campaign_id),
    id,
    nombre: texto(fila.sponsored_creative_content_title) ?? id,
    estado: texto(fila.creative_status),
    tipo: null,
    contenido: {
      textoPrincipal: null,
      titulo: texto(fila.sponsored_creative_content_title),
      titulares: [],
      descripciones: [],
      urlDestino: destino,
      urlsFinales: destino ? [destino] : [],
      path1: null,
      path2: null,
      sufijoUrl: null,
      urlVisible: null,
      cta: null,
      imagenUrl: null,
      miniaturaUrl: texto(fila.creative_thumbnail),
      imageHash: null,
      urlTags: null,
      creativeId: id,
      publicacionInstagram: null,
      vistaPreviaUrl: null,
    },
    edicionDeContenido: {
      editable: false,
      via: "ninguna",
      motivo:
        "LinkedIn no permite editar el contenido de un anuncio desde WiWO.ADS: se arma desde una publicación existente. Aquí se puede pausar o activar.",
    },
    publicacion: { id: null, existente: true },
  };
}

/** Un recurso de un grupo de recursos de Performance Max. */
export type RecursoDeGrupo = {
  /** Tipo de recurso de Google: `HEADLINE`, `LONG_HEADLINE`, `DESCRIPTION`, `MARKETING_IMAGE`, `LOGO`, `YOUTUBE_VIDEO`… */
  campo: string;
  estado: string | null;
  texto: string | null;
  imagenUrl: string | null;
  videoYoutube: string | null;
};

/** Grupo de recursos de una campaña Performance Max: lo que hace de «anuncio» en esa campaña. */
export type GrupoDeRecursos = {
  id: string;
  campaignId: string;
  nombre: string | null;
  estado: string | null;
  urlsFinales: string[];
  path1: string | null;
  path2: string | null;
  recursos: RecursoDeGrupo[];
};

export type DetalleDeCuenta = {
  provider: Platform;
  accountId: string;
  campanas: DetalleCampana[];
  conjuntos: DetalleConjunto[];
  anuncios: DetalleAnuncio[];
  /** Solo Google con lectura nativa: grupos de recursos de Performance Max. */
  gruposDeRecursos?: GrupoDeRecursos[];
  /**
   * De dónde salió. `windsor`: solo entidades con actividad en la ventana.
   * `nativa`: la API de la propia plataforma, con todo lo que existe.
   */
  fuente: "windsor" | "nativa";
  /** Límites que el usuario debe conocer (por qué puede faltar algo). */
  avisos: string[];
};

/**
 * Una fila de Meta con varias filas por anuncio (partidas por día o posición)
 * se reduce a una por id; se queda con la primera que trae cada dato.
 */
export function unicosPorId<T extends { id: string }>(items: T[]): T[] {
  const vistos = new Map<string, T>();
  for (const item of items) {
    if (!vistos.has(item.id)) vistos.set(item.id, item);
  }
  return [...vistos.values()];
}

/** Filas de `GAQL_GRUPOS_DE_RECURSOS` y `GAQL_RECURSOS_DE_GRUPO` → grupos de recursos con sus recursos. Parte pura. */
export function gruposDeRecursosGaql(grupos: Row[], recursos: Row[]): GrupoDeRecursos[] {
  const porGrupo = new Map<string, RecursoDeGrupo[]>();
  for (const fila of recursos) {
    const grupoId = texto(registro(fila.assetGroup).id);
    const vinculo = registro(fila.assetGroupAsset);
    const asset = registro(fila.asset);
    const campo = texto(vinculo.fieldType);
    if (!grupoId || !campo) continue;
    porGrupo.set(grupoId, [
      ...(porGrupo.get(grupoId) ?? []),
      {
        campo,
        estado: texto(vinculo.status),
        texto: texto(registro(asset.textAsset).text),
        imagenUrl: texto(registro(registro(asset.imageAsset).fullSize).url),
        videoYoutube: texto(registro(asset.youtubeVideoAsset).youtubeVideoId),
      },
    ]);
  }
  const salida: GrupoDeRecursos[] = [];
  for (const fila of grupos) {
    const g = registro(fila.assetGroup);
    const id = texto(g.id);
    const campaignId = texto(registro(fila.campaign).id);
    if (!id || !campaignId) continue;
    salida.push({
      id,
      campaignId,
      nombre: texto(g.name),
      estado: texto(g.status),
      urlsFinales: (Array.isArray(g.finalUrls) ? g.finalUrls : []).filter((u): u is string => typeof u === "string" && u !== ""),
      path1: texto(g.path1),
      path2: texto(g.path2),
      recursos: porGrupo.get(id) ?? [],
    });
  }
  return salida;
}
