import type { PerformanceSnapshot } from "@/lib/performance-store";
import { ACTIVE_PLATFORMS, platformLabel } from "@/lib/plataformas";
import type { Platform } from "@/lib/plataformas";
import { unidadesMenoresMeta } from "@/lib/monedas";
import { nombreCompuesto } from "@/lib/nomenclatura";
import type { Objetivo } from "@/lib/objetivos";
import type { PortfolioSummary } from "@/lib/portafolios";

/**
 * Constructor de campañas: arma el plan, no lo ejecuta.
 *
 * Esta capa traduce un formulario único a lo que cada plataforma espera y
 * devuelve exactamente lo que se enviaría. NO escribe en Google ni en Meta:
 * la ejecución es un paso aparte que exige aprobación humana. Es el mismo
 * guardarraíl que rige en WIWO.Ads — simulación por defecto, escritura solo
 * con aprobación explícita — y acá se cumple por construcción: este módulo no
 * tiene forma de llamar a la API de escritura.
 *
 * La estructura de los pasos sigue la de Meta a propósito: entre las
 * plataformas activas es la más detallada, y ese detalle —categoría especial,
 * público, ubicaciones, llamada a la acción— cubre lo que casi cualquier
 * plataforma necesita, así que no hace falta inventar un campo por
 * plataforma. Donde Google no tiene equivalente real, la sección se marca
 * "Solo Meta" en vez de fingir que aplica a los dos.
 *
 * Los nombres de parámetro no son un invento: son los que exponen las
 * acciones de escritura de Windsor (`list_actions` sobre `facebook` y
 * `google_ads`, verificado el 10-09-2026). Donde Windsor no expone un campo
 * —transparencia de anuncios, seguridad de marca en Meta; edad y género en
 * Google— la sección queda como nota informativa, nunca como un parámetro que
 * en realidad no se enviaría a ningún lado.
 */

// El tipo vive en el registro de plataformas; acá solo se reexporta.
export type { Platform };

/**
 * Marca un campo que debe llenarse con el id que deja un paso anterior del
 * mismo plan —el grupo de anuncios recién creado, el video recién subido—
 * cuando ese id todavía no existe porque el paso que lo crea es parte de este
 * mismo plan. El ejecutor real (`app/api/constructor/ejecutar/route.ts`) lo
 * reemplaza por el id verdadero antes de llamar a Windsor; nunca se envía tal
 * cual. Una sola constante para los dos lados evita que el texto se
 * desincronice entre quien lo escribe y quien lo lee.
 */
export const MARCADOR_PASO_ANTERIOR = "(del paso anterior)";

export type Objective = "trafico" | "leads" | "ventas" | "alcance";

export const OBJECTIVES: Record<
  Objective,
  {
    label: string;
    google: string;
    meta: string;
    /**
     * Sigla del diccionario de nomenclatura de la agencia (AE/VTA/LDS/TRF/OCV).
     * Es la que va entre corchetes en el nombre final de la campaña. OCV
     * —llamadas, WhatsApp— no tiene un objetivo propio en este formulario:
     * hoy no hay forma de elegirlo desde acá.
     */
    sigla: Objetivo;
  }
> = {
  trafico: {
    label: "Tráfico al sitio",
    google: "maximize_clicks",
    meta: "OUTCOME_TRAFFIC",
    sigla: "TRF",
  },
  leads: {
    label: "Generar leads",
    google: "maximize_conversions",
    meta: "OUTCOME_LEADS",
    sigla: "LDS",
  },
  ventas: {
    label: "Ventas",
    google: "maximize_conversions",
    meta: "OUTCOME_SALES",
    sigla: "VTA",
  },
  alcance: {
    label: "Alcance y reconocimiento",
    google: "maximize_clicks",
    meta: "OUTCOME_AWARENESS",
    sigla: "AE",
  },
};

/**
 * Categoría especial de Meta (`special_ad_categories`).
 *
 * Existe en la API real de Meta, no en Google: campañas de vivienda, empleo,
 * crédito o temas sociales/electorales tienen reglas de segmentación
 * distintas y Meta las exige declaradas. Declarar mal esto no es un detalle
 * cosmético — Meta puede rechazar o limitar la campaña.
 */
export type SpecialAdCategory =
  | "ninguna"
  | "vivienda"
  | "empleo"
  | "credito"
  | "temas_sociales";

export const SPECIAL_AD_CATEGORIES: Record<
  SpecialAdCategory,
  { label: string; meta: string | null }
> = {
  ninguna: { label: "Ninguna", meta: null },
  vivienda: { label: "Vivienda", meta: "HOUSING" },
  empleo: { label: "Empleo", meta: "EMPLOYMENT" },
  credito: { label: "Crédito", meta: "CREDIT" },
  temas_sociales: {
    label: "Temas sociales, electorales o políticos",
    meta: "ISSUES_ELECTIONS_POLITICS",
  },
};

export type Gender = "todos" | "hombres" | "mujeres";

/**
 * Botón de destino del anuncio (`call_to_action_type` de Meta).
 *
 * Subconjunto curado del enum real que devuelve Windsor —tiene setenta y
 * tantos valores, la mayoría para nichos que no aplican acá (viajes, juegos,
 * donaciones)— con los que corresponden a los objetivos que el sistema ya
 * maneja.
 */
export type CallToAction =
  | "LEARN_MORE"
  | "SHOP_NOW"
  | "SIGN_UP"
  | "CONTACT_US"
  | "DOWNLOAD"
  | "SUBSCRIBE"
  | "GET_QUOTE"
  | "BOOK_NOW"
  | "WHATSAPP_MESSAGE"
  | "CALL_NOW";

export const CALL_TO_ACTIONS: Record<CallToAction, string> = {
  LEARN_MORE: "Más información",
  SHOP_NOW: "Comprar ahora",
  SIGN_UP: "Registrarse",
  CONTACT_US: "Contáctanos",
  DOWNLOAD: "Descargar",
  SUBSCRIBE: "Suscribirse",
  GET_QUOTE: "Cotizar",
  BOOK_NOW: "Reservar",
  WHATSAPP_MESSAGE: "Enviar WhatsApp",
  CALL_NOW: "Llamar ahora",
};

/**
 * Ubicaciones de entrega. En Meta son redes dentro del mismo conjunto de
 * anuncios (`publisher_platforms`); en Google son tipos de campaña distintos
 * —Windsor solo puede crear "search" o "display", no video ni Performance
 * Max— así que no es la misma decisión y cada plataforma la resuelve a su
 * manera en `buildPlan`.
 */
export const META_PLACEMENTS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
};

/**
 * Formato de entrega dentro de cada red — Feed, Historias o Reels, la misma
 * distinción que se ve al elegir contenido existente. Un mismo formato
 * lógico es un valor de API distinto por red (`facebook_positions` vs
 * `instagram_positions`, campos reales y documentados de la API de Meta,
 * pasados tal cual en `targeting` — Windsor no valida esto, Meta sí, así que
 * un valor mal escrito se rechaza en la ejecución, no se guarda mal en
 * silencio). "Vacío es automáticas" aplica igual que en Ubicaciones: sin
 * nada marcado, Meta reparte sola entre todos los formatos de la red.
 */
export const META_SURFACES: Record<
  string,
  { label: string; facebook: string; instagram: string }
> = {
  feed: { label: "Feed", facebook: "feed", instagram: "stream" },
  historias: { label: "Historias", facebook: "story", instagram: "story" },
  reels: { label: "Reels", facebook: "facebook_reels", instagram: "reels" },
};

export type GoogleChannel = "search" | "display";

/**
 * Id de destino geográfico de Google Ads por país (columna "Criteria ID" de
 * la tabla pública de geotargets de Google, solo a nivel país). Sin esto, la
 * segmentación geográfica de Google —que va en una acción aparte,
 * `set_campaign_geo_targeting`— no tiene forma de traducir "CL" a lo que la
 * API realmente espera.
 *
 * Los 219 países activos de la tabla oficial completa de Google
 * (developers.google.com/google-ads/api/data/geotargets, descargada y
 * cruzada contra ISO 3166-1 — nada inventado, cada id sale de esa fuente).
 * Un país fuera de esta lista (no debería quedar ninguno activo afuera) se
 * marca como no traducible en vez de inventarle un id.
 */
