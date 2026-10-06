/**
 * Desglose de una campaña, conjunto o anuncio por edad, género, red, posición,
 * dispositivo, región, día u hora: lo que en Meta Ads Manager es "Desglose".
 *
 * Es puro (sin red ni base de datos): define qué campos pide cada plataforma y
 * convierte las filas de Windsor —una por cada combinación— en un cuadro
 * ordenado, con etiquetas en español y el peso de cada segmento en el gasto.
 *
 * Los nombres de campo están verificados con datos reales (2026-09-29): Meta
 * devuelve `age`, `gender`, `publisher_platform`, `platform_position`,
 * `device_platform` y `region` junto a las métricas; Google, `device`,
 * `ad_network_type`, `day_of_week` y `hour`. Edad y género de Google no se
 * ofrecen: en su API viven en vistas aparte que Windsor no entrega por campaña.
 */
import type { Platform } from "./plataformas";

export type Dimension =
  | "edad"
  | "genero"
  | "edad_genero"
  | "red"
  | "posicion"
  | "dispositivo"
  | "region"
  | "dia"
  | "hora";

type Definicion = {
  etiqueta: string;
  /** Campos de Windsor que definen el segmento. */
  campos: string[];
  /** Orden natural del eje (edad, día, hora) en vez de por gasto. */
  natural?: boolean;
};

export const DIMENSIONES: Record<Platform, Partial<Record<Dimension, Definicion>>> = {
  meta: {
    edad: { etiqueta: "Edad", campos: ["age"], natural: true },
    genero: { etiqueta: "Género", campos: ["gender"] },
    edad_genero: { etiqueta: "Edad y género", campos: ["age", "gender"], natural: true },
    red: { etiqueta: "Red", campos: ["publisher_platform"] },
    posicion: { etiqueta: "Posición", campos: ["publisher_platform", "platform_position"] },
    dispositivo: { etiqueta: "Dispositivo", campos: ["device_platform"] },
    region: { etiqueta: "Región", campos: ["region"] },
  },
  google: {
    dispositivo: { etiqueta: "Dispositivo", campos: ["device"] },
    red: { etiqueta: "Red", campos: ["ad_network_type"] },
    dia: { etiqueta: "Día de la semana", campos: ["day_of_week"], natural: true },
    hora: { etiqueta: "Hora del día", campos: ["hour"], natural: true },
  },
  tiktok: {},
  linkedin: {},
};

/**
 * Métricas que se piden junto al segmento, por plataforma.
 *
 * Meta: los desgloses NO admiten los campos "omni" (Windsor responde 400: "Breakdown
 * fields are incompatible with 'omni' and 'ranking' fields"), así que las compras se
 * piden como `actions_purchase` y no como `actions_omni_purchase`, que es la que usa
 * el resto de la app. Puede diferir un poco del total de la tabla principal (omni suma
 * compras web, en app y offline); el desglose sirve para comparar segmentos entre sí.
 */
export const METRICAS: Record<Platform, string[]> = {
  meta: ["spend", "impressions", "clicks", "reach", "actions_lead", "actions_purchase"],
  google: ["cost", "impressions", "clicks", "conversions"],
  tiktok: [],
  linkedin: [],
};

export function dimensionesDe(provider: string): Array<{ id: Dimension; etiqueta: string }> {
  const defs = DIMENSIONES[provider as Platform] ?? {};
  return (Object.keys(defs) as Dimension[]).map((id) => ({ id, etiqueta: defs[id]!.etiqueta }));
}

export function camposDeDesglose(provider: Platform, dimension: Dimension): string[] | null {
  const def = DIMENSIONES[provider]?.[dimension];
  return def ? [...def.campos, ...METRICAS[provider]] : null;
}

/* ---------------------------------- etiquetas ------------------------------ */

