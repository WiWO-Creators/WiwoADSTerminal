import type { CompatibilidadBoost } from "@/lib/boost-compat";
import { CTA_ETIQUETAS, esCta, type CallToAction } from "@/lib/cta";
import { parsearPalabraClave } from "@/lib/palabras-clave";
import type { DatosBusqueda, DiaDeSemana } from "@/lib/google-ads-nativo";
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

export type Objective = "trafico" | "leads" | "ventas" | "alcance" | "interaccion";

export const OBJECTIVES: Record<
  Objective,
  {
    label: string;
    /** Qué implica elegir este objetivo, para mostrar junto al selector. */
    description: string;
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
    description:
      "Prioriza mostrar el anuncio a quien tiene más probabilidad de hacer clic e ir al sitio. No optimiza por conversión, solo por visitas.",
    google: "maximize_clicks",
    meta: "OUTCOME_TRAFFIC",
    sigla: "TRF",
  },
  leads: {
    label: "Generar leads",
    description:
      "Prioriza mostrar el anuncio a quien tiene más probabilidad de dejar sus datos en un formulario, sea del sitio o nativo de la plataforma.",
    google: "maximize_conversions",
    meta: "OUTCOME_LEADS",
    sigla: "LDS",
  },
  ventas: {
    label: "Ventas",
    description:
      "Prioriza mostrar el anuncio a quien tiene más probabilidad de comprar. Necesita conversiones de compra ya configuradas para optimizar de verdad.",
    google: "maximize_conversions",
    meta: "OUTCOME_SALES",
    sigla: "VTA",
  },
  alcance: {
    label: "Alcance y reconocimiento",
    description:
      "Prioriza mostrar el anuncio a la mayor cantidad de gente posible dentro del público elegido, sin buscar una acción puntual (ni clic ni conversión).",
    google: "maximize_clicks",
    meta: "OUTCOME_AWARENESS",
    sigla: "AE",
  },
  interaccion: {
    label: "Interacción (publicaciones y perfil)",
    description:
      "Prioriza mostrar el anuncio a quien tiene más probabilidad de reaccionar, comentar, guardar o visitar el perfil. Es el objetivo para promocionar redes y publicaciones.",
    google: "maximize_clicks",
    meta: "OUTCOME_ENGAGEMENT",
    sigla: "AE",
  },
};

/**
 * Ajustes propios de una campaña de BÚSQUEDA de Google, con su estructura nativa (puja, redes, presencia, programación,
 * grupo, recursos). Si está presente, la campaña se crea con la API de Google Ads en un solo paso atómico; si es `null`
 * se usa la vía simple de siempre. Importes en unidades de la moneda de la cuenta.
 */
export type ConfigBusquedaGoogle = {
  /** "auto": según el objetivo (conversiones si el cliente las mide; si no, clics). */
  puja: "auto" | "clics" | "conversiones" | "valor_conversion" | "cpc_manual" | "cuota_impresiones";
  cpcMaximo: number | null;
  cpaObjetivo: number | null;
  roasObjetivo: number | null;
  mejorarCpc: boolean;
  cuotaUbicacion: "TOP_OF_PAGE" | "ABSOLUTE_TOP_OF_PAGE" | "ANYWHERE_ON_PAGE";
  cuotaPorcentaje: number;
  redSocios: boolean;
  redDisplay: boolean;
  presencia: "presencia" | "presencia_o_interes";
  programacion: Array<{ dias: DiaDeSemana[]; desde: number; hasta: number; ajuste: number | null }>;
  inicio: string | null;
  rotacion: "optimizar" | "indefinida";
  plantillaSeguimiento: string;
  sufijoUrl: string;
  grupoNombre: string;
  cpcGrupo: number | null;
  enlaces: Array<{ texto: string; descripcion1: string; descripcion2: string; url: string }>;
  destacados: string[];
  fragmentoEncabezado: string;
  fragmentoValores: string[];
  llamadaPais: string;
  llamadaTelefono: string;
};

export const CONFIG_BUSQUEDA_POR_DEFECTO: ConfigBusquedaGoogle = {
  puja: "auto",
  cpcMaximo: null,
  cpaObjetivo: null,
  roasObjetivo: null,
  mejorarCpc: false,
  cuotaUbicacion: "TOP_OF_PAGE",
  cuotaPorcentaje: 50,
  redSocios: true,
  redDisplay: false,
  presencia: "presencia_o_interes",
  programacion: [],
  inicio: null,
  rotacion: "optimizar",
  plantillaSeguimiento: "",
  sufijoUrl: "",
  grupoNombre: "",
  cpcGrupo: null,
  enlaces: [],
  destacados: [],
  fragmentoEncabezado: "",
  fragmentoValores: [],
  llamadaPais: "",
  llamadaTelefono: "",
};

const DIAS_VALIDOS: DiaDeSemana[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const numeroOPositivo = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const textoCorto = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const listaDeTextos = (v: unknown, max: number, tope: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => textoCorto(x, max)).filter(Boolean).slice(0, tope);

/** Limpia lo que llega del navegador o del asistente. `null` si no hay configuración. */
export function normalizarBusquedaGoogle(raw: unknown): ConfigBusquedaGoogle | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const d = CONFIG_BUSQUEDA_POR_DEFECTO;
  const puja = (["auto", "clics", "conversiones", "valor_conversion", "cpc_manual", "cuota_impresiones"] as const).find((x) => x === b.puja) ?? d.puja;
  const ubicacion = (["TOP_OF_PAGE", "ABSOLUTE_TOP_OF_PAGE", "ANYWHERE_ON_PAGE"] as const).find((x) => x === b.cuotaUbicacion) ?? d.cuotaUbicacion;
  const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const programacion = (Array.isArray(b.programacion) ? b.programacion : []).slice(0, 14).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const dias = (Array.isArray(o.dias) ? o.dias : []).filter((y): y is DiaDeSemana => DIAS_VALIDOS.includes(y as DiaDeSemana));
    const desde = Number(o.desde);
    const hasta = Number(o.hasta);
    if (dias.length === 0 || !Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 0 || hasta > 24 || hasta <= desde) return [];
    const ajuste = typeof o.ajuste === "number" && o.ajuste >= 0.1 && o.ajuste <= 2 ? o.ajuste : null;
    return [{ dias: [...new Set(dias)], desde, hasta, ajuste }];
  });
  const enlaces = (Array.isArray(b.enlaces) ? b.enlaces : []).slice(0, 6).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const texto = textoCorto(o.texto, 25);
    return texto ? [{ texto, descripcion1: textoCorto(o.descripcion1, 35), descripcion2: textoCorto(o.descripcion2, 35), url: textoCorto(o.url, 2000) }] : [];
  });
  return {
    puja,
    cpcMaximo: numeroOPositivo(b.cpcMaximo),
    cpaObjetivo: numeroOPositivo(b.cpaObjetivo),
    roasObjetivo: numeroOPositivo(b.roasObjetivo),
    mejorarCpc: b.mejorarCpc === true,
    cuotaUbicacion: ubicacion,
    cuotaPorcentaje: typeof b.cuotaPorcentaje === "number" && b.cuotaPorcentaje > 0 && b.cuotaPorcentaje <= 100 ? b.cuotaPorcentaje : d.cuotaPorcentaje,
    redSocios: b.redSocios !== false,
    redDisplay: b.redDisplay === true,
    presencia: b.presencia === "presencia" ? "presencia" : "presencia_o_interes",
    programacion,
    inicio: fecha(b.inicio),
    rotacion: b.rotacion === "indefinida" ? "indefinida" : "optimizar",
    plantillaSeguimiento: textoCorto(b.plantillaSeguimiento, 2000),
    sufijoUrl: textoCorto(b.sufijoUrl, 1000),
    grupoNombre: textoCorto(b.grupoNombre, 255),
    cpcGrupo: numeroOPositivo(b.cpcGrupo),
    enlaces,
    destacados: listaDeTextos(b.destacados, 25, 10),
    fragmentoEncabezado: textoCorto(b.fragmentoEncabezado, 50),
    fragmentoValores: listaDeTextos(b.fragmentoValores, 25, 10),
    llamadaPais: textoCorto(b.llamadaPais, 2).toUpperCase(),
    llamadaTelefono: textoCorto(b.llamadaTelefono, 30),
  };
}

/** Estrategias de puja del conjunto de anuncios de Meta, con los nombres que usa Ads Manager. */
export const META_BID_STRATEGIES = {
  LOWEST_COST_WITHOUT_CAP: { label: "Mayor volumen", detalle: "Meta gasta todo el presupuesto buscando los mejores resultados al menor costo.", pideImporte: false },
  LOWEST_COST_WITH_BID_CAP: { label: "Límite de puja", detalle: "Meta no pujará más de este importe en cada subasta.", pideImporte: true },
  COST_CAP: { label: "Costo por resultado objetivo", detalle: "Meta busca mantener el costo medio por resultado cerca de este importe.", pideImporte: true },
  LOWEST_COST_WITH_MIN_ROAS: { label: "ROAS mínimo", detalle: "Meta busca un retorno mínimo del gasto publicitario (solo ventas con valor de compra).", pideImporte: true },
} as const;
export type MetaBidStrategy = keyof typeof META_BID_STRATEGIES;

/** Ventana de atribución del conjunto de Meta (cuánto tiempo después de ver o hacer clic se cuenta un resultado). */
export const META_ATTRIBUTION = {
  default: { label: "Predeterminada de Meta (7 días tras el clic, 1 día tras la vista)", spec: null },
  click_1d: { label: "1 día tras el clic", spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }] },
  click_7d: { label: "7 días tras el clic", spec: [{ event_type: "CLICK_THROUGH", window_days: 7 }] },
  click_1d_view_1d: { label: "1 día tras el clic o la vista", spec: [{ event_type: "CLICK_THROUGH", window_days: 1 }, { event_type: "VIEW_THROUGH", window_days: 1 }] },
} as const;
export type MetaAttribution = keyof typeof META_ATTRIBUTION;

