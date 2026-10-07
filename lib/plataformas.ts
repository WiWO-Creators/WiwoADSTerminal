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

/**
 * Plataformas con conexión OAuth propia (Google Ads API y Meta Graph), aparte
 * de la que se hace vía Windsor. No es lo mismo que "plataformas activas": una
 * plataforma puede leerse y escribirse solo por Windsor sin tener OAuth nativo.
 * Por eso es su propia lista y no un alias de `Platform`.
 */
export const CONECTABLES = ["google", "meta"] as const satisfies readonly Platform[];
export type PlataformaConectable = (typeof CONECTABLES)[number];

export function isConectable(value: string): value is PlataformaConectable {
  return (CONECTABLES as readonly string[]).includes(value);
}

/** Los tres niveles de la jerarquía que comparten todas las plataformas (la de Meta). */
export type NivelEntidad = "campana" | "conjunto" | "anuncio";

/**
 * Cosas que se pueden cambiar de algo que ya existe. Un solo vocabulario para
 * todas las plataformas: cada una declara cuáles soporta y por qué vía.
 */
export type CampoEditable =
  | "nombre"
  | "estado"
  | "presupuesto"
  | "puja"
  | "optimizacion"
  | "programacion"
  | "segmentacion"
  | "ubicaciones"
  | "idioma"
  | "palabras_clave"
  | "negativas"
  | "audiencias"
  | "extensiones"
  | "texto"
  | "titulo"
  | "descripcion"
  | "url_destino"
  | "imagen"
  | "cta"
  | "url_tags";

/**
 * Por dónde se escribe un campo:
 *  - `windsor`: con una acción de escritura que Windsor expone hoy.
 *  - `nativa`: directo contra la API de la plataforma (Windsor no lo cubre).
 *  - `ninguna`: hoy no se puede; `nota` dice por qué y quién impone el límite.
 */
export type ViaEscritura = "windsor" | "nativa" | "ninguna";

export type CapacidadDeCampo = {
  via: ViaEscritura;
  /** Acción real de Windsor (`list_actions`) cuando `via` es `windsor`. */
  acciones?: string[];
  nota?: string;
};

export type Capacidades = Record<
  NivelEntidad,
  Partial<Record<CampoEditable, CapacidadDeCampo>>
>;