export const GOOGLE_GEO_TARGET_IDS: Record<string, string> = {
  AD: "2020",
  AE: "2784",
  AF: "2004",
  AG: "2028",
  AL: "2008",
  AM: "2051",
  AO: "2024",
  AQ: "2010",
  AR: "2032",
  AS: "2016",
  AT: "2040",
  AU: "2036",
  AZ: "2031",
  BA: "2070",
  BB: "2052",
  BD: "2050",
  BE: "2056",
  BF: "2854",
  BG: "2100",
  BH: "2048",
  BI: "2108",
  BJ: "2204",
  BL: "2652",
  BN: "2096",
  BO: "2068",
  BQ: "2535",
  BR: "2076",
  BS: "2044",
  BT: "2064",
  BW: "2072",
  BY: "2112",
  BZ: "2084",
  CA: "2124",
  CC: "2166",
  CD: "2180",
  CF: "2140",
  CG: "2178",
  CH: "2756",
  CI: "2384",
  CK: "2184",
  CL: "2152",
  CM: "2120",
  CN: "2156",
  CO: "2170",
  CR: "2188",
  CV: "2132",
  CW: "2531",
  CX: "2162",
  CY: "2196",
  CZ: "2203",
  DE: "2276",
  DJ: "2262",
  DK: "2208",
  DM: "2212",
  DO: "2214",
  DZ: "2012",
  EC: "2218",
  EE: "2233",
  EG: "2818",
  ER: "2232",
  ES: "2724",
  ET: "2231",
  FI: "2246",
  FJ: "2242",
  FM: "2583",
  FR: "2250",
  GA: "2266",
  GB: "2826",
  GD: "2308",
  GE: "2268",
  GG: "2831",
  GH: "2288",
  GM: "2270",
  GN: "2324",
  GQ: "2226",
  GR: "2300",
  GS: "2239",
  GT: "2320",
  GU: "2316",
  GW: "2624",
  GY: "2328",
  HM: "2334",
  HN: "2340",
  HR: "2191",
  HT: "2332",
  HU: "2348",
  ID: "2360",
  IE: "2372",
  IL: "2376",
  IM: "2833",
  IN: "2356",
  IQ: "2368",
  IS: "2352",
  IT: "2380",
  JE: "2832",
  JM: "2388",
  JO: "2400",
  JP: "2392",
  KE: "2404",
  KG: "2417",
  KH: "2116",
  KI: "2296",
  KM: "2174",
  KN: "2659",
  KR: "2410",
  KW: "2414",
  KZ: "2398",
  LA: "2418",
  LB: "2422",
  LC: "2662",
  LI: "2438",
  LK: "2144",
  LR: "2430",
  LS: "2426",
  LT: "2440",
  LU: "2442",
  LV: "2428",
  LY: "2434",
  MA: "2504",
  MC: "2492",
  MD: "2498",
  ME: "2499",
  MF: "2663",
  MG: "2450",
  MH: "2584",
  MK: "2807",
  ML: "2466",
  MM: "2104",
  MN: "2496",
  MP: "2580",
  MR: "2478",
  MT: "2470",
  MU: "2480",
  MV: "2462",
  MW: "2454",
  MX: "2484",
  MY: "2458",
  MZ: "2508",
  NA: "2516",
  NC: "2540",
  NE: "2562",
  NF: "2574",
  NG: "2566",
  NI: "2558",
  NL: "2528",
  NO: "2578",
  NP: "2524",
  NR: "2520",
  NU: "2570",
  NZ: "2554",
  OM: "2512",
  PA: "2591",
  PE: "2604",
  PF: "2258",
  PG: "2598",
  PH: "2608",
  PK: "2586",
  PL: "2616",
  PM: "2666",
  PN: "2612",
  PT: "2620",
  PW: "2585",
  PY: "2600",
  QA: "2634",
  RO: "2642",
  RS: "2688",
  RU: "2643",
  RW: "2646",
  SA: "2682",
  SB: "2090",
  SC: "2690",
  SD: "2736",
  SE: "2752",
  SG: "2702",
  SH: "2654",
  SI: "2705",
  SK: "2703",
  SL: "2694",
  SM: "2674",
  SN: "2686",
  SO: "2706",
  SR: "2740",
  SS: "2728",
  ST: "2678",
  SV: "2222",
  SX: "2534",
  SY: "2760",
  SZ: "2748",
  TD: "2148",
  TF: "2260",
  TG: "2768",
  TH: "2764",
  TJ: "2762",
  TK: "2772",
  TL: "2626",
  TM: "2795",
  TN: "2788",
  TO: "2776",
  TR: "2792",
  TT: "2780",
  TV: "2798",
  TZ: "2834",
  UA: "2804",
  UG: "2800",
  UM: "2581",
  US: "2840",
  UY: "2858",
  UZ: "2860",
  VA: "2336",
  VC: "2670",
  VE: "2862",
  VN: "2704",
  VU: "2548",
  WF: "2876",
  WS: "2882",
  YE: "2887",
  ZA: "2710",
  ZM: "2894",
  ZW: "2716",
};

/**
 * Límite del radio de segmentación por círculo — el más estricto de los dos
 * (Meta rechaza `custom_locations` fuera de 1-80 km; Google admite bastante
 * más), para que un mismo valor sirva para las dos plataformas a la vez.
 */
export const RADIO_MINIMO_KM = 1;
export const RADIO_MAXIMO_KM = 80;

/**
 * Base con la que el asistente de IA puede precargar una campaña nueva
 * (ver `abrir_constructor` en `lib/asistente.ts`). Deliberadamente no trae
 * presupuesto ni segmentación fina: eso se elige recién dentro del
 * Constructor, una vez que se sabe la cuenta real y su moneda.
 */
export type SemillaDeCampana = {
  name: string;
  objective: Objective;
  platforms: Platform[];
  /** Nota interna visible en "Detalles" — nunca se envía a ninguna plataforma. */
  details: string;
  targetCountries: string[];
};

/** Una región/estado/provincia o ciudad/comuna real, tal como la devuelve
 * `/api/geo-targets` — `id` es el geo_target_constant_id real de Google. */
export type LugarSegmentable = {
  id: string;
  nombre: string;
  countryCode: string;
  tier: "region" | "city";
};