/**
 * Qué ventanas admite Meta según lo que optimiza el conjunto (verificado contra Meta: para tráfico solo acepta 1 día tras
 * el clic). Con conversiones (leads, ventas) admite todas; con tráfico, interacción o alcance, solo la predeterminada o
 * 1 día tras el clic.
 */
export function atribucionesAdmitidas(objetivo: Objective): MetaAttribution[] {
  return objetivo === "leads" || objetivo === "ventas" ? (Object.keys(META_ATTRIBUTION) as MetaAttribution[]) : ["default", "click_1d"];
}

/** Objetivo que aplica a una plataforma: el propio de esa plataforma o, si no lo hay, el general del borrador. */
export function objetivoDe(draft: Pick<CampaignDraft, "objective" | "objectiveByPlatform">, plataforma: Platform): Objective {
  return draft.objectiveByPlatform?.[plataforma] ?? draft.objective;
}

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

/**
 * Objetivo real de Meta (ODAX), para cuando el objetivo de negocio elegido
 * arriba (tráfico/leads/ventas/alcance → `OBJECTIVES[x].meta`) no es lo
 * bastante preciso y se quiere el objetivo real de Meta tal cual.
 *
 * Los 5 valores están verificados contra campañas reales de clientes ya
 * corriendo en Meta (`campaign_objective`, vía Windsor) — no es una lista
 * copiada de la documentación de Meta sin confirmar contra datos reales.
 * Deliberadamente no incluye `OUTCOME_APP_PROMOTION`: ningún cliente lo usa
 * hoy, así que no hay con qué confirmarlo contra un dato real.
 */
export type MetaObjectiveOverride =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES";