const GENERO: Record<string, string> = { female: "Mujeres", male: "Hombres", unknown: "Sin dato" };
const RED_META: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
  threads: "Threads",
  whatsapp: "WhatsApp",
  unknown: "Sin dato",
};
const DISPOSITIVO_META: Record<string, string> = {
  mobile_app: "App móvil",
  mobile_web: "Web móvil",
  desktop: "Computador",
  unknown: "Sin dato",
};
const DISPOSITIVO_GOOGLE: Record<string, string> = {
  DESKTOP: "Computador",
  MOBILE: "Móvil",
  TABLET: "Tablet",
  CONNECTED_TV: "TV conectada",
  OTHER: "Otro",
  UNKNOWN: "Sin dato",
};
const RED_GOOGLE: Record<string, string> = {
  SEARCH: "Búsqueda de Google",
  SEARCH_PARTNERS: "Socios de búsqueda",
  CONTENT: "Display",
  YOUTUBE: "YouTube",
  YOUTUBE_SEARCH: "Búsqueda de YouTube",
  YOUTUBE_VIDEOS: "Videos de YouTube",
  MIXED: "Varias redes",
  GOOGLE_TV: "Google TV",
  UNKNOWN: "Sin dato",
};
const DIAS: Record<string, string> = {
  MONDAY: "Lunes", TUESDAY: "Martes", WEDNESDAY: "Miércoles", THURSDAY: "Jueves",
  FRIDAY: "Viernes", SATURDAY: "Sábado", SUNDAY: "Domingo",
};
const ORDEN_DIAS = Object.keys(DIAS);

function bonito(codigo: string): string {
  const t = codigo.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Sin dato";
}

/** `instagram_stories` → "Historias" en Instagram, sin repetir el nombre de la red. */
function posicion(red: string, pos: string): string {
  const limpia = pos.replace(new RegExp(`^${red}_`), "");
  const nombres: Record<string, string> = {
    feed: "Feed", stories: "Historias", story: "Historias", reels: "Reels", reels_overlay: "Reels (superposición)",
    profile_feed: "Feed del perfil", marketplace: "Marketplace", search: "Búsqueda", instream_video: "Video in-stream",
    right_hand_column: "Columna derecha", explore: "Explorar", explore_home: "Inicio de Explorar",
    an_classic: "Audience Network clásico", rewarded_video: "Video con recompensa", threads_feed: "Feed de Threads",
    video_feeds: "Feed de videos", biz_disco_feed: "Feed de descubrimiento",
  };
  return `${RED_META[red] ?? bonito(red)} · ${nombres[limpia] ?? bonito(limpia)}`;
}

/** Etiqueta en español de un valor de segmento. */
export function etiquetaDeSegmento(
  provider: Platform,
  dimension: Dimension,
  valores: Record<string, string>,
): string {
  const v = (k: string) => (valores[k] ?? "").trim();
  switch (dimension) {
    case "edad": return v("age") && v("age") !== "Unknown" ? v("age") : "Sin dato";
    case "genero": return GENERO[v("gender")] ?? bonito(v("gender"));
    case "edad_genero": {
      const edad = v("age") && v("age") !== "Unknown" ? v("age") : "Sin dato";
      return `${edad} · ${GENERO[v("gender")] ?? bonito(v("gender"))}`;
    }
    case "red":
      return provider === "google"
        ? (RED_GOOGLE[v("ad_network_type")] ?? bonito(v("ad_network_type")))
        : (RED_META[v("publisher_platform")] ?? bonito(v("publisher_platform")));
    case "posicion": return posicion(v("publisher_platform"), v("platform_position"));
    case "dispositivo":
      return provider === "google"
        ? (DISPOSITIVO_GOOGLE[v("device")] ?? bonito(v("device")))
        : (DISPOSITIVO_META[v("device_platform")] ?? bonito(v("device_platform")));
    case "region": return v("region") || "Sin dato";
    case "dia": return DIAS[v("day_of_week")] ?? bonito(v("day_of_week"));
    case "hora": {
      const h = Number(v("hour"));
      return Number.isFinite(h) && v("hour") !== "" ? `${String(h).padStart(2, "0")}:00` : "Sin dato";
    }
  }
}