export type CampaignDraft = {
  portfolioId: string;
  platforms: Platform[];
  /**
   * Qué cuenta usar por plataforma, cuando el cliente tiene varias.
   *
   * ALO Group tiene seis cuentas de Google —una por país— y SQM tiene tres de
   * Meta. Sin esto no hay forma de decir a cuál de las varias se publica.
   * Vacío cuando el cliente solo tiene una cuenta en esa plataforma: ahí no
   * hace falta elegir.
   */
  accountByPlatform: Partial<Record<Platform, string>>;
  name: string;
  /** Nota interna del equipo. No se envía a ninguna plataforma. */
  details: string;
  objective: Objective;
  /** Solo aplica a Meta; Google no tiene este concepto. */
  specialAdCategory: SpecialAdCategory;
  /**
   * Dónde termina la conversión. "Mensajes" cambia el conjunto de anuncios a
   * un anuncio de clic-a-mensaje (`destination_type: MESSENGER`) en vez de
   * uno que lleva al sitio. Solo Meta: Google no tiene este concepto.
   */
  conversionLocation: "sitio_web" | "mensajes";
  /** Presupuesto diario en unidades de la moneda, no en micros ni centavos. */
  dailyBudget: number | null;
  /**
   * Presupuesto distinto por plataforma, cuando se publica en varias a la
   * vez. Vacío: las dos usan `dailyBudget`. Con una entrada, esa plataforma
   * usa la suya y las demás siguen con el valor compartido — así elegir un
   * monto distinto para Meta no obliga a definir también el de Google.
   */
  budgetByPlatform: Partial<Record<Platform, number>>;
  /**
   * Meta distingue presupuesto diario y total (vitalicio); Google, por esta
   * vía, solo crea presupuesto diario. "Total" en Google queda sin efecto y
   * el plan lo dice en vez de fingir que se aplicó.
   */
  budgetMode: "diaria" | "total";
  /** Fecha de término. Solo tiene efecto real en Meta con presupuesto total. */
  endDate: string | null;
  landingUrl: string;
  /** Google: 3 a 15 títulos de 30 caracteres. */
  headlines: string[];
  /** Google: 2 a 4 descripciones de 90 caracteres. */
  descriptions: string[];
  /**
   * Google: los dos segmentos opcionales de la URL visible, hasta 15
   * caracteres cada uno — lo que en un resultado real se ve como
   * "tusitio.com › segmento1 › segmento2". `path2` exige `path1`.
   */
  pathDisplay1: string;
  pathDisplay2: string;
  /**
   * Google: palabras clave del grupo de anuncios. Sin esto una campaña de
   * Búsqueda no tiene qué disparar los anuncios — no es un campo opcional,
   * es la base de la segmentación en Search.
   *
   * Se escriben con la sintaxis real de Google Ads: `palabra` es
   * concordancia amplia, `"palabra"` es de frase, `[palabra]` es exacta. Se
   * interpreta al armar el plan, no acá.
   */
  keywords: string[];
  /** Meta: texto principal del anuncio. */
  message: string;
  /**
   * Meta: título y descripción del anuncio, la línea en negrita y la línea
   * chica que van debajo de la imagen — un campo distinto del texto
   * principal, que va arriba. Los dos son opcionales en la API real: sin
   * ellos, Meta arma el anuncio solo con el texto principal.
   */
  metaHeadline: string;
  metaDescription: string;
  /** Meta: URL pública de la imagen o del video. */
  mediaUrl: string;
  mediaType: "image" | "video" | "none";
  /**
   * Id real de una publicación de Facebook ya existente (`{page_id}_{post_id}`,
   * tal como lo entrega Windsor), cuando el anuncio va a boostear esa
   * publicación en vez de crear una pieza nueva — el mismo camino que
   * "Impulsar publicación" en Meta Ads Manager, que conserva los likes,
   * comentarios y compartidos reales de la publicación en vez de partir de
   * cero. Solo Facebook: Windsor no confirma el mismo formato de id para
   * publicaciones de Instagram, así que esas siguen armando un anuncio nuevo
   * con la imagen como pieza. `null` en cualquier otro caso —incluida una
   * publicación de Instagram elegida, o cualquier cambio manual posterior de
   * la pieza— para no boostear por accidente algo que la persona ya
   * reemplazó.
   */
  boostPostId: string | null;
  /**
   * Dónde vive el presupuesto de Meta. "campana" es presupuesto de campaña
   * (Advantage Campaign Budget) — la campaña reparte el gasto entre sus
   * conjuntos, y es el default real de Meta hoy; con esto el conjunto se crea
   * sin `daily_budget` ni `lifetime_budget`, los toma de la campaña. "conjunto"
   * le da su propio presupuesto a cada conjunto en vez de compartir uno —
   * hace falta cuando dos conjuntos de la misma campaña deben gastar montos
   * distintos a propósito, algo que CBO no permite.
   */
  metaBudgetLevel: "campana" | "conjunto";
  /** Público: edad y género. Google no admite esto por esta vía. */
  ageMin: number;
  ageMax: number;
  gender: Gender;
  /** Ubicaciones, lado Google: tipo de campaña. */
  googleChannel: GoogleChannel;
  /** Ubicaciones, lado Meta: redes elegidas. Vacío = automáticas (todas). */
  metaPlacements: string[];
  /** Formato de entrega (Feed/Historias/Reels) dentro de esas redes. Vacío = automático. */
  metaSurfaces: string[];
  /**
   * Ids reales de interés de Meta (`flexible_spec`), no nombres — Meta exige
   * el id numérico y no hay forma de buscarlo desde acá todavía (esa
   * búsqueda no está entre las acciones que Windsor expone). Alguien que ya
   * conozca el id desde Meta Ads Manager o Audience Insights puede pegarlo
   * acá; sin eso, la segmentación por interés queda fuera de esta pantalla.
   */
  metaInterests: string[];
  /**
   * Países a segmentar, código ISO-3166-1 alfa-2 (`CL`, `PE`...), elegidos en
   * el mapa. Vacío: se usan los países que la cuenta elegida ya trae
   * declarados (comportamiento anterior a este selector). Solo ofrece países
   * con id de destino geográfico de Google verificado (`GOOGLE_GEO_TARGET_IDS`
   * en este mismo archivo) — nunca uno inventado.
   */
  targetCountries: string[];
  /**
   * Regiones/estados/provincias y ciudades/comunas reales, elegidas por
   * búsqueda (`/api/geo-targets`, tabla `geo_targets` sembrada desde la misma
   * fuente oficial que `GOOGLE_GEO_TARGET_IDS`). Solo las usa Google: Meta no
   * expone, a través de Windsor, una forma de buscar sus propios ids de
   * región/ciudad —son un sistema de ids completamente distinto—, así que
   * elegir un lugar acá no segmenta la campaña de Meta, que sigue por país o
   * por radio.
   */
  targetPlaces: LugarSegmentable[];
  /**
   * Segmentación por radio — el círculo que se dibuja en el mapa—, además o
   * en vez de países. A diferencia de intereses o ciudades, esto NO exige
   * buscar un id en ninguna plataforma: Meta acepta lat/lng/radio tal cual
   * (`geo_locations.custom_locations`, documentado en su Marketing API) y
   * Google también (`set_campaign_geo_targeting.proximities`, expuesto por
   * Windsor). `radiusKm` ya viene acotado a lo que las dos plataformas
   * aceptan en `normalizeDraft`.
   */
  geoRadius: { lat: number; lng: number; radiusKm: number } | null;
  /**
   * Países a EXCLUIR a propósito — para dejar fuera a mano un mercado que ya
   * cubre otro equipo, o para armar una zona de control manual (comparar el
   * rendimiento de donde sí hay anuncio contra donde a propósito no lo hay,
   * fuera de esta pantalla — no hay forma de medir la incrementalidad de
   * verdad sin un experimento con grupo de control real, pero excluir una
   * zona a propósito es el primer paso para poder armar uno a mano). Real en
   * las dos plataformas: Google marca la ubicación con `negative: true` en
   * `set_campaign_geo_targeting`; Meta usa `excluded_geo_locations`, un campo
   * hermano de `geo_locations` con la misma forma (verificado en su
   * documentación de segmentación básica).
   */
  excludedCountries: string[];
  callToAction: CallToAction;
  /**
   * Nivel de seguridad de marca declarado por el equipo. Es documentación
   * interna: Meta no expone un parámetro de escritura para esto (se
   * administra en su propia herramienta de Seguridad de Marca), así que no
   * viaja en ningún paso del plan salvo como nota informativa.
   */
  brandSafety: "estandar" | "restringido" | "ampliado";
  /**
   * Cuando no es null, el plan no crea una campaña nueva: añade un conjunto
   * de anuncios (y de ahí para abajo) a una que ya existe. Trae el id nativo
   * de la plataforma —no el nombre— porque eso es lo que Windsor exige para
   * escribir sobre algo que ya está creado.
   */
  existingCampaign: {
    platform: Platform;
    accountId: string;
    campaignId: string;
    campaignName: string;
  } | null;
  /**
   * Cuando no es null, tampoco se crea un conjunto de anuncios nuevo: el
   * anuncio se añade directo al que ya existe. Solo tiene sentido junto con
   * `existingCampaign`.
   */
  existingAdset: { adsetId: string; adsetName: string } | null;
};

/** Cuenta de un cliente, tal como la expone `/api/clientes`. */
export type CuentaCliente = {
  externalId: string;
  name: string;
  provider: string;
  currency: string | null;
  pageId: string | null;
  countries: string[];
};

export type Issue = { field: string; message: string; blocking: boolean };

export type BudgetAdvice = {
  /** Sugerencia diaria en la moneda de la cuenta, o null si no hay historia. */
  suggested: number | null;
  currency: string | null;
  basis: string;
};

export type PlanStep = {
  platform: Platform;
  action: string;
  label: string;
  params: Record<string, unknown>;
  /** true: informativo — Windsor no tiene una acción que reciba esto. */
  informativo?: boolean;
};