export type PlatformSpec = {
  id: Platform;
  label: string;
  /**
   * Cómo se llama cada nivel en esta plataforma. La jerarquía es la misma
   * (campaña → conjunto → anuncio, como Meta Ads Manager); el vocabulario no.
   */
  niveles: Record<NivelEntidad, string>;
  /**
   * Qué se puede editar de algo ya publicado y por qué vía. La interfaz lo
   * consulta para mostrar cada campo editable o bloqueado con su motivo, en
   * vez de decidirlo con un `if (plataforma === ...)`. Verificado contra
   * `list_actions` de Windsor el 2026-09-29.
   */
  capacidades: Capacidades;
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
  /**
   * `true`: se lee y se muestra aunque todavía no se pueda escribir en ella (crear, editar, pausar). Es el
   * paso previo a `activa`: una plataforma solo de lectura no aparece en el Constructor, el asistente ni el
   * simulador. LinkedIn está así.
   */
  soloLectura?: boolean;
  /**
   * `true`: aunque no se puedan CREAR campañas, sí se administran las que ya existen (pausar, activar,
   * presupuesto, nombre, fechas) con las acciones que Windsor ofrece. LinkedIn está así.
   */
  administraExistentes?: boolean;
  /**
   * `true`: el Constructor puede CREAR campañas en ella, aunque no sea `activa`. Es un permiso aparte a propósito: volver
   * `activa` a una plataforma la mete también en el simulador, el asistente, las alertas y las sugerencias, que todavía no
   * saben de LinkedIn. LinkedIn crea por su API directa (no por Windsor), y solo si hay conexión.
   */
  creaEnConstructor?: boolean;
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
    niveles: { campana: "Campaña", conjunto: "Grupo de anuncios", anuncio: "Anuncio" },
    capacidades: {
      campana: {
        nombre: { via: "windsor", acciones: ["rename_campaign"] },
        estado: { via: "windsor", acciones: ["pause_campaign", "enable_campaign"] },
        presupuesto: { via: "windsor", acciones: ["set_campaign_budget"] },
        puja: {
          via: "windsor",
          acciones: [
            "set_campaign_bidding_strategy",
            "set_target_cpa",
            "set_target_roas",
            "set_cpc_bid_ceiling",
          ],
        },
        segmentacion: { via: "windsor", acciones: ["set_campaign_geo_targeting"] },
        idioma: { via: "windsor", acciones: ["set_campaign_language_targeting"] },
        programacion: { via: "windsor", acciones: ["set_ad_schedule"] },
        negativas: { via: "windsor", acciones: ["push_negative_keywords", "remove_negative_keywords"] },
        extensiones: { via: "windsor", acciones: ["create_ad_asset"] },
      },
      conjunto: {
        nombre: { via: "windsor", acciones: ["rename_ad_group", "update_ad_group"] },
        estado: { via: "windsor", acciones: ["pause_ad_group", "enable_ad_group"] },
        puja: { via: "windsor", acciones: ["set_max_cpc", "update_ad_group"] },
        palabras_clave: {
          via: "windsor",
          acciones: ["push_keywords", "update_keywords", "remove_keywords"],
        },
        negativas: { via: "windsor", acciones: ["push_negative_keywords", "remove_negative_keywords"] },
        audiencias: {
          via: "windsor",
          acciones: ["attach_user_list_to_ad_group", "detach_user_list_from_ad_group"],
        },
        extensiones: { via: "windsor", acciones: ["create_ad_asset"] },
      },
      anuncio: {
        estado: { via: "windsor", acciones: ["pause_ad", "enable_ad"] },
        // Windsor no tiene ninguna acción para editar un anuncio existente (solo
        // crear uno nuevo). Es un límite de Windsor, no de Google: la API de
        // Google Ads sí lo permite, así que se escribe directo (`google-ads-nativo.ts`),
        // en el mismo anuncio y sin cambiar su id. Requiere que quien edita
        // tenga conectada su cuenta de Google en Integraciones.
        titulo: { via: "nativa", nota: "Anuncios de búsqueda responsivos" },
        descripcion: { via: "nativa", nota: "Anuncios de búsqueda responsivos" },
        url_destino: { via: "nativa", nota: "Anuncios de búsqueda responsivos" },
      },
    },
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
    niveles: { campana: "Campaña", conjunto: "Conjunto de anuncios", anuncio: "Anuncio" },
    capacidades: {
      campana: {
        nombre: { via: "windsor", acciones: ["update_campaign"] },
        estado: { via: "windsor", acciones: ["pause_campaign", "enable_campaign"] },
        presupuesto: { via: "windsor", acciones: ["set_campaign_budget"] },
        puja: { via: "windsor", acciones: ["update_campaign"] },
      },
      conjunto: {
        nombre: { via: "windsor", acciones: ["update_adset"] },
        estado: { via: "windsor", acciones: ["pause_adset", "enable_adset"] },
        presupuesto: { via: "windsor", acciones: ["set_adset_budget"] },
        puja: { via: "windsor", acciones: ["update_adset"] },
        optimizacion: { via: "windsor", acciones: ["update_adset"] },
        programacion: { via: "windsor", acciones: ["update_adset"] },
        segmentacion: { via: "windsor", acciones: ["update_adset"] },
        ubicaciones: { via: "windsor", acciones: ["update_adset"] },
      },
      anuncio: {
        nombre: { via: "windsor", acciones: ["update_ad"] },
        estado: { via: "windsor", acciones: ["pause_ad", "enable_ad"] },
        texto: { via: "windsor", acciones: ["update_ad_creative"] },
        titulo: { via: "windsor", acciones: ["update_ad_creative"] },
        descripcion: { via: "windsor", acciones: ["update_ad_creative"] },
        url_destino: { via: "windsor", acciones: ["update_ad_creative"] },
        imagen: { via: "windsor", acciones: ["update_ad_creative"] },
        cta: { via: "windsor", acciones: ["update_ad_creative"] },
        url_tags: { via: "windsor", acciones: ["update_ad_creative"] },
      },
    },
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
      // Verificados con datos reales de Colbún (2026-09-29). `source_instagram_media_id`
      // viene poblado EXACTAMENTE en los anuncios armados desde una publicación
      // de Instagram existente y en null en los propios: es la señal fiable de
      // "este anuncio reusa una publicación". `effective_object_story_id` (la
      // publicación de página que usa el anuncio, `{page_id}_{post_id}`) viene en
      // TODOS —incluidos los propios, que crean una publicación oculta—, así que
      // no distingue nada, pero es el id que pide `boost_post` para impulsarlo.
      "source_instagram_media_id",
      "effective_object_story_id",
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
    niveles: { campana: "Campaña", conjunto: "Grupo de anuncios", anuncio: "Anuncio" },
    // Solo lectura (2026-10-05). Windsor ofrece pausar, activar y presupuesto para TikTok (`list_actions`); no se
    // expone en la app hasta que se pida. Los nombres de campo se verificaron con `get_fields` del conector.
    capacidades: { campana: {}, conjunto: {}, anuncio: {} },
    connector: "tiktok",
    // Ojo: en TikTok `engagement_rate` significa CTR, no el ER% del reporte. `lib/tiktok.ts` traduce las filas.
    activa: false,
    soloLectura: true,
    camposDiarios: [
      "date",
      "account_id",
      "account_name",
      "currency",
      "spend",
      "impressions",
      "clicks",
      "reach",
      "results",
    ],
    camposCampana: [
      "account_id",
      "account_name",
      "currency",
      "campaign_id",
      "campaign_name",
      "campaign_operation_status",
      "objective_type",
      "campaign_budget",
      "spend",
      "impressions",
      "clicks",
      "reach",
      "results",
      "likes",
      "comments",
      "shares",
      "follows",
    ],
    // Pocos campos a propósito: el conector de TikTok tarda mucho a nivel de anuncio y con la creatividad (imagen,
    // texto, destino) más las interacciones se pasaba del tiempo y no llegaba ningún anuncio.
    camposAnuncio: [
      "account_id",
      "account_name",
      "currency",
      "campaign_id",
      "campaign_name",
      "campaign_operation_status",
      "ad_group_id",
      "ad_group_name",
      "ad_id",
      "ad_name",
      "ad_operation_status",
      "spend",
      "impressions",
      "clicks",
      "results",
    ],
    camposCatalogoCampana: [],
    camposCatalogoAnuncio: [],
    unidadPresupuesto: "centavos",
  },
  linkedin: {
    id: "linkedin",
    sigla: "LI",
    label: "LinkedIn Ads",
    niveles: { campana: "Grupo de campañas", conjunto: "Campaña", anuncio: "Anuncio" },
    // Lo que Windsor permite sobre lo que ya existe (list_actions, 2026-10-02). No hay forma de CREAR campañas.
    capacidades: {
      campana: {
        estado: { via: "windsor", acciones: ["pause_campaign_group", "enable_campaign_group"] },
        presupuesto: { via: "windsor", acciones: ["set_campaign_group_budget"] },
      },
      conjunto: {
        nombre: { via: "windsor", acciones: ["rename_campaign"] },
        estado: { via: "windsor", acciones: ["pause_campaign", "enable_campaign"] },
        presupuesto: { via: "windsor", acciones: ["set_campaign_budget"] },
        programacion: { via: "windsor", acciones: ["set_campaign_schedule"] },
      },
      anuncio: {
        estado: { via: "windsor", acciones: ["pause_creative", "enable_creative"] },
      },
    },
    connector: "linkedin",
    activa: false,
    soloLectura: true,
    administraExistentes: true,
    creaEnConstructor: true,
    // Verificado con get_fields y una lectura real de las cuentas de Colbún. Aquí `campaign` es el conjunto
    // y `campaign_group_*` la campaña; `lib/linkedin.ts` traduce las filas al vocabulario común.
    camposDiarios: [
      "date",
      "account_id",
      "account_name",
      "currency",
      "spend",
      "impressions",
      "clicks",
      "engagements",
      "externalwebsiteconversions",
      "oneclickleads",
    ],
    camposCampana: [
      "account_id",
      "account_name",
      "currency",
      "campaign_group_id",
      "campaign_group_name",
      "campaign_group_status",
      "campaign_id",
      "campaign",
      "campaign_status",
      "objective_type",
      "spend",
      "impressions",
      "clicks",
      "engagements",
      "landingpageclicks",
      "externalwebsiteconversions",
      "oneclickleads",
    ],
    camposAnuncio: [
      "account_id",
      "account_name",
      "currency",
      "campaign_group_id",
      "campaign_group_name",
      "campaign_group_status",
      "campaign_id",
      "campaign",
      "creative_id",
      "creative_status",
      "sponsored_creative_content_title",
      "creative_thumbnail",
      "spend",
      "impressions",
      "clicks",
      "engagements",
      "landingpageclicks",
      "externalwebsiteconversions",
      "oneclickleads",
      "video_views",
    ],
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
 * Las plataformas en las que el Constructor puede crear campañas: las activas (Google y Meta, por Windsor) más las que
 * lo declaran aparte (LinkedIn, por su API directa). El orden es el de `PLATFORMS`, el mismo que usa la pantalla.
 */
export const CONSTRUCTOR_PLATFORMS: Platform[] = PLATFORMS.filter(
  (id) => PLATFORM[id].activa || PLATFORM[id].creaEnConstructor === true,
);

export function puedeConstruir(value: string): value is Platform {
  return isPlatform(value) && (PLATFORM[value].activa || PLATFORM[value].creaEnConstructor === true);
}

/**
 * Las que se LEEN: las activas más las de solo lectura (LinkedIn). Para todo lo que sea crear, editar,
 * pausar o proponer cambios se sigue usando `ACTIVE_PLATFORMS` / `isActivePlatform`.
 */
export const LECTURA_PLATFORMS: Platform[] = PLATFORMS.filter(
  (id) => PLATFORM[id].activa || PLATFORM[id].soloLectura === true,
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

/**
 * ¿Se puede pausar, activar o editar algo que YA existe en esa plataforma? Es más amplio que
 * `isActivePlatform` (crear campañas): LinkedIn no se puede crear desde WiWO.ADS, pero lo publicado sí se
 * administra.
 */
export function puedeAdministrar(value: string): value is Platform {
  return isPlatform(value) && (PLATFORM[value].activa || PLATFORM[value].administraExistentes === true);
}

/** Nombre del nivel en esa plataforma ("Grupo de anuncios" en Google, "Conjunto de anuncios" en Meta). */
export function nombreDeNivel(id: string, nivel: NivelEntidad): string {
  return isPlatform(id) ? PLATFORM[id].niveles[nivel] : nivel;
}

/**
 * Qué puede hacerse con un campo de algo ya publicado. `null` = la plataforma
 * no lo declara: no es editable, y tampoco hay un motivo específico que dar.
 */
export function capacidadDe(
  id: string,
  nivel: NivelEntidad,
  campo: CampoEditable,
): CapacidadDeCampo | null {
  if (!isPlatform(id)) return null;
  return PLATFORM[id].capacidades[nivel][campo] ?? null;
}