/** Clave de orden natural del eje (edad ascendente, lunes a domingo, 0 a 23 h). */
function ordenNatural(dimension: Dimension, valores: Record<string, string>, etiqueta: string): string {
  if (dimension === "edad" || dimension === "edad_genero") {
    const edad = (valores.age ?? "").trim();
    const n = /^\d+/.exec(edad);
    return `${n ? String(n[0]).padStart(3, "0") : "999"}|${etiqueta}`;
  }
  if (dimension === "dia") return String(ORDEN_DIAS.indexOf((valores.day_of_week ?? "").trim())).padStart(2, "0");
  if (dimension === "hora") return String(Number(valores.hour)).padStart(3, "0");
  return etiqueta;
}

/* ------------------------------- filas del cuadro -------------------------- */

export type FilaDeDesglose = {
  clave: string;
  etiqueta: string;
  gasto: number;
  impresiones: number;
  clics: number;
  /** Solo Meta: el alcance de cada segmento no se puede sumar entre segmentos. */
  alcance: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  resultados: number | null;
  costoPorResultado: number | null;
  /** Fracción del gasto total (0–1). */
  pesoDelGasto: number;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const opc = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const suma = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

/**
 * Filas crudas de Windsor → cuadro de desglose. Windsor puede devolver más de
 * una fila por segmento (por ejemplo, partidas por día); se fusionan.
 */
export function filasDeDesglose(
  provider: Platform,
  dimension: Dimension,
  filas: Array<Record<string, unknown>>,
): FilaDeDesglose[] {
  const def = DIMENSIONES[provider]?.[dimension];
  if (!def) return [];

  type Acc = { etiqueta: string; orden: string; gasto: number; imp: number; clics: number; alcance: number | null; leads: number | null; compras: number | null; conv: number | null };
  const grupos = new Map<string, Acc>();

  for (const fila of filas) {
    const valores: Record<string, string> = {};
    for (const campo of def.campos) valores[campo] = String(fila[campo] ?? "");
    const etiqueta = etiquetaDeSegmento(provider, dimension, valores);
    const clave = def.campos.map((c) => valores[c]).join("|");
    const gasto = num(provider === "google" ? fila.cost : fila.spend);
    const acc = grupos.get(clave) ?? {
      etiqueta, orden: ordenNatural(dimension, valores, etiqueta),
      gasto: 0, imp: 0, clics: 0, alcance: null, leads: null, compras: null, conv: null,
    };
    acc.gasto += gasto;
    acc.imp += num(fila.impressions);
    acc.clics += num(fila.clicks);
    // El alcance de dos filas del MISMO segmento no se suma (sería contar dos
    // veces a la misma persona): se queda con el mayor, igual que en `windsor.ts`.
    const alcance = opc(fila.reach);
    acc.alcance = alcance === null ? acc.alcance : Math.max(acc.alcance ?? 0, alcance);
    acc.leads = suma(acc.leads, opc(fila.actions_lead));
    acc.compras = suma(acc.compras, opc(fila.actions_purchase));
    acc.conv = suma(acc.conv, opc(fila.conversions));
    grupos.set(clave, acc);
  }

  const total = [...grupos.values()].reduce((s, g) => s + g.gasto, 0);
  const salida = [...grupos.entries()].map(([clave, g]): FilaDeDesglose & { _orden: string } => {
    const resultados = g.leads ?? g.compras ?? g.conv;
    return {
      clave,
      etiqueta: g.etiqueta,
      gasto: g.gasto,
      impresiones: g.imp,
      clics: g.clics,
      alcance: provider === "meta" ? g.alcance : null,
      ctr: g.imp > 0 ? g.clics / g.imp : null,
      cpc: g.clics > 0 ? g.gasto / g.clics : null,
      cpm: g.imp > 0 ? (g.gasto / g.imp) * 1000 : null,
      resultados,
      costoPorResultado: resultados && resultados > 0 ? g.gasto / resultados : null,
      pesoDelGasto: total > 0 ? g.gasto / total : 0,
      _orden: g.orden,
    };
  });

  salida.sort((a, b) =>
    def.natural ? a._orden.localeCompare(b._orden, "es") : b.gasto - a.gasto,
  );
  return salida.map((fila) => {
    const { _orden: _omitido, ...limpia } = fila;
    void _omitido;
    return limpia;
  });
}