export type BuildResult = {
  issues: Issue[];
  budget: BudgetAdvice;
  steps: PlanStep[];
  /** Siempre true en esta fase: nada de esto se ejecuta todavía. */
  simulation: true;
};

/**
 * Sugiere un presupuesto diario a partir de lo que el cliente ya invierte.
 *
 * No se inventa un número: se toma el gasto real del mes en esa plataforma y
 * se divide por los días transcurridos. Si el cliente no tiene historia en la
 * plataforma, se devuelve null y la interfaz lo dice, en vez de proponer una
 * cifra sin fundamento.
 */
export function recommendBudget(
  portfolio: PortfolioSummary | null,
  platform: Platform,
  snapshot: PerformanceSnapshot,
): BudgetAdvice {
  if (!portfolio) {
    // Pasa tanto si no se eligió cliente como si el elegido no tiene
    // inversión en el periodo — que es lo normal en un cliente al que recién
    // se le va a armar una campaña. En los dos casos la respuesta honesta es
    // la misma: no hay historia sobre la cual sugerir nada.
    return {
      suggested: null,
      currency: null,
      basis: "Sin inversión previa en el periodo: define el presupuesto a mano",
    };
  }

  const provider = portfolio.byProvider.find(
    (item) => item.provider === platform,
  );
  const totals = provider?.currencyTotals ?? [];

  if (totals.length === 0) {
    return {
      suggested: null,
      currency: null,
      basis: `${portfolio.name} no tiene inversión registrada en ${platformLabel(platform)} este mes`,
    };
  }
  if (totals.length > 1) {
    return {
      suggested: null,
      currency: null,
      basis: "El cliente factura en varias monedas: define el presupuesto a mano",
    };
  }

  const total = totals[0];
  const days = daysElapsed(snapshot.rangeStart, snapshot.rangeEnd);
  const daily = total.spendMicros / 1_000_000 / Math.max(days, 1);

  return {
    suggested: Math.round(daily),
    currency: total.currency,
    basis: `Promedio diario de ${portfolio.name} en el mes: ${days} ${days === 1 ? "día" : "días"} de inversión real`,
  };
}

/** La cuenta elegida (o la única disponible) de un cliente en una plataforma. */
function cuentaElegida(
  draft: CampaignDraft,
  cuentas: CuentaCliente[],
  platform: Platform,
): CuentaCliente | null {
  const delPlatform = cuentas.filter((c) => c.provider === platform);
  const elegidaId = draft.accountByPlatform[platform];
  if (elegidaId) {
    return delPlatform.find((c) => c.externalId === elegidaId) ?? null;
  }
  return delPlatform.length === 1 ? delPlatform[0] : null;
}

/**
 * Países efectivos para segmentar: los elegidos a mano en el mapa
 * (`targetCountries`), o si no se tocó nada, los que la cuenta ya trae
 * declarados — el comportamiento de siempre, ahora como valor por defecto en
 * vez de la única opción.
 */
function paisesEfectivos(
  draft: CampaignDraft,
  cuenta: CuentaCliente | null,
): string[] {
  return draft.targetCountries.length > 0
    ? draft.targetCountries
    : (cuenta?.countries ?? []);
}

/**
 * Por qué una URL de pieza no le sirve a Meta, o null si le sirve. Se dice el
 * motivo exacto en vez de un genérico: una URL vacía, una sin https:// y una
 * de localhost fallan por razones distintas y se arreglan distinto. La de
 * localhost es la que más importa atrapar acá — pasa cualquier chequeo de
 * formato, pero Meta no puede descargarla, y descubrirlo recién al ejecutar
 * dejaría una campaña y un conjunto ya creados sin anuncio.
 */
function problemaDeUrlPublica(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) {
    return "Falta la URL de la pieza: pega una dirección que empiece con https:// (o sube el archivo)";
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return "La URL de la pieza no es válida: debe empezar con https:// (por ejemplo https://tusitio.com/imagen.jpg)";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "La URL de la pieza debe empezar con https://";
  }
  const host = url.hostname.toLowerCase();
  const privado =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (privado) {
    return `La pieza está en una dirección local (${host}): Meta no puede descargarla desde ahí. Usa una URL pública`;
  }
  return null;
}

/**
 * Valida el borrador contra los límites reales de cada plataforma.
 *
 * Los límites no son de la aplicación: son de Google y de Meta. Avisar acá
 * evita que un anuncio se rechace después de haberlo aprobado.
 */