export const META_OBJECTIVE_LABELS: Record<MetaObjectiveOverride, string> = {
  OUTCOME_AWARENESS: "Reconocimiento (Awareness)",
  OUTCOME_TRAFFIC: "Tráfico",
  OUTCOME_ENGAGEMENT: "Interacción (Engagement)",
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Ventas",
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
// La lista completa de botones vive en `lib/cta.ts` (los más de 70 que acepta
// Meta); acá se reexporta para no cambiar los imports del resto del código.
export type { CallToAction };
export const CALL_TO_ACTIONS: Record<CallToAction, string> = CTA_ETIQUETAS;

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

export type GoogleChannel = "search" | "display" | "pmax";

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
 * presupuesto: eso se elige recién dentro del Constructor, una vez que se
 * sabe la cuenta real y su moneda. La segmentación por región/ciudad sí
 * puede venir precargada (`targetPlaces`) porque su id de Google es global,
 * no depende de la cuenta — así una campaña pedida "para Santiago y
 * Valparaíso" no se queda solo en el texto del resumen.
 */
export type SemillaDeCampana = {
  /** Id de la propuesta del asistente que originó esta semilla (`Propuesta.id`
   * en `lib/asistente.ts`) — no el nombre de la campaña. Dos propuestas
   * seguidas pueden compartir nombre (o llegar sin nombre todavía) y
   * confundir a `builderConstructorKey`, que usa esto para decidir si debe
   * reiniciar el Constructor; el id de la propuesta nunca se repite. */
  propuestaId?: string;
  name: string;
  objective: Objective;
  /** Objetivo propio de una plataforma cuando no es el general. */
  objectiveByPlatform?: Partial<Record<Platform, Objective>>;
  platforms: Platform[];
  /** Nota interna visible en "Detalles" — nunca se envía a ninguna plataforma. */
  details: string;
  targetCountries: string[];
  /** Regiones/ciudades ya resueltas a un id real de Google (ver `LugarSegmentable`
   * más abajo) — el asistente las busca con `buscarGeoTargets` antes de proponer,
   * nunca inventa un id. */
  targetPlaces?: LugarSegmentable[];
  /** Solo cuando la persona pidió explícitamente restringir el idioma. Ver
   * `Propuesta["targetLanguages"]` en `lib/asistente.ts`. */
  targetLanguages?: Array<"es" | "en" | "pt">;
  /**
   * Contenido sugerido para el anuncio — el asistente de IA lo escribe
   * cuando ya sabe qué se promociona, con la sintaxis real de cada campo
   * (palabras clave con `""`/`[]` cuando corresponde, sin repetir el
   * objetivo en el texto). Todo opcional y editable: llega como borrador
   * dentro del Constructor, nunca se publica solo. `landingUrl` puede venir
   * vacío — nunca inventado — y queda para que la persona lo complete.
   */
  landingUrl?: string;
  /**
   * Presupuesto diario, solo cuando la persona dio un monto explícito en
   * pesos (o la moneda que sea) — nunca un estimado propio del modelo. La
   * moneda la decide el campo real una vez elegida la cuenta, este número
   * es agnóstico a eso.
   */
  dailyBudget?: number;
  /** "total": `dailyBudget` trae el total del flight (no un monto por día) y `endDate` su término. */
  budgetMode?: "diaria" | "total";
  endDate?: string;
  /** Monto propio de cada plataforma (en el mismo sentido que `dailyBudget`: por día o total del flight). */
  budgetByPlatform?: Partial<Record<Platform, number>>;
  headlines?: string[];
  descriptions?: string[];
  keywords?: string[];
  metaMessage?: string;
  metaHeadline?: string;
  metaDescription?: string;
  /**
   * Impulsar un anuncio que ya está publicado: se reutiliza su publicación real
   * (`boost_post`), así que conserva sus reacciones, comentarios y compartidos.
   * `postId` es el `effective_object_story_id` que Meta entrega para todo
   * anuncio (`{page_id}_{post_id}`), el formato que exige `boost_post`.
   */
  boost?: {
    postId: string;
    accountId: string;
    /** Solo para la vista previa: la pieza real no se vuelve a subir. */
    mediaUrl: string;
    anuncioOrigen: string;
  };
  /**
   * Una versión nueva de un anuncio que Meta no deja editar (porque usa una publicación existente): se
   * precarga su texto, destino y pieza para armar un anuncio NUEVO en el mismo conjunto, con los cambios
   * que se quieran. El anuncio original no se toca: se pausa a mano cuando el nuevo esté aprobado.
   */
  versionDeAnuncio?: {
    /** URL pública de la pieza (puede caducar: se revisa en la vista previa). */
    mediaUrl: string;
    /** Botón actual del anuncio (`LEARN_MORE`, `VIEW_INSTAGRAM_PROFILE`…), si lo entrega Meta. */
    cta: string | null;
    /** Nombre del anuncio de origen, para la nota interna. */
    anuncioOrigen: string;
  };
};

/** Una región/estado/provincia o ciudad/comuna real, tal como la devuelve
 * `/api/geo-targets` — `id` es el geo_target_constant_id real de Google.
 *
 * `lat`/`lng`/`radiusKm` son la resolución de ese mismo lugar contra
 * Nominatim (`lib/geocoding.ts`), para que Meta —que no tiene su propio id de
 * región/ciudad vía Windsor— lo pueda segmentar igual, con un círculo real en
 * vez de quedarse en todo el país. `undefined` si la geocodificación falló o
 * todavía no se intentó: ahí el lugar sigue segmentando a Google como
 * siempre, pero no aporta nada a Meta. `aproximado` avisa cuando el lugar
 * real es más grande que el radio máximo que Meta acepta (80 km) — el
 * círculo cubre el centro, no todo el área. */
export type LugarSegmentable = {
  id: string;
  nombre: string;
  countryCode: string;
  tier: "region" | "city";
  lat?: number;
  lng?: number;
  radiusKm?: number;
  aproximado?: boolean;
  /** El `key` real de Meta (`adgeolocation`): con él se segmenta por la región o ciudad de Meta, no por un círculo. */
  metaKey?: string;
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
  /**
   * Qué píxel de Meta usar, cuando la cuenta elegida tiene más de uno (ver
   * `CuentaCliente.pixels`). `null` cuando la cuenta solo tiene uno: ahí no
   * hace falta elegir, se usa directo.
   */
  metaPixelId: string | null;
  name: string;
  /** Nota interna del equipo. No se envía a ninguna plataforma. */
  details: string;
  objective: Objective;
  /**
   * Objetivo propio de cada plataforma, cuando no es el mismo en todas (ej. Reconocimiento en Meta y Leads en Google).
   * Lo que no esté aquí usa `objective`. Se lee siempre con `objetivoDe(draft, plataforma)`.
   */
  objectiveByPlatform: Partial<Record<Platform, Objective>>;
  /** Ajustes nativos de una campaña de Búsqueda de Google (ver `ConfigBusquedaGoogle`). `null`: vía simple. */
  googleBusqueda: ConfigBusquedaGoogle | null;
  /**
   * Objetivo real de Meta, cuando se quiere ser más preciso que el objetivo
   * de negocio de arriba (que ya trae uno mapeado por defecto en
   * `OBJECTIVES[x].meta`). `null` usa ese default — nunca hace falta
   * tocar esto para publicar. Solo aplica a Meta; Google no tiene este
   * concepto de todos modos, ver `googleChannel`.
   */
  metaObjective: MetaObjectiveOverride | null;
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
   * Google, Red de Display: lo que un anuncio de Display responsivo necesita además de títulos y
   * descripciones. La imagen horizontal (1,91:1) es `mediaUrl`; la cuadrada (1:1) y el logo (opcional) van acá.
   * Se crean con la API de Google Ads (Windsor no tiene una acción para esto).
   */
  displaySquareUrl: string;
  displayLogoUrl: string;
  displayLongHeadline: string;
  displayBusinessName: string;
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
  /**
   * Google: palabras clave negativas a nivel de campaña — misma sintaxis y
   * mismo parser que `keywords` (`push_negative_keywords`, verificada en
   * `list_actions` sobre `google_ads`). Evita que el anuncio aparezca en
   * búsquedas de soporte, empleo o de la competencia que nadie pidió pautar.
   */
  negativeKeywords: string[];
  /**
   * Google: tope de CPC (moneda de la cuenta, no micros — se convierte al
   * armar el plan). Solo tiene efecto real cuando la puja de la campaña es
   * Maximizar clics (`target_spend`): la acción real `set_cpc_bid_ceiling`
   * documenta que las demás estrategias tratan el tope como algo de cartera,
   * no ajustable por campaña. `null` deja la puja sin techo, como hasta ahora.
   */
  cpcCeiling: number | null;
  /**
   * Google: idiomas a segmentar (`set_campaign_language_targeting`, acción
   * real verificada en `list_actions`). Vacío es el default real de
   * Google: todos los idiomas — así queda hoy sin tocar este campo. Solo
   * los tres que de verdad usa la agencia hoy: no hace falta el selector de
   * 51 idiomas que expone Google Ads para tener esto operativo.
   */
  targetLanguages: Array<"es" | "en" | "pt">;
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
  /** Estrategia de puja del conjunto de Meta (por defecto, mayor volumen). */
  metaBidStrategy: MetaBidStrategy;
  /** Importe de la puja, costo objetivo o ROAS mínimo según la estrategia (en unidades de la moneda; ROAS como número). */
  metaBidAmount: number | null;
  /** Límite de gasto de la campaña (Meta `spend_cap`), en unidades de la moneda. `null`: sin límite. */
  metaSpendCap: number | null;
  /** Ventana de atribución del conjunto. */
  metaAttribution: MetaAttribution;
  /** Audiencias personalizadas o similares de Meta a INCLUIR (ids reales, de la cuenta elegida). */
  metaCustomAudiences: string[];
  /** Audiencias de Meta a EXCLUIR (ids reales). */
  metaExcludedAudiences: string[];
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
  /**
   * Obsoleto: desde 2026-10-06 nada nace pausado (la campaña, el conjunto y el anuncio quedan activos al publicarse,
   * porque ya pasaron por las aprobaciones). Se conserva en el borrador por compatibilidad y se ignora.
   */
  activarConjuntoYAnuncio: boolean;
};

/** Cuenta de un cliente, tal como la expone `/api/clientes`. */
export type CuentaCliente = {
  externalId: string;
  name: string;
  provider: string;
  currency: string | null;
  pageId: string | null;
  /**
   * Píxeles de Meta de esta cuenta — puede haber más de uno (ej. MGC: un
   * píxel de Converse y otro de Coliseum en la misma cuenta publicitaria).
   * Ver el porqué en `portafolios-store.ts`. Con exactamente uno, se usa
   * solo; con más de uno, la persona tiene que elegir cuál (`metaPixelId` en
   * el draft) — nunca se adivina cuál corresponde a esta campaña.
   */
  pixels: Array<{ id: string; pixelId: string; label: string | null }>;
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
  /** "nativa": se ejecuta con la API de la propia plataforma (Google Ads) y no con Windsor. */
  via?: "nativa";
};

export type BuildResult = {
  issues: Issue[];
  /**
   * Una sugerencia por cada plataforma elegida, no un solo número general.
   * Antes era un `BudgetAdvice` único calculado sobre "la plataforma
   * principal" (Google si estaba, si no Meta) y se mostraba como si fuera el
   * total de la campaña — con dos plataformas elegidas, el número sugerido
   * correspondía a una sola y el bloqueante de "falta presupuesto" seguía
   * listando la otra sin dar pista de cuánto ponerle.
   */
  budgets: Partial<Record<Platform, BudgetAdvice>>;
  steps: PlanStep[];
  /** Siempre true en esta fase: nada de esto se ejecuta todavía. */
  simulation: true;
};

/**
 * Sugiere un presupuesto diario a partir de lo que el cliente ya invierte.
 *
 * No se inventa un número: nunca propone una cifra que no salga de datos
 * reales de este cliente. Dos fuentes, en orden:
 *
 * 1. Gasto real del periodo en curso, en campañas con actividad — la más
 *    confiable, porque es inversión efectiva, no solo declarada.
 * 2. Si no hay gasto este periodo (cuenta pausada, recién conectada, en
 *    pausa temporal — el caso real de Skydive Andes, 2026-09-25: 24 días sin
 *    gasto pero con campañas ya configuradas), el presupuesto DIARIO
 *    CONFIGURADO de sus campañas (activas primero; si no hay ninguna activa,
 *    las que existan) — no es gasto, pero es lo que el cliente ya definió
 *    como normal para ese tipo de campaña, mejor referencia que un $0 que no
 *    dice nada. Se distingue siempre en `basis` cuál de las dos se usó, para
 *    no confundir "esto se gastó" con "esto se configuró".
 *
 * Sin ninguna de las dos, se devuelve null y la interfaz lo dice.
 *
 * Trabaja a nivel de campaña (no la cuenta agregada) justamente para poder
 * excluir `excluirCampanas`: campañas de prueba creadas por este mismo
 * sistema momentos antes no son "historia" del cliente — confirmado con
 * Colbún (2026-09-24), donde campañas de prueba de la sesión, sin gasto real,
 * se citaron como si fueran inversión histórica al sugerir presupuesto. Ver
 * `nombresDeCampanasRecientes` en `lib/constructor-ejecutar.ts`.
 */
export function recommendBudget(
  portfolio: PortfolioSummary | null,
  platform: Platform,
  snapshot: PerformanceSnapshot,
  excluirCampanas: ReadonlySet<string> = new Set(),
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

  const cuentasDelCliente = new Set(portfolio.accounts.map((a) => a.id));
  const todasLasCampanas = snapshot.campaigns.filter(
    (c) =>
      c.provider === platform &&
      cuentasDelCliente.has(c.accountKey) &&
      !excluirCampanas.has(c.name),
  );

  if (todasLasCampanas.length === 0) {
    return {
      suggested: null,
      currency: null,
      basis: `${portfolio.name} no tiene ninguna campaña registrada en ${platformLabel(platform)}: define el presupuesto a mano`,
    };
  }
  const monedas = new Set(todasLasCampanas.map((c) => c.currency).filter(Boolean));
  if (monedas.size > 1) {
    return {
      suggested: null,
      currency: null,
      basis: "El cliente factura en varias monedas: define el presupuesto a mano",
    };
  }
  const currency = todasLasCampanas.find((c) => c.currency)?.currency ?? null;

  // Lo típico POR CAMPAÑA, no el gasto de toda la cuenta: una campaña nueva se parece a las que ya corren, no a
  // la suma de todas. Mediana del gasto diario de cada campaña con gasto en el periodo.
  const conGasto = todasLasCampanas.filter((c) => c.conActividad && c.spendMicros > 0);
  if (conGasto.length > 0) {
    const days = Math.max(daysElapsed(snapshot.rangeStart, snapshot.rangeEnd), 1);
    const diarios = conGasto.map((c) => c.spendMicros / 1_000_000 / days).sort((a, b) => a - b);
    const mitad = Math.floor(diarios.length / 2);
    const mediana = diarios.length % 2 ? diarios[mitad] : (diarios[mitad - 1] + diarios[mitad]) / 2;
    const rango =
      diarios.length > 1
        ? ` (de ${Math.round(diarios[0]).toLocaleString("es-CL")} a ${Math.round(diarios[diarios.length - 1]).toLocaleString("es-CL")} por día)`
        : "";
    return {
      suggested: Math.max(1, Math.round(mediana)),
      currency,
      basis: `Gasto diario típico por campaña de ${portfolio.name} en ${platformLabel(platform)}: mediana de ${conGasto.length} ${
        conGasto.length === 1 ? "campaña" : "campañas"
      } con gasto en el periodo${rango}`,
    };
  }

  const activa = (status: string | null) => status === "ENABLED" || status === "ACTIVE";
  const conPresupuestoActivas = todasLasCampanas.filter(
    (c) => c.dailyBudgetMicros !== null && activa(c.status),
  );
  const candidatas =
    conPresupuestoActivas.length > 0
      ? conPresupuestoActivas
      : todasLasCampanas.filter((c) => c.dailyBudgetMicros !== null);
  if (candidatas.length > 0) {
    const promedioMicros =
      candidatas.reduce((sum, c) => sum + (c.dailyBudgetMicros ?? 0), 0) / candidatas.length;
    return {
      suggested: Math.round(promedioMicros / 1_000_000),
      currency,
      basis: `Presupuesto diario ya configurado en las campañas ${
        candidatas === conPresupuestoActivas ? "activas" : "existentes"
      } de ${portfolio.name} en ${platformLabel(platform)} — sin gasto real este periodo`,
    };
  }

  return {
    suggested: null,
    currency: null,
    basis: `${portfolio.name} no tiene inversión ni presupuesto configurado en ${platformLabel(platform)} este mes`,
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
 * declarados — pero solo cuando tampoco hay una segmentación más fina
 * (comunas/regiones o un radio en el mapa).
 *
 * Antes el fallback a los países de la cuenta se aplicaba siempre que
 * `targetCountries` viniera vacío, sin mirar si ya había comunas elegidas.
 * `set_campaign_geo_targeting` (Google) y `geo_locations` (Meta) sirven cada
 * ubicación en la lista por separado — es una unión, no una intersección —
 * así que agregar el país junto a las comunas no las acota: las vuelve
 * irrelevantes, porque el país ya cubre todo lo que las comunas cubrían y
 * más. Auditado en vivo contra la cuenta real de Colbún (2026-09-23,
 * "Plan Hogar"): con Chile + 4 comunas, Google Ads mostró la campaña
 * segmentada a los 18,7 M de habitantes del país, no a las comunas pedidas —
 * en las dos plataformas, con el mismo origen.
 *
 * El guardia solo cubría el fallback (`targetCountries` vacío); con un país
 * elegido a mano (o pasado por el Orb) a la vez que comunas/regiones, el
 * mismo problema volvía a pasar — confirmado otra vez con Colbún
 * (2026-09-24, campaña "Región del Maule" que terminó segmentando Chile
 * entero). El chequeo aplica ahora sin importar de dónde salió el país.
 */
function paisesEfectivos(
  draft: CampaignDraft,
  cuenta: CuentaCliente | null,
): string[] {
  const yaSegmentadoMasFino = draft.targetPlaces.length > 0 || draft.geoRadius !== null;
  if (yaSegmentadoMasFino) return [];
  if (draft.targetCountries.length > 0) return draft.targetCountries;
  return cuenta?.countries ?? [];
}

/**
 * Por qué una URL de pieza no le sirve a Meta, o null si le sirve. Se dice el
 * motivo exacto en vez de un genérico: una URL vacía, una sin https:// y una
 * de localhost fallan por razones distintas y se arreglan distinto. La de
 * localhost es la que más importa atrapar acá — pasa cualquier chequeo de
 * formato, pero Meta no puede descargarla, y descubrirlo recién al ejecutar
 * dejaría una campaña y un conjunto ya creados sin anuncio.
 */
export function problemaDeUrlPublica(
  valor: string,
  tipo?: "image" | "video",
): string | null {
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
  if (tipo === "image" && /\.hei[cf](\?|$)/i.test(url.pathname)) {
    return "Esa imagen es .heic/.heif (el formato nativo de fotos de iPhone): Meta suele rechazarlo al crear el anuncio. Elige otra publicación o sube una versión en .jpg/.png";
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
  /** Ver `buildPlan`: `true` cuando el impulso dentro de algo existente está confirmado. */
  boostEnExistente = false,
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
    const esDisplay = draft.googleChannel === "display";
    const esPmax = draft.googleChannel === "pmax";
    if (esDisplay ? titulos.length < 1 || titulos.length > 5 : titulos.length < 3) {
      add("headlines", esDisplay ? "Display pide entre 1 y 5 títulos cortos" : "Google pide entre 3 y 15 títulos");
    }
    if (titulos.some((t) => t.length > 30)) {
      add("headlines", "Cada título de Google admite hasta 30 caracteres");
    }
    const descripciones = draft.descriptions.filter((d) => d.trim());
    if (esDisplay ? descripciones.length < 1 || descripciones.length > 5 : esPmax ? descripciones.length < 2 || descripciones.length > 5 : descripciones.length < 2) {
      add("descriptions", esDisplay ? "Display pide entre 1 y 5 descripciones" : esPmax ? "Performance Max pide entre 2 y 5 descripciones" : "Google pide entre 2 y 4 descripciones");
    }
    if (esPmax && descripciones.length > 0 && !descripciones.some((d) => d.length <= 60)) {
      add("descriptions", "Performance Max necesita al menos una descripción de 60 caracteres o menos");
    }
    if (descripciones.some((d) => d.length > 90)) {
      add("descriptions", "Cada descripción admite hasta 90 caracteres");
    }
    if (esDisplay || esPmax) {
      // Display responsivo y Performance Max (API de Google Ads): textos y las imágenes obligatorias.
      if (!draft.displayLongHeadline.trim()) add("displayLongHeadline", "Display necesita un título largo (hasta 90 caracteres)");
      if (!draft.displayBusinessName.trim()) add("displayBusinessName", "Display necesita el nombre del negocio (hasta 25 caracteres)");
      if (draft.mediaType !== "image" || !draft.mediaUrl.trim()) {
        add("mediaUrl", "Display necesita una imagen horizontal (1,91:1, por ejemplo 1200×628)");
      }
      if (!draft.displaySquareUrl.trim()) add("displaySquareUrl", "Display necesita también una imagen cuadrada (1:1, por ejemplo 1200×1200)");
      if (!/^https?:\/\//i.test(draft.landingUrl.trim())) add("landingUrl", "Display y Performance Max necesitan la URL de destino completa (https://…)");
      if (esPmax && !draft.displayLogoUrl.trim()) add("displayLogoUrl", "Performance Max necesita el logo (cuadrado 1:1): Google lo exige junto con el nombre del negocio");
      if (esPmax && draft.budgetMode === "total" && !draft.endDate) add("endDate", "Performance Max con presupuesto total necesita fecha de término");
    } else if (draft.mediaType !== "none") {
      add(
        "mediaUrl",
        "El anuncio de búsqueda de Google no lleva imagen: la pieza se usa solo en Meta. Para un anuncio de Google con imagen, elige «Red de Display» en Ubicaciones de Google.",
        false,
      );
    }
    // Display con imagen: Windsor no tiene acción para crearlo (verificado con `list_actions` de `google_ads`,
    // 2026-09-23 y 2026-10-05), así que el anuncio se crea con la API de Google Ads (`crearAnuncioDisplay`).
    // La campaña y el grupo sí los crea Windsor. Un anuncio de búsqueda no sirve en un grupo de Display.
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
    // Lugares del respaldo por mapa (`osm:...`) no tienen id real de Google
    // — el filtro real vive en el paso de ubicaciones, esto solo avisa.
    const soloMetaEnGoogle = draft.targetPlaces.filter((lugar) => !/^\d+$/.test(lugar.id));
    if (soloMetaEnGoogle.length > 0) {
      add(
        "targetPlaces",
        `${soloMetaEnGoogle.map((l) => l.nombre).join(", ")} no está en la lista de Google: solo segmenta la campaña de Meta.`,
        false,
      );
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
    // Meta no tiene su propio id de región/ciudad vía Windsor: un lugar solo
    // segmenta la campaña de Meta si ya se resolvió a un círculo real
    // (lat/lng/radio, ver `lib/geocoding.ts`) — si eso falló, avisa en vez de
    // dejar que la persona crea que quedó cubierto y no.
    const sinGeocodificar = draft.targetPlaces.filter(
      (lugar) => !lugar.metaKey && (lugar.lat === undefined || lugar.lng === undefined || !lugar.radiusKm),
    );
    if (sinGeocodificar.length > 0) {
      add(
        "targetPlaces",
        `Meta no pudo ubicar ${sinGeocodificar.map((l) => l.nombre).join(", ")} en el mapa: esos lugares solo segmentan la campaña de Google, la de Meta sigue por país o por radio.`,
        false,
      );
    }
    const aproximados = draft.targetPlaces.filter(
      (lugar) => !lugar.metaKey && lugar.aproximado && lugar.lat !== undefined,
    );
    if (aproximados.length > 0) {
      add(
        "targetPlaces",
        `${aproximados.map((l) => l.nombre).join(", ")} es más grande que el radio máximo que Meta acepta (80 km): la campaña de Meta cubre un círculo alrededor del centro, no el área completa.`,
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
    // Una comuna o región ya geocodificada (círculo lat/lng/radio real, ver
    // más abajo en buildPlan) segmenta la campaña de Meta tan bien como un
    // país — cuenta acá para no pedir un país de más cuando `paisesEfectivos`
    // ya lo dejó vacío a propósito por haber una segmentación más fina.
    const hayLugaresGeocodificados = draft.targetPlaces.some(
      (lugar) => lugar.metaKey || (lugar.lat !== undefined && lugar.lng !== undefined && lugar.radiusKm),
    );
    if (paisesMeta.length === 0 && !draft.geoRadius && !hayLugaresGeocodificados) {
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
      ((!draft.existingCampaign && !draft.existingAdset) || boostEnExistente);
    if (boosteandoValidacion && ["leads", "ventas", "trafico"].includes(objetivoDe(draft, "meta"))) {
      add(
        "objective",
        `Impulsar una publicación crea una campaña de INTERACCIÓN en Meta (lo exige Meta), no de ${OBJECTIVES[objetivoDe(draft, "meta")].label.toLowerCase()}: no va a captar ${objetivoDe(draft, "meta") === "leads" ? "leads" : objetivoDe(draft, "meta") === "ventas" ? "ventas" : "visitas al sitio"}. Para eso, quita la publicación y arma un anuncio normal que lleve a la landing.`,
        false,
      );
    }
    if (!boosteandoValidacion) {
      const estrategia = META_BID_STRATEGIES[draft.metaBidStrategy];
      if (estrategia.pideImporte && !draft.metaBidAmount) {
        add("metaBidAmount", `Meta: «${estrategia.label}» necesita un importe (sin él, Meta rechaza el conjunto).`);
      }
      if (!atribucionesAdmitidas(objetivoDe(draft, "meta")).includes(draft.metaAttribution)) {
        add("metaAttribution", `Meta: con el objetivo «${OBJECTIVES[objetivoDe(draft, "meta")].label}» solo admite la ventana predeterminada o «1 día tras el clic». Elige una de esas.`);
      }
      if (draft.metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && objetivoDe(draft, "meta") !== "ventas") {
        add("metaBidStrategy", "Meta: el ROAS mínimo solo existe para campañas de ventas.");
      }
    }
    if (!boosteandoValidacion && !draft.message.trim()) {
      add("message", "Meta necesita el texto principal del anuncio");
    }
    if (!boosteandoValidacion && draft.mediaType === "none") {
      add("mediaUrl", "Meta necesita una imagen o un video");
    } else if (!boosteandoValidacion) {
      // Windsor no recibe archivos: va a buscar la pieza a una URL pública.
      const problema = problemaDeUrlPublica(draft.mediaUrl, draft.mediaType === "image" ? "image" : "video");
      if (problema) add("mediaUrl", problema);
    }
  }
  if (
    draft.budgetMode === "total" &&
    draft.platforms.length > 1 &&
    draft.dailyBudget !== null &&
    draft.platforms.some((p) => draft.budgetByPlatform[p] === undefined)
  ) {
    add(
      "dailyBudget",
      `El mismo total (${draft.dailyBudget.toLocaleString("es-CL")}) se aplica a CADA plataforma: en conjunto se gastaría ${(draft.dailyBudget * draft.platforms.length).toLocaleString("es-CL")}. Si ese monto es para todas, usa «presupuesto distinto por plataforma» y reparte.`,
      false,
    );
  }
  if (draft.budgetMode === "total" && draft.platforms.length > 0) {
    if (!draft.endDate) {
      add("endDate", "El presupuesto total exige una fecha de término: es lo que permite repartirlo en días");
    } else if (diasHastaFin(draft.endDate) < 1) {
      add("endDate", "La fecha de término ya pasó");
    } else if (draft.platforms.includes("google")) {
      add(
        "dailyBudget",
        `Google, por esta vía, solo crea presupuesto diario: el total se reparte en ${diasHastaFin(draft.endDate)} días hasta el ${draft.endDate} (el tope exacto no se puede fijar).`,
        false,
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
 * Todo nace activo (decisión del equipo, 2026-10-06): la revisión es la aprobación previa, no una pausa posterior.
 */
export function buildPlan(
  draft: CampaignDraft,
  portfolio: PortfolioSummary | null,
  cuentas: CuentaCliente[],
  snapshot: PerformanceSnapshot,
  excluirCampanasDePresupuesto: ReadonlySet<string> = new Set(),
  /**
   * Si se puede impulsar la publicación dentro de la campaña o el conjunto que
   * ya existe. Lo calcula el SERVIDOR con datos reales de la plataforma
   * (`boost-compat.ts`); sin esto, adjuntar a algo existente nunca impulsa.
   */
  compatBoost: CompatibilidadBoost | null = null,
  opciones: {
    /** El cliente no mide conversiones (p. ej. sin Tag Manager): «Maximizar conversiones» no tendría con qué optimizar. */
    sinConversionesMedidas?: boolean;
  } = {},
): BuildResult {
  const boostEnExistente = Boolean(
    draft.boostPostId &&
      draft.existingCampaign?.platform === "meta" &&
      compatBoost &&
      (draft.existingAdset ? compatBoost.conjunto : compatBoost.campana),
  );
  const issues = validateDraft(draft, cuentas, boostEnExistente);
  const steps: PlanStep[] = [];
  const objective = OBJECTIVES[objetivoDe(draft, "google")];
  const objetivoMeta = objetivoDe(draft, "meta");
  // Maximizar conversiones necesita conversiones medidas: sin ellas Google no tiene con qué optimizar y rinde mal.
  // Si el cliente no las mide, se parte con «Maximizar clics» (`target_spend`) y se avisa.
  const googleSinConversiones = objective.google === "maximize_conversions" && opciones.sinConversionesMedidas === true;
  const estrategiaGoogle = objective.google === "maximize_conversions" && !googleSinConversiones ? "maximize_conversions" : "target_spend";
  // Con la Búsqueda nativa la puja se elige a propósito: ese aviso propio (más abajo) reemplaza a este.
  if (draft.platforms.includes("google") && googleSinConversiones && !(draft.googleChannel === "search" && draft.googleBusqueda)) {
    issues.push({
      field: "bidding",
      message:
        "Este cliente no tiene medición de conversiones (sin Tag Manager): la campaña de Google parte con «Maximizar clics» en vez de «Maximizar conversiones», que sin conversiones no tendría con qué optimizar. Instala la medición y cámbiala después.",
      blocking: false,
    });
  }
  // Cada plataforma resuelve su propio monto: el suyo si se definió aparte,
  // si no el compartido. Así elegir $10.000 solo para Meta no toca lo que
  // Google va a usar.
  const presupuestoDe = (plataforma: Platform): number =>
    draft.budgetByPlatform[plataforma] ?? draft.dailyBudget ?? 0;

  const enCampanaExistente =
    draft.existingCampaign?.platform === "google" ? draft.existingCampaign : null;
  const enConjuntoExistente = enCampanaExistente ? draft.existingAdset : null;
  // Decisión del equipo (2026-10-06): nada nace pausado. Lo que llega acá ya pasó por las aprobaciones que corresponden
  // (un Creator lo propone y un Lead o superior lo aprueba), así que al publicarse queda corriendo.
  const statusHijoGoogle: "enabled" | "paused" = "enabled";
  const etiquetaEstadoGoogle = statusHijoGoogle === "enabled" ? "activo" : "pausado";

  if (draft.platforms.includes("google") && draft.googleChannel === "pmax") {
    // Performance Max: Windsor no lo crea. Un solo paso con la API de Google Ads arma todo de forma atómica
    // (presupuesto, campaña, ubicación, textos, imágenes y grupo de recursos), pausado.
    const dias = draft.budgetMode === "total" && draft.endDate ? Math.max(1, diasHastaFin(draft.endDate)) : 1;
    const cuentaPmax = cuentaElegida(draft, cuentas, "google");
    steps.push({
      platform: "google",
      action: "ads:create_pmax",
      via: "nativa",
      label: cuentaPmax ? `Crear campaña de Performance Max en ${cuentaPmax.name}` : "Crear campaña de Performance Max",
      params: {
        name: nombreCompuesto(objective.sigla, "google", draft.name),
        daily_budget_micros: Math.max(1, Math.round(presupuestoDe("google") / dias)) * 1_000_000,
        final_url: draft.landingUrl.trim(),
        headlines: draft.headlines.filter((t) => t.trim()),
        long_headlines: [draft.displayLongHeadline.trim()].filter(Boolean),
        descriptions: draft.descriptions.filter((d) => d.trim()),
        business_name: draft.displayBusinessName.trim(),
        landscape_image_url: draft.mediaUrl.trim(),
        square_image_url: draft.displaySquareUrl.trim(),
        logo_url: draft.displayLogoUrl.trim(),
        locations: paisesEfectivos(draft, cuentaPmax)
          .filter((p) => GOOGLE_GEO_TARGET_IDS[p])
          .map((p) => GOOGLE_GEO_TARGET_IDS[p]),
        excluded_locations: draft.excludedCountries.filter((p) => GOOGLE_GEO_TARGET_IDS[p]).map((p) => GOOGLE_GEO_TARGET_IDS[p]),
        ...(draft.budgetMode === "total" && draft.endDate ? { end_date: draft.endDate } : {}),
        status: "enabled",
      },
    });
    if (googleSinConversiones) {
      issues.push({
        field: "bidding",
        message:
          "Performance Max solo optimiza por conversiones, y este cliente no las mide: sin medición rinde mal. Instala Tag Manager y define las conversiones antes de activarla.",
        blocking: false,
      });
    }
  } else if (draft.platforms.includes("google") && draft.googleChannel === "search" && draft.googleBusqueda && !enCampanaExistente) {
    // Búsqueda con la estructura propia de Google: un solo paso con la API de Google Ads (atómico, pausado).
    const cfg = draft.googleBusqueda;
    const cuentaBusqueda = cuentaElegida(draft, cuentas, "google");
    const dias = draft.budgetMode === "total" && draft.endDate ? Math.max(1, diasHastaFin(draft.endDate)) : 1;
    const micros = (valor: number | null): number | null => (valor ? Math.round(valor * 1_000_000) : null);
    const paises = paisesEfectivos(draft, cuentaBusqueda);
    const IDIOMAS: Record<string, string> = { es: "1003", en: "1000", pt: "1014" };
    // «Automática»: conversiones si el objetivo lo pide y el cliente las mide; si no, clics.
    const pujaElegida = cfg.puja === "auto" ? (estrategiaGoogle === "maximize_conversions" ? "conversiones" : "clics") : cfg.puja;
    const puja: DatosBusqueda["puja"] =
      pujaElegida === "clics"
        ? { tipo: "clics", cpcMaximoMicros: micros(cfg.cpcMaximo) }
        : pujaElegida === "conversiones"
          ? { tipo: "conversiones", cpaObjetivoMicros: micros(cfg.cpaObjetivo) }
          : pujaElegida === "valor_conversion"
            ? { tipo: "valor_conversion", roasObjetivo: cfg.roasObjetivo }
            : pujaElegida === "cpc_manual"
              ? { tipo: "cpc_manual", mejorarCpc: cfg.mejorarCpc }
              : { tipo: "cuota_impresiones", ubicacion: cfg.cuotaUbicacion, porcentaje: cfg.cuotaPorcentaje, cpcMaximoMicros: micros(cfg.cpcMaximo) ?? 0 };
    const datos: DatosBusqueda = {
      nombre: nombreCompuesto(objective.sigla, "google", draft.name),
      presupuestoDiarioMicros: Math.max(1, Math.round(presupuestoDe("google") / dias)) * 1_000_000,
      puja,
      redes: { socios: cfg.redSocios, display: cfg.redDisplay },
      presencia: cfg.presencia,
      ubicaciones: [
        ...paises.filter((p) => GOOGLE_GEO_TARGET_IDS[p]).map((p) => GOOGLE_GEO_TARGET_IDS[p]),
        ...draft.targetPlaces.filter((l) => /^\d+$/.test(l.id)).map((l) => l.id),
      ],
      excluidas: draft.excludedCountries.filter((p) => GOOGLE_GEO_TARGET_IDS[p]).map((p) => GOOGLE_GEO_TARGET_IDS[p]),
      proximidad: draft.geoRadius ? { lat: draft.geoRadius.lat, lng: draft.geoRadius.lng, radioKm: draft.geoRadius.radiusKm } : null,
      idiomas: draft.targetLanguages.map((l) => IDIOMAS[l]).filter(Boolean),
      programacion: cfg.programacion,
      inicio: cfg.inicio,
      fin: draft.endDate,
      rotacion: cfg.rotacion,
      plantillaSeguimiento: cfg.plantillaSeguimiento,
      sufijoUrl: cfg.sufijoUrl,
      grupo: { nombre: cfg.grupoNombre, cpcMicros: micros(cfg.cpcGrupo) },
      palabras: draft.keywords.map((l) => l.trim()).filter(Boolean).map(parsearPalabraClave).map((k) => ({ texto: k.text, tipo: k.match_type })),
      negativas: draft.negativeKeywords.map((l) => l.trim()).filter(Boolean).map(parsearPalabraClave).map((k) => ({ texto: k.text, tipo: k.match_type })),
      anuncio: {
        urlFinal: draft.landingUrl.trim(),
        titulares: draft.headlines.filter((t) => t.trim()),
        descripciones: draft.descriptions.filter((x) => x.trim()),
        path1: draft.pathDisplay1.trim(),
        path2: draft.pathDisplay2.trim(),
      },
      enlaces: cfg.enlaces,
      destacados: cfg.destacados,
      fragmento: cfg.fragmentoEncabezado && cfg.fragmentoValores.length > 0 ? { encabezado: cfg.fragmentoEncabezado, valores: cfg.fragmentoValores } : null,
      llamada: cfg.llamadaPais && cfg.llamadaTelefono ? { pais: cfg.llamadaPais, telefono: cfg.llamadaTelefono } : null,
      activarHijos: statusHijoGoogle === "enabled",
    };
    steps.push({
      platform: "google",
      action: "ads:create_search_campaign",
      via: "nativa",
      label: cuentaBusqueda ? `Crear campaña de Búsqueda en ${cuentaBusqueda.name}` : "Crear campaña de Búsqueda",
      params: { datos },
    });
    if (cfg.puja === "auto" && googleSinConversiones) {
      issues.push({
        field: "bidding",
        message: "Este cliente no tiene medición de conversiones: la campaña de Google parte con «Maximizar clics» en vez de «Maximizar conversiones». Instala la medición y cámbiala después.",
        blocking: false,
      });
    }
    if ((cfg.puja === "conversiones" || cfg.puja === "valor_conversion") && opciones.sinConversionesMedidas === true) {
      issues.push({
        field: "bidding",
        message: "Este cliente no tiene medición de conversiones: esta puja necesita conversiones para optimizar. Instala la medición, o usa «Maximizar clics».",
        blocking: false,
      });
    }
  } else if (draft.platforms.includes("google")) {
    const cuenta = cuentaElegida(draft, cuentas, "google");

    if (!enCampanaExistente) {
      steps.push({
        platform: "google",
        action: "create_campaign",
        label: cuenta
          ? `Crear campaña en ${cuenta.name}`
          : "Crear campaña",
        params: {
          // Siglas propias, no el nombre a secas: [OBJETIVO] [PLATAFORMA]
          // identifica de un vistazo qué es esto y de quién es, incluso en
          // una cuenta que también maneja otra agencia.
          name: nombreCompuesto(objective.sigla, "google", draft.name),
          // Google trabaja en micros: 1.000.000 = una unidad de la moneda.
          // Siempre en unidades enteras de la moneda: Google rechaza un monto que no sea múltiplo de su unidad mínima
          // ("A money amount was not a multiple of a minimum unit"), y un total repartido en días rara vez da entero.
          budget_amount_micros:
            Math.max(
              1,
              Math.round(
                draft.budgetMode === "total" && draft.endDate
                  ? presupuestoDe("google") / Math.max(1, diasHastaFin(draft.endDate))
                  : presupuestoDe("google"),
              ),
            ) * 1_000_000,
          channel_type: draft.googleChannel,
          bidding_strategy: estrategiaGoogle,
          status: "enabled",
        },
      });
    }

    if (!enConjuntoExistente) {
      steps.push({
        platform: "google",
        action: "create_ad_group",
        label: enCampanaExistente
          ? `Crear grupo de anuncios en «${enCampanaExistente.campaignName}» (${etiquetaEstadoGoogle})`
          : `Crear grupo de anuncios (${etiquetaEstadoGoogle})`,
        params: {
          name: enCampanaExistente ? draft.name : `${draft.name} · principal`,
          status: statusHijoGoogle,
          ...(enCampanaExistente
            ? { campaign_id: enCampanaExistente.campaignId }
            : {}),
        },
      });
    }

    if (draft.googleChannel === "display") {
      steps.push({
        platform: "google",
        action: "ads:create_display_ad",
        via: "nativa",
        label: `Crear anuncio de Display responsivo con imagen (${etiquetaEstadoGoogle})`,
        params: {
          ad_group_id: enConjuntoExistente?.adsetId ?? MARCADOR_PASO_ANTERIOR,
          headlines: draft.headlines.filter((t) => t.trim()),
          long_headline: draft.displayLongHeadline.trim(),
          descriptions: draft.descriptions.filter((d) => d.trim()),
          business_name: draft.displayBusinessName.trim(),
          final_url: draft.landingUrl.trim(),
          landscape_image_url: draft.mediaUrl.trim(),
          square_image_url: draft.displaySquareUrl.trim(),
          ...(draft.displayLogoUrl.trim() ? { logo_url: draft.displayLogoUrl.trim() } : {}),
          status: "enabled",
        },
      });
    } else steps.push({
      platform: "google",
      action: "create_responsive_search_ad",
      label: enConjuntoExistente
        ? `Crear anuncio en «${enConjuntoExistente.adsetName}» (${etiquetaEstadoGoogle})`
        : `Crear anuncio de búsqueda responsivo (${etiquetaEstadoGoogle})`,
      params: {
        // Igual que el video_id de Meta más abajo: si el grupo se crea en
        // este mismo plan, su id real solo existe después de ejecutar el
        // paso anterior. `create_responsive_search_ad` lo exige siempre.
        ad_group_id: enConjuntoExistente?.adsetId ?? MARCADOR_PASO_ANTERIOR,
        headlines: draft.headlines.filter((t) => t.trim()),
        descriptions: draft.descriptions.filter((d) => d.trim()),
        final_url: draft.landingUrl.trim(),
        status: statusHijoGoogle,
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
    if (palabrasClave.length > 0 && draft.googleChannel === "search") {
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

    // Negativas: a nivel de campaña, no del grupo — mismo parser que las
    // palabras clave positivas, misma sintaxis real de Google Ads.
    const palabrasNegativas = draft.negativeKeywords
      .map((linea) => linea.trim())
      .filter(Boolean)
      .map(parsearPalabraClave);
    if (palabrasNegativas.length > 0) {
      steps.push({
        platform: "google",
        action: "push_negative_keywords",
        label: "Añadir palabras clave negativas",
        params: {
          level: "campaign",
          campaign_id: enCampanaExistente?.campaignId ?? MARCADOR_PASO_ANTERIOR,
          keywords: palabrasNegativas,
        },
      });
    }

    // Tope de CPC: solo aplica de verdad con Maximizar clics — con otra
    // estrategia la acción real lo trata como algo de cartera y no de
    // campaña, así que ahí no se envía (ver doc de `cpcCeiling` más arriba).
    if (
      draft.cpcCeiling !== null &&
      draft.cpcCeiling > 0 &&
      estrategiaGoogle !== "maximize_conversions"
    ) {
      steps.push({
        platform: "google",
        action: "set_cpc_bid_ceiling",
        label: "Definir tope de CPC",
        params: {
          campaign_id: enCampanaExistente?.campaignId ?? MARCADOR_PASO_ANTERIOR,
          amount_micros: Math.round(draft.cpcCeiling * 1_000_000),
        },
      });
    }

    // Idiomas: vacío es el default real de Google (todos), así que solo se
    // envía el paso cuando de verdad se restringió a algo.
    if (draft.targetLanguages.length > 0) {
      steps.push({
        platform: "google",
        action: "set_campaign_language_targeting",
        label: "Definir idiomas",
        params: {
          campaign_id: enCampanaExistente?.campaignId ?? MARCADOR_PASO_ANTERIOR,
          languages: draft.targetLanguages,
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
        // tabla estática de 219 países. Los que vienen del respaldo por mapa
        // (`osm:...`, ver `lib/geocoding.ts`) no tienen id real de Google —
        // se filtran acá para no mandarle a Google un id que no es suyo.
        ...draft.targetPlaces
          .filter((lugar) => /^\d+$/.test(lugar.id))
          .map((lugar) => ({
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
  // Salvo que el servidor haya confirmado, con datos reales, que la campaña o el
  // conjunto de destino admiten impulsar (ver `boost-compat.ts`): entonces sí.
  const boosteando =
    Boolean(draft.boostPostId) &&
    ((!enCampanaMetaExistente && !enConjuntoMetaExistente) || boostEnExistente);
  // Adjuntar una publicación a impulsar en algo que NO lo admite no puede caer en
  // crear un anuncio distinto en silencio (perdería las reacciones y comentarios
  // que son el punto de impulsar): se bloquea con el motivo real de Meta.
  const boostBloqueado = Boolean(
    draft.boostPostId &&
      (enCampanaMetaExistente || enConjuntoMetaExistente) &&
      !boostEnExistente,
  );
  if (boostBloqueado) {
    issues.push({
      field: "boostPostId",
      message: `No se puede impulsar esta publicación ahí: ${
        compatBoost?.motivo ??
        "no se pudo confirmar con la plataforma que esa campaña admita impulsar publicaciones"
      }`,
      blocking: true,
    });
  }
  // Mismo criterio que statusHijoGoogle: solo activo de entrada cuando la
  // campaña de Meta es 100% nueva en este plan — la campaña pausada es el
  // freno, nunca el conjunto o el anuncio adjuntados a algo que ya existe.
  const statusHijoMeta: "active" | "paused" = "active";
  const etiquetaEstadoMeta = statusHijoMeta === "active" ? "activo" : "pausado";

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
          ? `Crear campaña en ${cuenta.name}`
          : "Crear campaña",
        params: {
          // Impulsar una publicación crea una campaña de INTERACCIÓN (lo exige Meta): la sigla del nombre debe decir
          // lo mismo, porque los reportes clasifican el objetivo por la sigla. Antes quedaba «[LDS]» sobre una de interacción.
          name: nombreCompuesto(boosteando ? "AE" : OBJECTIVES[objetivoMeta].sigla, "meta", draft.name),
          // Boostear exige una campaña de interacción — ni el objetivo de
          // negocio ni el override de acá aplican, igual que en Meta Ads
          // Manager al usar "Impulsar publicación".
          objective: boosteando
            ? "OUTCOME_ENGAGEMENT"
            : (draft.metaObjective ?? OBJECTIVES[objetivoMeta].meta),
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
                bid_strategy: boosteando ? "LOWEST_COST_WITHOUT_CAP" : draft.metaBidStrategy,
              }
            : // Sin presupuesto de campaña, Windsor avisa que algunas cuentas
              // exigen declarar esto explícito: que el gasto NO se comparte
              // entre conjuntos, porque cada uno trae el suyo propio.
              { is_adset_budget_sharing_enabled: false }),
          status: "active",
        },
      });
    }

    // Límite de gasto de la campaña: `create_campaign` no lo admite, `update_campaign` sí (`spend_cap`, unidad menor).
    if (!enCampanaMetaExistente && !boosteando && draft.metaSpendCap) {
      steps.push({
        platform: "meta",
        action: "update_campaign",
        label: "Definir el límite de gasto de la campaña",
        params: {
          campaign_id: MARCADOR_PASO_ANTERIOR,
          spend_cap: Math.round(draft.metaSpendCap * unidadesMenoresMeta(cuenta?.currency)),
        },
      });
    }

    // Público y ubicaciones van en `targeting`, el objeto genérico que Meta
    // define en su API real y que Windsor pasa tal cual.
    const paisesMetaPlan = paisesEfectivos(draft, cuenta);
    const geoLocations: Record<string, unknown> = {};
    if (paisesMetaPlan.length > 0) geoLocations.countries = paisesMetaPlan;
    // Círculo del mapa y regiones/ciudades geocodificadas van al mismo campo
    // real de la Marketing API de Meta (`geo_locations.custom_locations`):
    // Meta no tiene su propio id de región/ciudad vía Windsor, así que un
    // lugar elegido en "Región / Ciudad" solo llega acá si ya se resolvió a
    // lat/lng/radio real contra Nominatim (`lib/geocoding.ts`) — nunca con un
    // centro o un radio inventado.
    const circulos = [
      ...(draft.geoRadius
        ? [
            {
              latitude: draft.geoRadius.lat,
              longitude: draft.geoRadius.lng,
              radius: draft.geoRadius.radiusKm,
              distance_unit: "kilometer" as const,
            },
          ]
        : []),
      ...draft.targetPlaces
        .filter((lugar) => !lugar.metaKey && lugar.lat !== undefined && lugar.lng !== undefined && lugar.radiusKm)
        .map((lugar) => ({
          latitude: lugar.lat!,
          longitude: lugar.lng!,
          radius: lugar.radiusKm!,
          distance_unit: "kilometer" as const,
        })),
    ];
    if (circulos.length > 0) geoLocations.custom_locations = circulos;
    // Lugares con key real de Meta: la región o la ciudad de Meta tal cual (más precisa que un círculo).
    const regionesMeta = draft.targetPlaces.filter((l) => l.metaKey && l.tier === "region").map((l) => ({ key: l.metaKey! }));
    const ciudadesMeta = draft.targetPlaces.filter((l) => l.metaKey && l.tier === "city").map((l) => ({ key: l.metaKey! }));
    if (regionesMeta.length > 0) geoLocations.regions = regionesMeta;
    if (ciudadesMeta.length > 0) geoLocations.cities = ciudadesMeta;
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
    if (draft.metaCustomAudiences.length > 0) {
      targeting.custom_audiences = draft.metaCustomAudiences.map((id) => ({ id }));
    }
    if (draft.metaExcludedAudiences.length > 0) {
      targeting.excluded_custom_audiences = draft.metaExcludedAudiences.map((id) => ({ id }));
    }

    const aMensajes = draft.conversionLocation === "mensajes";
    // Meta exige un `custom_event_type` por objetivo, no un "conversión"
    // genérico: LEAD para pedir datos de contacto, PURCHASE para venta.
    // "Alcance" (OUTCOME_AWARENESS) nunca fue una conversión — optimizaba mal
    // desde antes de esta corrección, cayendo en el mismo OFFSITE_CONVERSIONS
    // que leads y ventas — así que pasa a REACH, que no exige píxel.
    const eventoDeConversion: "LEAD" | "PURCHASE" | null =
      objetivoMeta === "leads" ? "LEAD" : objetivoMeta === "ventas" ? "PURCHASE" : null;
    // OFFSITE_CONVERSIONS exige `promoted_object` (pixel_id +
    // custom_event_type): verificado contra `create_adset` real en Windsor
    // ("some optimization goals require promoted_object ... for
    // conversions"). Sin píxel configurado en la cuenta, Meta rechaza el
    // conjunto de anuncios — confirmado en vivo contra Colbún (2026-09-23,
    // "Plan Hogar"): 0 conjuntos, 0 anuncios, sin ningún aviso. Ahora se
    // bloquea antes de publicar algo condenado a fallar, en vez de dejarlo
    // pasar y enterarse por la cuenta real.
    const necesitaPixel =
      !enConjuntoMetaExistente && eventoDeConversion !== null && !boosteando && !aMensajes;
    const pixelesDeLaCuenta = cuenta?.pixels ?? [];
    // Una cuenta puede tener más de un píxel (MGC: Converse y Coliseum en la
    // misma cuenta) — con exactamente uno no hay nada que elegir, con más de
    // uno la persona tiene que decidir cuál corresponde a esta campaña, nunca
    // se adivina.
    const pixelElegido =
      draft.metaPixelId && pixelesDeLaCuenta.some((p) => p.pixelId === draft.metaPixelId)
        ? draft.metaPixelId
        : pixelesDeLaCuenta.length === 1
          ? pixelesDeLaCuenta[0].pixelId
          : null;
    const faltaPixel = necesitaPixel && pixelesDeLaCuenta.length === 0;
    const pixelAmbiguo = necesitaPixel && pixelesDeLaCuenta.length > 1 && !pixelElegido;
    if (faltaPixel) {
      issues.push({
        field: "accountByPlatform",
        message: `Meta: para optimizar a ${objetivoMeta === "leads" ? "leads" : "ventas"} hace falta el píxel de esta cuenta de Meta (configúralo en la ficha del cliente), o cambia el destino de conversión a Mensajes.`,
        blocking: true,
      });
    }
    if (pixelAmbiguo) {
      issues.push({
        field: "metaPixelId",
        message: `Meta: esta cuenta tiene ${pixelesDeLaCuenta.length} píxeles configurados (${pixelesDeLaCuenta.map((p) => p.label ?? p.pixelId).join(", ")}) — elige cuál usar para optimizar a ${objetivoMeta === "leads" ? "leads" : "ventas"}.`,
        blocking: true,
      });
    }
    if (!enConjuntoMetaExistente) {
      steps.push({
        platform: "meta",
        action: "create_adset",
        label: enCampanaMetaExistente
          ? `Crear conjunto de anuncios en «${enCampanaMetaExistente.campaignName}» (${etiquetaEstadoMeta})`
          : `Crear conjunto de anuncios (${etiquetaEstadoMeta})`,
        params: {
          name: enCampanaMetaExistente ? draft.name : `${draft.name} · principal`,
          ...(enCampanaMetaExistente
            ? { campaign_id: enCampanaMetaExistente.campaignId }
            : {}),
          optimization_goal: boosteando
            ? "POST_ENGAGEMENT"
            : aMensajes && objetivoMeta === "leads"
              ? // Verificado en vivo contra Colbún (2026-09-24): "CONVERSATIONS"
                // lo rechaza Meta acá con "el objetivo de rendimiento no está
                // disponible" (code 100, subcode 2490408), a pesar de que la
                // documentación de la acción lo lista como válido para
                // OUTCOME_LEADS. El valor real que Meta acepta es
                // "LEAD_GENERATION" — probado con una escritura real, no
                // supuesto de la documentación.
                "LEAD_GENERATION"
              : aMensajes
                ? "CONVERSATIONS"
                : objetivoMeta === "trafico"
                ? "LINK_CLICKS"
                : objetivoMeta === "alcance"
                  ? "REACH"
                  : objetivoMeta === "interaccion"
                    ? "POST_ENGAGEMENT"
                    : "OFFSITE_CONVERSIONS",
          ...(eventoDeConversion !== null && !boosteando && !aMensajes && pixelElegido
            ? {
                promoted_object: {
                  pixel_id: pixelElegido,
                  custom_event_type: eventoDeConversion,
                },
              }
            : {}),
          billing_event: "IMPRESSIONS",
          // Estrategia de puja y control de costo. Con presupuesto de campaña la estrategia vive en la campaña; el
          // importe (límite de puja, costo objetivo o ROAS) siempre va en el conjunto.
          ...(!boosteando && !conCBO ? { bid_strategy: draft.metaBidStrategy } : {}),
          ...(!boosteando && draft.metaBidStrategy !== "LOWEST_COST_WITHOUT_CAP" && draft.metaBidAmount
            ? draft.metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS"
              ? { extra_params: { bid_constraints: { roas_average_floor: Math.round(draft.metaBidAmount * 10000) } } }
              : { bid_amount: Math.round(draft.metaBidAmount * unidadesMenoresMeta(cuenta?.currency)) }
            : {}),
          // Ventana de atribución, como `attribution_spec` (parámetro directo de Meta que Windsor pasa tal cual).
          ...(!boosteando && META_ATTRIBUTION[draft.metaAttribution].spec
            ? {
                extra_params: {
                  ...(draft.metaBidStrategy === "LOWEST_COST_WITH_MIN_ROAS" && draft.metaBidAmount ? { bid_constraints: { roas_average_floor: Math.round(draft.metaBidAmount * 10000) } } : {}),
                  attribution_spec: META_ATTRIBUTION[draft.metaAttribution].spec,
                },
              }
            : {}),
          status: statusHijoMeta,
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
          ...(conCBO || (boosteando && enCampanaMetaExistente && compatBoost?.presupuestoEnCampana)
            ? {}
            : draft.budgetMode === "total"
              ? { lifetime_budget: Math.round(presupuestoDe("meta") * unidadesMenoresMeta(cuenta?.currency)) }
              : { daily_budget: Math.round(presupuestoDe("meta") * unidadesMenoresMeta(cuenta?.currency)) }),
          // ON_POST + POST_ENGAGEMENT: la forma simple de boostear que Meta
          // documenta sin exigir un botón de acción.
          ...(boosteando
            ? {
                destination_type: "ON_POST",
                // Windsor lo exige siempre para boost_post, con las dos
                // formas de conjunto (ON_POST o FACEBOOK_PAGE): "the target
                // ad set MUST belong to an engagement campaign and name the
                // post's page in its promoted_object". Faltaba —encontrado
                // releyendo la descripción real de la acción, no en una
                // prueba en vivo— y habría hecho fallar cualquier boost
                // igual que el anuncio de la demo.
                promoted_object: { page_id: cuenta?.pageId ?? null },
              }
            : aMensajes
              ? {
                  destination_type: "MESSENGER",
                  // Meta lo exige siempre para un destino de mensajería
                  // (Messenger, Instagram Direct, WhatsApp) — mismo caso que
                  // boost_post arriba, encontrado en una publicación real
                  // contra Colbún (2026-09-24): sin esto, Meta rechaza la
                  // creación con "el objetivo de rendimiento no está
                  // disponible", un mensaje que no menciona el motivo real.
                  promoted_object: { page_id: cuenta?.pageId ?? null },
                }
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
        label: `Boostear la publicación (${etiquetaEstadoMeta})`,
        params: {
          // Impulsando directo en un conjunto que ya existe y es compatible, el
          // id es ese. En cualquier otro caso el conjunto se crea en este mismo
          // plan (ver `boosteando` arriba), así que su id real solo existe
          // después de ejecutar ese paso.
          adset_id: enConjuntoMetaExistente?.adsetId ?? MARCADOR_PASO_ANTERIOR,
          post_id: draft.boostPostId,
          name: draft.name,
          status: statusHijoMeta,
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
          ? `Crear anuncio en «${enConjuntoMetaExistente.adsetName}» (${etiquetaEstadoMeta})`
          : `Crear anuncio (${etiquetaEstadoMeta})`,
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
          status: statusHijoMeta,
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

  // Con el impulso bloqueado no se muestra ningún paso de Meta: quedaría a la
  // vista un anuncio de reemplazo (sin las reacciones de la publicación) que
  // nadie pidió y que no se va a ejecutar.
  if (boostBloqueado) {
    const sinMeta = steps.filter((paso) => paso.platform !== "meta");
    steps.length = 0;
    steps.push(...sinMeta);
  }

  const budgets: Partial<Record<Platform, BudgetAdvice>> = {};
  for (const plataforma of draft.platforms) {
    budgets[plataforma] = recommendBudget(portfolio, plataforma, snapshot, excluirCampanasDePresupuesto);
  }

  return {
    issues,
    budgets,
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
// La sintaxis de palabras clave vive en `lib/palabras-clave.ts` (la comparte
// con la edición de un grupo ya publicado); se reexporta para no mover imports.
export { parsearPalabraClave };

/** Días que quedan desde hoy hasta la fecha de término, contando ambos extremos (mínimo 0 si ya pasó). */
export function diasHastaFin(endDate: string, hoy: Date = new Date()): number {
  const fin = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(fin)) return 0;
  const inicio = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.max(0, Math.floor((fin - inicio) / 86_400_000) + 1);
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
/** Lista de ids numéricos de Meta (audiencias, intereses), sin repetidos ni basura. */
function idsNumericos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.map((v) => String(v).trim()).filter((v) => /^\d{5,}$/.test(v)))];
}

export function normalizeDraft(body: Partial<CampaignDraft>): CampaignDraft {
  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter(
    (value): value is Platform => ACTIVE_PLATFORMS.includes(value as Platform),
  );
  const objective: Objective = (
    ["trafico", "leads", "ventas", "alcance", "interaccion"] as const
  ).includes(body.objective as Objective)
    ? (body.objective as Objective)
    : "trafico";

  const objetivosValidos = ["trafico", "leads", "ventas", "alcance", "interaccion"];
  const objectiveByPlatform: Partial<Record<Platform, Objective>> = {};
  if (body.objectiveByPlatform && typeof body.objectiveByPlatform === "object") {
    for (const platform of ACTIVE_PLATFORMS) {
      const valor = (body.objectiveByPlatform as Record<string, unknown>)[platform];
      if (typeof valor === "string" && objetivosValidos.includes(valor) && valor !== objective) {
        objectiveByPlatform[platform] = valor as Objective;
      }
    }
  }

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

  const metaObjective = (
    ["OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_SALES"] as const
  ).includes(body.metaObjective as MetaObjectiveOverride)
    ? (body.metaObjective as MetaObjectiveOverride)
    : null;

  const callToAction: CallToAction =
    typeof body.callToAction === "string" && esCta(body.callToAction)
      ? body.callToAction
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
    metaPixelId:
      typeof body.metaPixelId === "string" && body.metaPixelId.trim()
        ? body.metaPixelId.trim()
        : null,
    name: String(body.name ?? ""),
    details: String(body.details ?? ""),
    objective,
    objectiveByPlatform,
    googleBusqueda: normalizarBusquedaGoogle(body.googleBusqueda),
    metaObjective,
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
    displaySquareUrl: String(body.displaySquareUrl ?? "").trim().slice(0, 2000),
    displayLogoUrl: String(body.displayLogoUrl ?? "").trim().slice(0, 2000),
    displayLongHeadline: String(body.displayLongHeadline ?? "").slice(0, 90),
    displayBusinessName: String(body.displayBusinessName ?? "").slice(0, 25),
    keywords: (Array.isArray(body.keywords) ? body.keywords : []).map(String),
    negativeKeywords: (Array.isArray(body.negativeKeywords) ? body.negativeKeywords : []).map(
      String,
    ),
    cpcCeiling:
      typeof body.cpcCeiling === "number" && Number.isFinite(body.cpcCeiling) && body.cpcCeiling > 0
        ? body.cpcCeiling
        : null,
    targetLanguages: (Array.isArray(body.targetLanguages) ? body.targetLanguages : []).filter(
      (l): l is "es" | "en" | "pt" => l === "es" || l === "en" || l === "pt",
    ),
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
    googleChannel: body.googleChannel === "display" ? "display" : body.googleChannel === "pmax" ? "pmax" : "search",
    metaPlacements: (Array.isArray(body.metaPlacements)
      ? body.metaPlacements
      : []
    ).map(String),
    metaSurfaces: (Array.isArray(body.metaSurfaces) ? body.metaSurfaces : []).map(
      String,
    ),
    metaBidStrategy: (Object.keys(META_BID_STRATEGIES) as MetaBidStrategy[]).find((k) => k === body.metaBidStrategy) ?? "LOWEST_COST_WITHOUT_CAP",
    metaBidAmount: typeof body.metaBidAmount === "number" && Number.isFinite(body.metaBidAmount) && body.metaBidAmount > 0 ? body.metaBidAmount : null,
    metaSpendCap: typeof body.metaSpendCap === "number" && Number.isFinite(body.metaSpendCap) && body.metaSpendCap > 0 ? body.metaSpendCap : null,
    metaAttribution: (Object.keys(META_ATTRIBUTION) as MetaAttribution[]).find((k) => k === body.metaAttribution) ?? "default",
    metaCustomAudiences: idsNumericos(body.metaCustomAudiences),
    metaExcludedAudiences: idsNumericos(body.metaExcludedAudiences),
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
    // Default true a propósito: es el ahorro de pasos que se pidió. Solo se
    // desactiva si alguien lo destildó explícitamente en la pantalla.
    activarConjuntoYAnuncio: body.activarConjuntoYAnuncio !== false,
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
    const { id, nombre, countryCode, tier, lat, lng, radiusKm, aproximado, metaKey } =
      item as Record<string, unknown>;
    if (typeof id !== "string" || !id.trim()) continue;
    if (typeof nombre !== "string" || !nombre.trim()) continue;
    if (typeof countryCode !== "string" || !countryCode.trim()) continue;
    if (tier !== "region" && tier !== "city") continue;
    const tieneCoordenadas =
      typeof lat === "number" &&
      Number.isFinite(lat) &&
      typeof lng === "number" &&
      Number.isFinite(lng) &&
      typeof radiusKm === "number" &&
      Number.isFinite(radiusKm) &&
      radiusKm > 0;
    salida.push({
      id: id.trim(),
      nombre: nombre.trim(),
      countryCode: countryCode.trim().toUpperCase(),
      tier,
      ...(tieneCoordenadas
        ? { lat, lng, radiusKm, aproximado: aproximado === true }
        : {}),
      // El key de Meta son solo dígitos: cualquier otra cosa se descarta en vez de mandársela a Meta.
      ...(typeof metaKey === "string" && /^\d{1,12}$/.test(metaKey) ? { metaKey } : {}),
    });
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
