/**
 * Clasificación de acciones de conversión de Google Ads.
 *
 * Regla base, tomada de la documentación de MetriQ y verificada contra datos
 * reales: **nunca reportar `conversions` a secas como "los resultados"**. Ese
 * campo mezcla compras con vistas de página y WhatsApp con formularios.
 *
 * El caso que lo demuestra: Bodenor Flexcenter declaraba 9.754 conversiones en
 * septiembre. Segmentadas por acción resultaron 9.747 vistas de página y
 * **7 formularios**. La cifra sin segmentar exageraba el resultado real por
 * más de mil veces.
 *
 * Para segmentar hay que pedir `conversion_action_category` junto con
 * `conversions`; Google devuelve una fila por acción y campaña.
 */

export type ConversionBucket =
  /** Resultado de negocio: cuenta como "resultado". */
  | "negocio"
  /** Etapa intermedia. Nunca se suma con las compras. */
  | "secundaria"
  /** Tráfico. No es una conversión de negocio. */
  | "trafico"
  /** La cuenta no clasificó la acción: no se puede afirmar qué es. */
  | "sin_clasificar";

const CATEGORIES: Record<string, ConversionBucket> = {
  PURCHASE: "negocio",
  SUBSCRIBE_PAID: "negocio",
  SUBMIT_LEAD_FORM: "negocio",
  SIGNUP: "negocio",
  PHONE_CALL_LEAD: "negocio",
  CONTACT: "negocio",

  ADD_TO_CART: "secundaria",
  BEGIN_CHECKOUT: "secundaria",

  OUTBOUND_CLICK: "trafico",
  PAGE_VIEW: "trafico",

  DEFAULT: "sin_clasificar",
  UNKNOWN: "sin_clasificar",
};

export function bucketFor(category: string | null): ConversionBucket {
  if (!category) return "sin_clasificar";
  return CATEGORIES[category.toUpperCase()] ?? "sin_clasificar";
}

export type ConversionBreakdown = {
  /** Lo que sí es un resultado de negocio. */
  negocio: number;
  secundaria: number;
  trafico: number;
  sinClasificar: number;
  /** Categorías presentes, para poder explicar de dónde sale el número. */
  categorias: Array<{ category: string; bucket: ConversionBucket; value: number }>;
};

export function emptyBreakdown(): ConversionBreakdown {
  return {
    negocio: 0,
    secundaria: 0,
    trafico: 0,
    sinClasificar: 0,
    categorias: [],
  };
}

export function addToBreakdown(
  breakdown: ConversionBreakdown,
  category: string | null,
  value: number,
): void {
  const bucket = bucketFor(category);
  if (bucket === "negocio") breakdown.negocio += value;
  else if (bucket === "secundaria") breakdown.secundaria += value;
  else if (bucket === "trafico") breakdown.trafico += value;
  else breakdown.sinClasificar += value;

  const nombre = (category ?? "SIN CATEGORÍA").toUpperCase();
  const existente = breakdown.categorias.find((c) => c.category === nombre);
  if (existente) existente.value += value;
  else breakdown.categorias.push({ category: nombre, bucket, value });
}

export const BUCKET_LABELS: Record<ConversionBucket, string> = {
  negocio: "Resultado de negocio",
  secundaria: "Etapa intermedia",
  trafico: "Tráfico, no conversión",
  sin_clasificar: "Sin clasificar en la cuenta",
};

/**
 * Categorías de Google que corresponden a cada objetivo de negocio.
 *
 * Tomado de las reglas maestras de MetriQ. El CPL, CPA y CPP se recalculan solo
 * con las conversiones de su categoría, nunca con el total.
 */
const CATEGORIES_BY_OBJECTIVE: Record<string, string[]> = {
  VTA: ["PURCHASE", "SUBSCRIBE_PAID"],
  LDS: ["SUBMIT_LEAD_FORM", "SIGNUP"],
  OCV: ["PHONE_CALL_LEAD", "CONTACT"],
  // Tráfico y awareness no cuentan conversiones: su resultado es la entrega.
  TRF: [],
  AE: [],
};

/**
 * Conversiones de Google que corresponden a un objetivo.
 *
 * `null` cuando ese objetivo no se mide con conversiones, para distinguirlo de
 * "midió cero".
 */
export function valorPorObjetivo(
  breakdown: ConversionBreakdown | null,
  objetivo: string,
): number | null {
  const categorias = CATEGORIES_BY_OBJECTIVE[objetivo];
  if (!breakdown || !categorias || categorias.length === 0) return null;
  const total = breakdown.categorias
    .filter((c) => categorias.includes(c.category))
    .reduce((sum, c) => sum + c.value, 0);
  return Math.round(total * 100) / 100;
}