export function validateDraft(
  draft: CampaignDraft,
  cuentas: CuentaCliente[],
): Issue[] {
  const issues: Issue[] = [];
  const add = (field: string, message: string, blocking = true) =>
    issues.push({ field, message, blocking });

  const etiquetaNombre = draft.existingAdset
    ? "El anuncio necesita un nombre"
    : draft.existingCampaign
      ? "El conjunto de anuncios necesita un nombre"
      : "La campaña necesita un nombre";
  if (!draft.name.trim()) add("name", etiquetaNombre);
  if (draft.existingAdset && !draft.existingCampaign) {
    // No debería poder pasar desde la interfaz, pero si pasa, mejor decirlo
    // que crear un conjunto de anuncios suelto sin campaña.
    add("existingCampaign", "Falta la campaña a la que pertenece ese conjunto");
  }
  const paisesEnConflicto = draft.targetCountries.filter((p) =>
    draft.excludedCountries.includes(p),
  );
  if (paisesEnConflicto.length > 0) {
    add(
      "excludedCountries",
      `${paisesEnConflicto.join(", ")} está a la vez marcado para segmentar y para excluir — quítalo de uno de los dos`,
    );
  }
  if (draft.platforms.length === 0) {
    add("platforms", "Elige al menos una plataforma");
  }
  if (!draft.portfolioId) add("portfolioId", "Elige un cliente");

  if (draft.dailyBudget !== null && draft.dailyBudget <= 0) {
    add("dailyBudget", "El presupuesto diario debe ser mayor que cero");
  }
  for (const [plataforma, monto] of Object.entries(draft.budgetByPlatform)) {
    if (monto <= 0) {
      add(
        "dailyBudget",
        `El presupuesto de ${platformLabel(plataforma)} debe ser mayor que cero`,
      );
    }
  }
  // Falta presupuesto solo si una plataforma elegida se queda sin ninguno de
  // los dos: ni el suyo propio ni el compartido.
  const sinPresupuesto = draft.platforms.filter(
    (p) => draft.budgetByPlatform[p] === undefined && draft.dailyBudget === null,
  );
  if (sinPresupuesto.length > 0) {
    add(
      "dailyBudget",
      draft.platforms.length > 1
        ? `Falta presupuesto para ${sinPresupuesto.map(platformLabel).join(" y ")}`
        : "Define un presupuesto diario",
    );
  }
  if (draft.ageMin > draft.ageMax) {
    add("ageMin", "La edad mínima no puede superar a la máxima");
  }

  const url = draft.landingUrl.trim();
  if (draft.platforms.includes("google") && !url) {
    add("landingUrl", "Google Ads exige una URL de destino");
  }
  // Meta no la exige cuando el destino de conversión es mensajes (no hay
  // sitio al que llevar), pero con un destino de sitio web publicar sin
  // link crea un anuncio sin URL — antes esto pasaba la validación y
  // solo se notaba al fallar (o al quedar roto) ya en la plataforma.
  if (
    draft.platforms.includes("meta") &&
    draft.conversionLocation !== "mensajes" &&
    !url
  ) {
    add("landingUrl", "Meta Ads exige una URL de destino (o cambia el destino de conversión a mensajes)");
  }
  if (url && !/^https?:\/\//i.test(url)) {
    add("landingUrl", "La URL debe empezar con http:// o https://");
  }

  for (const platform of draft.platforms) {
    const delPlatform = cuentas.filter((c) => c.provider === platform);
    if (delPlatform.length === 0) {
      add(
        "accountByPlatform",
        `Este cliente no tiene ninguna cuenta de ${platformLabel(platform)}`,
      );
    } else if (delPlatform.length > 1 && !draft.accountByPlatform[platform]) {
      // ALO Group (6 cuentas de Google) y SQM (3 de Meta) son el caso real
      // que exige esto: sin elegir, no hay forma de saber dónde publicar.
      add(
        "accountByPlatform",
        `${platformLabel(platform)}: elige en cuál de sus ${delPlatform.length} cuentas se publica`,
      );
    }
  }

  if (draft.platforms.includes("google")) {
    const titulos = draft.headlines.filter((t) => t.trim());
    if (titulos.length < 3) {
      add("headlines", "Google pide entre 3 y 15 títulos");
    }
    if (titulos.some((t) => t.length > 30)) {
      add("headlines", "Cada título de Google admite hasta 30 caracteres");
    }
    const descripciones = draft.descriptions.filter((d) => d.trim());
    if (descripciones.length < 2) {
      add("descriptions", "Google pide entre 2 y 4 descripciones");
    }
    if (descripciones.some((d) => d.length > 90)) {
      add("descriptions", "Cada descripción admite hasta 90 caracteres");
    }
    if (draft.mediaType !== "none") {
      add(
        "mediaUrl",
        "Google Ads no crea anuncios con imagen por esta vía: la pieza solo se usará en Meta",
        false,
      );
    }
    // Solo en Búsqueda: en Display las palabras clave no son la segmentación
    // principal, y exigirlas ahí bloquearía un caso válido sin necesidad.
    if (draft.googleChannel === "search" && draft.keywords.filter((k) => k.trim()).length === 0) {
      add(
        "keywords",
        "Una campaña de Búsqueda necesita al menos una palabra clave: sin eso, el anuncio no tiene qué lo dispare",
      );
    }
    if (draft.pathDisplay2.trim() && !draft.pathDisplay1.trim()) {
      add("pathDisplay1", "La segunda ruta de la URL exige la primera");
    }
    if (draft.pathDisplay1.length > 15 || draft.pathDisplay2.length > 15) {
      add("pathDisplay1", "Cada ruta de la URL visible admite hasta 15 caracteres");
    }
    const cuentaGoogle = cuentaElegida(draft, cuentas, "google");
    const paisesGoogle = paisesEfectivos(draft, cuentaGoogle);
    const sinTraducir = [...paisesGoogle, ...draft.excludedCountries].filter(
      (p) => !GOOGLE_GEO_TARGET_IDS[p],
    );
    if (sinTraducir.length > 0) {
      add(
        "googleChannel",
        `Google: ${sinTraducir.join(", ")} no tiene id de destino geográfico cargado; la ubicación quedará sin ese país`,
        false,
      );
    }
  }

  if (draft.platforms.includes("meta")) {
    const cuentaMeta = cuentaElegida(draft, cuentas, "meta");
    if (draft.targetPlaces.length > 0) {
      add(
        "targetPlaces",
        "Meta no segmenta por región o ciudad elegida acá: solo Google la usa. La campaña de Meta sigue por país o por radio.",
        false,
      );
    }
    // Meta publica en nombre de una página: sin ella el anuncio no existe.
    if (!cuentaMeta?.pageId) {
      add(
        "accountByPlatform",
        "La cuenta de Meta elegida no tiene página de Facebook declarada: sin ella no puede publicar",
      );
    }
    const paisesMeta = paisesEfectivos(draft, cuentaMeta);
    if (paisesMeta.length === 0 && !draft.geoRadius) {
      add(
        "accountByPlatform",
        "Falta un país o una zona por radio para segmentar: la cuenta de Meta no trae países declarados y no se eligió ninguno en el mapa",
      );
    }
    // Boosteando, `boost_post` reutiliza la publicación real —no hace falta
    // texto ni pieza propia, así que exigirlos acá bloquearía sin motivo un
    // plan válido (por ejemplo, una publicación real sin descripción).
    const boosteandoValidacion =
      Boolean(draft.boostPostId) &&
      !draft.existingCampaign &&
      !draft.existingAdset;
    if (!boosteandoValidacion && !draft.message.trim()) {
      add("message", "Meta necesita el texto principal del anuncio");
    }
    if (!boosteandoValidacion && draft.mediaType === "none") {
      add("mediaUrl", "Meta necesita una imagen o un video");
    } else if (!boosteandoValidacion) {
      // Windsor no recibe archivos: va a buscar la pieza a una URL pública.
      const problema = problemaDeUrlPublica(draft.mediaUrl);
      if (problema) add("mediaUrl", problema);
    }
    if (draft.budgetMode === "total" && !draft.endDate) {
      add(
        "endDate",
        "El presupuesto total de Meta exige una fecha de término",
      );
    }
  }

  return issues;
}

/**
 * Traduce el borrador a los pasos que se ejecutarían en cada plataforma.
 *
 * Se devuelven los parámetros exactos de cada acción de Windsor, para que la
 * persona que aprueba vea lo que va a pasar y no una descripción aproximada.
 * Todo nace pausado.
 */
export function buildPlan(
  draft: CampaignDraft,
  portfolio: PortfolioSummary | null,
  cuentas: CuentaCliente[],
  snapshot: PerformanceSnapshot,
): BuildResult {
  const issues = validateDraft(draft, cuentas);
  const steps: PlanStep[] = [];
  const objective = OBJECTIVES[draft.objective];
  // Cada plataforma resuelve su propio monto: el suyo si se definió aparte,
  // si no el compartido. Así elegir $10.000 solo para Meta no toca lo que
  // Google va a usar.
  const presupuestoDe = (plataforma: Platform): number =>
    draft.budgetByPlatform[plataforma] ?? draft.dailyBudget ?? 0;

  const enCampanaExistente =
    draft.existingCampaign?.platform === "google" ? draft.existingCampaign : null;
  const enConjuntoExistente = enCampanaExistente ? draft.existingAdset : null;

  if (draft.platforms.includes("google")) {
    const cuenta = cuentaElegida(draft, cuentas, "google");

    if (!enCampanaExistente) {
      steps.push({
        platform: "google",
        action: "create_campaign",
        label: cuenta
          ? `Crear campaña en ${cuenta.name} (pausada)`
          : "Crear campaña (pausada)",
        params: {
          // Siglas propias, no el nombre a secas: [OBJETIVO] [PLATAFORMA]
          // identifica de un vistazo qué es esto y de quién es, incluso en
          // una cuenta que también maneja otra agencia.
          name: nombreCompuesto(objective.sigla, "google", draft.name),
          // Google trabaja en micros: 1.000.000 = una unidad de la moneda.
          budget_amount_micros: Math.round(presupuestoDe("google") * 1_000_000),
          channel_type: draft.googleChannel,
          bidding_strategy:
            objective.google === "maximize_conversions"
              ? "maximize_conversions"
              : "target_spend",
          status: "paused",
        },
      });
    }

    if (!enConjuntoExistente) {
      steps.push({
        platform: "google",
        action: "create_ad_group",
        label: enCampanaExistente
          ? `Crear grupo de anuncios en «${enCampanaExistente.campaignName}» (pausado)`
          : "Crear grupo de anuncios (pausado)",
        params: {
          name: enCampanaExistente ? draft.name : `${draft.name} · principal`,
          status: "paused",
          ...(enCampanaExistente
            ? { campaign_id: enCampanaExistente.campaignId }
            : {}),
        },
      });
    }

    steps.push({
      platform: "google",
      action: "create_responsive_search_ad",
      label: enConjuntoExistente
        ? `Crear anuncio en «${enConjuntoExistente.adsetName}» (pausado)`
        : "Crear anuncio de búsqueda responsivo (pausado)",
      params: {
        // Igual que el video_id de Meta más abajo: si el grupo se crea en
        // este mismo plan, su id real solo existe después de ejecutar el
        // paso anterior. `create_responsive_search_ad` lo exige siempre.
        ad_group_id: enConjuntoExistente?.adsetId ?? MARCADOR_PASO_ANTERIOR,
        headlines: draft.headlines.filter((t) => t.trim()),
        descriptions: draft.descriptions.filter((d) => d.trim()),
        final_url: draft.landingUrl.trim(),
        status: "paused",
        ...(draft.pathDisplay1.trim() ? { path1: draft.pathDisplay1.trim() } : {}),
        ...(draft.pathDisplay2.trim() ? { path2: draft.pathDisplay2.trim() } : {}),
      },
    });

    // Palabras clave: van en el grupo de anuncios, no en la campaña. Sin
    // esto un grupo de Búsqueda queda creado pero no puede entregar nada —
    // no tiene qué lo dispare.
    const palabrasClave = draft.keywords
      .map((linea) => linea.trim())
      .filter(Boolean)
      .map(parsearPalabraClave);
    if (palabrasClave.length > 0) {
      steps.push({
        platform: "google",
        action: "push_keywords",
        label: enConjuntoExistente
          ? `Añadir palabras clave a «${enConjuntoExistente.adsetName}»`
          : "Añadir palabras clave al grupo de anuncios",
        params: {
          ad_group_id: enConjuntoExistente?.adsetId ?? MARCADOR_PASO_ANTERIOR,
          keywords: palabrasClave,
        },
      });
    }

    // Ubicaciones: acción aparte de Google, no un campo de create_campaign.
    // Solo se define para una campaña nueva — una que ya existe puede tener
    // una segmentación deliberada, y este plan no la toca.
    if (!enCampanaExistente) {
      const paises = paisesEfectivos(draft, cuenta);
      const locations = [
        ...paises
          .filter((p) => GOOGLE_GEO_TARGET_IDS[p])
          .map((p) => ({ geo_target_constant_id: GOOGLE_GEO_TARGET_IDS[p] })),
        // Regiones y ciudades elegidas por búsqueda: mismo campo que país,
        // solo que el id ya viene resuelto desde `geo_targets` en vez de la
        // tabla estática de 219 países.
        ...draft.targetPlaces.map((lugar) => ({
          geo_target_constant_id: lugar.id,
        })),
        // Exclusiones: mismo campo, con `negative: true` — el flag real que
        // expone la acción para dejar un país fuera a propósito.
        ...draft.excludedCountries
          .filter((p) => GOOGLE_GEO_TARGET_IDS[p])
          .map((p) => ({
            geo_target_constant_id: GOOGLE_GEO_TARGET_IDS[p],
            negative: true,
          })),
      ];
      // Círculo del mapa: no exige id de destino geográfico, `proximities`
      // toma coordenadas y radio tal cual.
      const proximities = draft.geoRadius
        ? [
            {
              latitude: draft.geoRadius.lat,
              longitude: draft.geoRadius.lng,
              radius: draft.geoRadius.radiusKm,
              radius_units: "KILOMETERS" as const,
            },
          ]
        : [];
      if (locations.length > 0 || proximities.length > 0) {
        steps.push({
          platform: "google",
          action: "set_campaign_geo_targeting",
          label: "Definir ubicaciones",
          params: {
            // Antes faltaba: sin esto el ejecutor no tiene cómo completar el
            // id de la campaña recién creada y Windsor rechaza el paso por
            // falta de `campaign_id`.
            campaign_id: MARCADOR_PASO_ANTERIOR,
            locations,
            ...(proximities.length > 0 ? { proximities } : {}),
          },
        });
      }
    }
  }

  const enCampanaMetaExistente =
    draft.existingCampaign?.platform === "meta" ? draft.existingCampaign : null;
  const enConjuntoMetaExistente = enCampanaMetaExistente ? draft.existingAdset : null;
  // Solo boostea cuando este mismo plan crea campaña Y conjunto desde cero:
  // es la única forma de garantizar que el conjunto quede con el objetivo de
  // interacción que `boost_post` exige. Adjuntando a algo que ya existe no
  // hay forma de confirmar ese objetivo sin arriesgarse a que Meta rechace
  // el boost — ahí se arma un anuncio nuevo con la imagen, como antes.
  const boosteando =
    Boolean(draft.boostPostId) && !enCampanaMetaExistente && !enConjuntoMetaExistente;

  if (draft.platforms.includes("meta")) {
    const cuenta = cuentaElegida(draft, cuentas, "meta");
    const categoria = SPECIAL_AD_CATEGORIES[draft.specialAdCategory].meta;

    // El presupuesto de campaña (Advantage Campaign Budget) es el default
    // real de Meta hoy: la campaña reparte el gasto entre sus conjuntos, en
    // vez de que cada conjunto tenga el suyo. Solo aplica creando la campaña
    // acá — adjuntando a una que ya existe no se sabe si ya usa CBO, y
    // suponerlo podría chocar con lo que el cliente ya tiene configurado.
    const conCBO = draft.metaBudgetLevel === "campana" && !enCampanaMetaExistente;

    if (!enCampanaMetaExistente) {
      steps.push({
        platform: "meta",
        action: "create_campaign",
        label: cuenta
          ? `Crear campaña en ${cuenta.name} (pausada)`
          : "Crear campaña (pausada)",
        params: {
          name: nombreCompuesto(objective.sigla, "meta", draft.name),
          // Boostear exige una campaña de interacción — el objetivo elegido
          // en el paso de Campaña no aplica acá, igual que en Meta Ads
          // Manager al usar "Impulsar publicación".
          objective: boosteando ? "OUTCOME_ENGAGEMENT" : objective.meta,
          special_ad_categories: categoria ? [categoria] : [],
          // Meta trabaja en la unidad menor: 5000 = 50,00.
          ...(conCBO
            ? {
                ...(draft.budgetMode === "total"
                  ? { lifetime_budget: Math.round(presupuestoDe("meta") * unidadesMenoresMeta(cuenta?.currency)) }
                  : { daily_budget: Math.round(presupuestoDe("meta") * unidadesMenoresMeta(cuenta?.currency)) }),
                // El presupuesto vive en la campaña (CBO), así que la puja
                // también va acá. "Sin límite" es el default real de Meta
                // Ads Manager — no pide bid_amount, a diferencia de "con
                // límite de puja" o "costo objetivo", que sí lo exigen y que
                // nadie puede inventar sin conocer la cuenta.
                bid_strategy: "LOWEST_COST_WITHOUT_CAP",
              }
            : // Sin presupuesto de campaña, Windsor avisa que algunas cuentas
              // exigen declarar esto explícito: que el gasto NO se comparte
              // entre conjuntos, porque cada uno trae el suyo propio.
              { is_adset_budget_sharing_enabled: false }),
          status: "paused",
        },
      });
    }

    // Público y ubicaciones van en `targeting`, el objeto genérico que Meta
    // define en su API real y que Windsor pasa tal cual.
    const paisesMetaPlan = paisesEfectivos(draft, cuenta);
    const geoLocations: Record<string, unknown> = {};
    if (paisesMetaPlan.length > 0) geoLocations.countries = paisesMetaPlan;
    if (draft.geoRadius) {
      // Círculo del mapa: campo real y documentado de la Marketing API de
      // Meta (`geo_locations.custom_locations`), no una acción aparte — no
      // exige buscar ningún id, a diferencia de región o ciudad.
      geoLocations.custom_locations = [
        {
          latitude: draft.geoRadius.lat,
          longitude: draft.geoRadius.lng,
          radius: draft.geoRadius.radiusKm,
          distance_unit: "kilometer",
        },
      ];
    }
    const targeting: Record<string, unknown> = {
      geo_locations: geoLocations,
      age_min: draft.ageMin,
      age_max: draft.ageMax,
    };
    if (draft.excludedCountries.length > 0) {
      // Campo hermano de `geo_locations`, misma forma — documentado en la
      // referencia de segmentación básica de Meta.
      targeting.excluded_geo_locations = { countries: draft.excludedCountries };
    }
    if (draft.gender !== "todos") {
      targeting.genders = draft.gender === "hombres" ? [1] : [2];
    }
    if (draft.metaSurfaces.length > 0) {
      // Un formato de entrega puntual (Feed/Historias/Reels) solo tiene
      // sentido declarado junto a en qué redes — sin esto, Meta puede
      // rechazar `facebook_positions`/`instagram_positions` sueltos, sin
      // saber a cuál de las dos aplican.
      const redes =
        draft.metaPlacements.length > 0
          ? draft.metaPlacements
          : ["facebook", "instagram"];
      targeting.publisher_platforms = redes;
      if (redes.includes("facebook")) {
        targeting.facebook_positions = draft.metaSurfaces
          .map((id) => META_SURFACES[id]?.facebook)
          .filter((value): value is string => Boolean(value));
      }
      if (redes.includes("instagram")) {
        targeting.instagram_positions = draft.metaSurfaces
          .map((id) => META_SURFACES[id]?.instagram)
          .filter((value): value is string => Boolean(value));
      }
    } else if (draft.metaPlacements.length > 0) {
      targeting.publisher_platforms = draft.metaPlacements;
    }
    if (draft.metaInterests.length > 0) {
      // Forma real de `flexible_spec` en la API de Meta: un arreglo de
      // grupos que se combinan con OR: acá se manda uno solo, con todos los
      // intereses dentro combinados con AND.
      targeting.flexible_spec = [
        { interests: draft.metaInterests.map((id) => ({ id })) },
      ];
    }

    const aMensajes = draft.conversionLocation === "mensajes";
    if (!enConjuntoMetaExistente) {
      steps.push({
        platform: "meta",
        action: "create_adset",
        label: enCampanaMetaExistente
          ? `Crear conjunto de anuncios en «${enCampanaMetaExistente.campaignName}» (pausado)`
          : "Crear conjunto de anuncios (pausado)",
        params: {
          name: enCampanaMetaExistente ? draft.name : `${draft.name} · principal`,
          ...(enCampanaMetaExistente
            ? { campaign_id: enCampanaMetaExistente.campaignId }
            : {}),
          optimization_goal: boosteando
            ? "POST_ENGAGEMENT"
            : aMensajes
              ? "CONVERSATIONS"
              : draft.objective === "trafico"
                ? "LINK_CLICKS"
                : "OFFSITE_CONVERSIONS",
          billing_event: "IMPRESSIONS",
          status: "paused",
          // Con presupuesto de campaña se omiten los dos: Windsor lo pide
          // así — "omit both only when the campaign uses campaign budget
          // optimization" — y ponerlos igual haría que Meta rechace la
          // creación por tener presupuesto declarado en dos niveles a la vez.
          //
          // Sin CBO no hay forma de fijar la puja acá: el esquema real de
          // `create_adset` en Windsor (`list_actions`, verificado) no tiene
          // `bid_strategy` — solo `bid_amount`, un monto que nadie puede
          // inventar. Un primer intento lo agregó igual y Windsor lo rechazó
          // de plano ("Extra inputs are not permitted"). Con metaBudgetLevel
          // "conjunto" queda expuesto al default de puja de la cuenta, el
          // mismo problema original si ese default exige bid_amount — sin
          // otra acción de Windsor que lo permita, no hay arreglo real acá
          // todavía.
          ...(conCBO
            ? {}
            : draft.budgetMode === "total"
              ? { lifetime_budget: Math.round(presupuestoDe("meta") * unidadesMenoresMeta(cuenta?.currency)) }
              : { daily_budget: Math.round(presupuestoDe("meta") * unidadesMenoresMeta(cuenta?.currency)) }),
          // ON_POST + POST_ENGAGEMENT: la forma simple de boostear que Meta
          // documenta sin exigir un botón de acción.
          ...(boosteando
            ? { destination_type: "ON_POST" }
            : aMensajes
              ? { destination_type: "MESSENGER" }
              : {}),
          ...(draft.budgetMode === "total" && draft.endDate
            ? { end_time: draft.endDate }
            : {}),
          targeting,
        },
      });
    }
    if (boosteando) {
      // `boost_post` reutiliza la publicación real como creativo —no hace
      // falta video propio, imagen, mensaje ni botón de acción, y usar uno
      // de todas formas no es lo que ese destino ON_POST espera.
      steps.push({
        platform: "meta",
        action: "boost_post",
        label: "Boostear la publicación (pausado)",
        params: {
          // El conjunto siempre se crea en este mismo plan cuando se boostea
          // (ver `boosteando` arriba), así que su id real solo existe
          // después de ejecutar ese paso.
          adset_id: MARCADOR_PASO_ANTERIOR,
          post_id: draft.boostPostId,
          name: draft.name,
          status: "paused",
        },
      });
    } else {
      if (draft.mediaType === "video") {
        steps.push({
          platform: "meta",
          action: "create_ad_video",
          label: "Subir el video a la cuenta",
          params: { name: draft.name, video_url: draft.mediaUrl.trim() },
        });
      }
      steps.push({
        platform: "meta",
        action: "create_ad",
        label: enConjuntoMetaExistente
          ? `Crear anuncio en «${enConjuntoMetaExistente.adsetName}» (pausado)`
          : "Crear anuncio (pausado)",
        params: {
          // Igual que video_id: si el conjunto se crea en este mismo plan, su
          // id real solo existe después de ejecutar el paso anterior.
          adset_id: enConjuntoMetaExistente?.adsetId ?? MARCADOR_PASO_ANTERIOR,
          name: draft.name,
          message: draft.message,
          // Título y descripción son la línea en negrita y la línea chica que
          // van debajo de la imagen — no el texto principal, que va arriba.
          // Opcionales en la API real: sin ellos Meta arma el anuncio solo con
          // el mensaje.
          ...(draft.metaHeadline.trim() ? { headline: draft.metaHeadline.trim() } : {}),
          ...(draft.metaDescription.trim()
            ? { description: draft.metaDescription.trim() }
            : {}),
          ...(draft.mediaType === "video"
            ? { video_id: MARCADOR_PASO_ANTERIOR }
            : { image_url: draft.mediaUrl.trim() }),
          ...(aMensajes
            ? { messaging_destination: "MESSENGER" }
            : { link: draft.landingUrl.trim() || undefined }),
          call_to_action_type: draft.callToAction,
          page_id: cuenta?.pageId ?? null,
          status: "paused",
        },
      });
    }
    // Transparencia de anuncios y seguridad de marca: Meta las gestiona en su
    // propia interfaz (Biblioteca de anuncios, herramientas de idoneidad de
    // marca) y Windsor no expone un parámetro de escritura para ninguna de
    // las dos. Se muestran para que la persona que revisa sepa que existen,
    // no como algo que este plan vaya a enviar.
    steps.push({
      platform: "meta",
      action: "informativo",
      label: "Transparencia de anuncios",
      informativo: true,
      params: {
        nota: "Meta publica todo anuncio activo en su Biblioteca de Anuncios de forma automática. No es un ajuste que se pueda enviar por esta vía.",
      },
    });
    steps.push({
      platform: "meta",
      action: "informativo",
      label: "Seguridad de marca",
      informativo: true,
      params: {
        nivel: draft.brandSafety,
        nota: "El filtro de idoneidad de contenido se administra en la herramienta de Seguridad de Marca de Meta, no en la creación del conjunto de anuncios.",
      },
    });
  }

  const principal: Platform = draft.platforms.includes("google")
    ? "google"
    : "meta";

  return {
    issues,
    budget: recommendBudget(portfolio, principal, snapshot),
    steps,
    simulation: true,
  };
}

/**
 * Una palabra clave escrita con la sintaxis real de Google Ads:
 * `palabra` es concordancia amplia, `"palabra"` es de frase, `[palabra]` es
 * exacta. Es la misma convención del editor de palabras clave de Google, no
 * una inventada para este sistema — para que quien ya sabe usar Google Ads no
 * tenga que aprender una sintaxis nueva acá.
 */
/**
 * Sintaxis real de Google Ads para palabras clave: `[palabra]` es
 * concordancia exacta, `"palabra"` de frase, cualquier otra cosa es amplia.
 * Se usa tanto para las positivas del constructor como para las negativas de
 * la gestión de una campaña ya publicada — es la misma sintaxis en las dos.
 */
export function parsearPalabraClave(
  linea: string,
): { text: string; match_type: "BROAD" | "PHRASE" | "EXACT" } {
  const limpia = linea.trim();
  if (limpia.startsWith("[") && limpia.endsWith("]")) {
    return { text: limpia.slice(1, -1).trim(), match_type: "EXACT" };
  }
  if (limpia.startsWith('"') && limpia.endsWith('"')) {
    return { text: limpia.slice(1, -1).trim(), match_type: "PHRASE" };
  }
  return { text: limpia, match_type: "BROAD" };
}

function daysElapsed(start: string, end: string): number {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/**
 * Normaliza lo que llega del navegador a un borrador válido.
 *
 * Vive acá y no en la ruta porque lo usan dos: la simulación y la ejecución
 * real. Si cada una tuviera su copia, podrían divergir — y el día que
 * divergieran, lo que se aprueba en pantalla dejaría de ser lo que se ejecuta.
 */
export function normalizeDraft(body: Partial<CampaignDraft>): CampaignDraft {
  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter(
    (value): value is Platform => ACTIVE_PLATFORMS.includes(value as Platform),
  );
  const objective: Objective = (
    ["trafico", "leads", "ventas", "alcance"] as const
  ).includes(body.objective as Objective)
    ? (body.objective as Objective)
    : "trafico";

  const accountByPlatform: Partial<Record<Platform, string>> = {};
  if (body.accountByPlatform && typeof body.accountByPlatform === "object") {
    for (const platform of ACTIVE_PLATFORMS) {
      const value = (body.accountByPlatform as Record<string, unknown>)[
        platform
      ];
      if (typeof value === "string" && value.trim()) {
        accountByPlatform[platform] = value.trim();
      }
    }
  }

  const specialAdCategory = (
    ["ninguna", "vivienda", "empleo", "credito", "temas_sociales"] as const
  ).includes(body.specialAdCategory as CampaignDraft["specialAdCategory"])
    ? (body.specialAdCategory as CampaignDraft["specialAdCategory"])
    : "ninguna";

  const callToAction = (
    [
      "LEARN_MORE",
      "SHOP_NOW",
      "SIGN_UP",
      "CONTACT_US",
      "DOWNLOAD",
      "SUBSCRIBE",
      "GET_QUOTE",
      "BOOK_NOW",
      "WHATSAPP_MESSAGE",
      "CALL_NOW",
    ] as const
  ).includes(body.callToAction as CampaignDraft["callToAction"])
    ? (body.callToAction as CampaignDraft["callToAction"])
    : "LEARN_MORE";

  const ageMin =
    typeof body.ageMin === "number" && Number.isFinite(body.ageMin)
      ? Math.min(Math.max(Math.round(body.ageMin), 13), 65)
      : 18;
  const ageMax =
    typeof body.ageMax === "number" && Number.isFinite(body.ageMax)
      ? Math.min(Math.max(Math.round(body.ageMax), 13), 65)
      : 65;

  return {
    portfolioId: String(body.portfolioId ?? ""),
    platforms,
    accountByPlatform,
    name: String(body.name ?? ""),
    details: String(body.details ?? ""),
    objective,
    specialAdCategory,
    conversionLocation: body.conversionLocation === "mensajes" ? "mensajes" : "sitio_web",
    dailyBudget:
      typeof body.dailyBudget === "number" && Number.isFinite(body.dailyBudget)
        ? body.dailyBudget
        : null,
    budgetByPlatform: normalizeBudgetByPlatform(body.budgetByPlatform),
    budgetMode: body.budgetMode === "total" ? "total" : "diaria",
    endDate:
      typeof body.endDate === "string" && body.endDate.trim()
        ? body.endDate.trim()
        : null,
    landingUrl: String(body.landingUrl ?? ""),
    headlines: (Array.isArray(body.headlines) ? body.headlines : []).map(String),
    descriptions: (Array.isArray(body.descriptions) ? body.descriptions : []).map(
      String,
    ),
    pathDisplay1: String(body.pathDisplay1 ?? "").slice(0, 15),
    pathDisplay2: String(body.pathDisplay2 ?? "").slice(0, 15),
    keywords: (Array.isArray(body.keywords) ? body.keywords : []).map(String),
    message: String(body.message ?? ""),
    metaHeadline: String(body.metaHeadline ?? ""),
    metaDescription: String(body.metaDescription ?? ""),
    metaBudgetLevel: body.metaBudgetLevel === "conjunto" ? "conjunto" : "campana",
    mediaUrl: String(body.mediaUrl ?? ""),
    mediaType:
      body.mediaType === "image" || body.mediaType === "video"
        ? body.mediaType
        : "none",
    boostPostId:
      typeof body.boostPostId === "string" && body.boostPostId.trim()
        ? body.boostPostId.trim()
        : null,
    ageMin,
    ageMax,
    gender:
      body.gender === "hombres" || body.gender === "mujeres"
        ? body.gender
        : "todos",
    googleChannel: body.googleChannel === "display" ? "display" : "search",
    metaPlacements: (Array.isArray(body.metaPlacements)
      ? body.metaPlacements
      : []
    ).map(String),
    metaSurfaces: (Array.isArray(body.metaSurfaces) ? body.metaSurfaces : []).map(
      String,
    ),
    metaInterests: (Array.isArray(body.metaInterests) ? body.metaInterests : [])
      .map(String)
      .map((id) => id.trim())
      .filter(Boolean),
    targetCountries: (Array.isArray(body.targetCountries)
      ? body.targetCountries
      : []
    )
      .map(String)
      .map((code) => code.trim().toUpperCase())
      .filter((code) => GOOGLE_GEO_TARGET_IDS[code]),
    targetPlaces: normalizeTargetPlaces(body.targetPlaces),
    excludedCountries: (Array.isArray(body.excludedCountries)
      ? body.excludedCountries
      : []
    )
      .map(String)
      .map((code) => code.trim().toUpperCase())
      .filter((code) => GOOGLE_GEO_TARGET_IDS[code]),
    geoRadius: normalizeGeoRadius(body.geoRadius),
    callToAction,
    brandSafety:
      body.brandSafety === "restringido" || body.brandSafety === "ampliado"
        ? body.brandSafety
        : "estandar",
    existingCampaign: normalizeExistingCampaign(body.existingCampaign),
    existingAdset: normalizeExistingAdset(body.existingAdset),
  };
}

function normalizeBudgetByPlatform(
  value: unknown,
): Partial<Record<Platform, number>> {
  const salida: Partial<Record<Platform, number>> = {};
  if (!value || typeof value !== "object") return salida;
  for (const plataforma of ACTIVE_PLATFORMS) {
    const monto = (value as Record<string, unknown>)[plataforma];
    if (typeof monto === "number" && Number.isFinite(monto)) {
      salida[plataforma] = monto;
    }
  }
  return salida;
}

function normalizeTargetPlaces(value: unknown): LugarSegmentable[] {
  if (!Array.isArray(value)) return [];
  const salida: LugarSegmentable[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { id, nombre, countryCode, tier } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim()) continue;
    if (typeof nombre !== "string" || !nombre.trim()) continue;
    if (typeof countryCode !== "string" || !countryCode.trim()) continue;
    if (tier !== "region" && tier !== "city") continue;
    salida.push({ id: id.trim(), nombre: nombre.trim(), countryCode: countryCode.trim().toUpperCase(), tier });
  }
  return salida;
}

function normalizeGeoRadius(
  value: unknown,
): CampaignDraft["geoRadius"] {
  if (!value || typeof value !== "object") return null;
  const { lat, lng, radiusKm } = value as Record<string, unknown>;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    typeof radiusKm !== "number" ||
    !Number.isFinite(radiusKm)
  ) {
    return null;
  }
  return {
    lat: Math.min(Math.max(lat, -90), 90),
    lng: Math.min(Math.max(lng, -180), 180),
    radiusKm: Math.min(Math.max(radiusKm, RADIO_MINIMO_KM), RADIO_MAXIMO_KM),
  };
}

function normalizeExistingCampaign(
  value: CampaignDraft["existingCampaign"] | undefined,
): CampaignDraft["existingCampaign"] {
  if (!value || typeof value !== "object") return null;
  const platform = value.platform;
  if (platform !== "google" && platform !== "meta") return null;
  if (!value.accountId || !value.campaignId || !value.campaignName) return null;
  return {
    platform,
    accountId: String(value.accountId),
    campaignId: String(value.campaignId),
    campaignName: String(value.campaignName),
  };
}

function normalizeExistingAdset(
  value: CampaignDraft["existingAdset"] | undefined,
): CampaignDraft["existingAdset"] {
  if (!value || typeof value !== "object") return null;
  if (!value.adsetId || !value.adsetName) return null;
  return { adsetId: String(value.adsetId), adsetName: String(value.adsetName) };
}
