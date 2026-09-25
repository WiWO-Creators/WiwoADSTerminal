import { valorPorObjetivo } from "./conversiones";
import type { CampaignSummary, CurrencyTotal } from "./performance-store";

/**
 * Taxonomía de objetivos de campaña (siglas de MetriQ).
 *
 * MetriQ clasifica las campañas por una **sigla al inicio del nombre**, no por
 * el campo de objetivo de cada plataforma. La razón: ese campo se llama y se
 * valora distinto en Meta, Google y TikTok, y para Performance Max ni siquiera
 * existe. La sigla es uniforme y la controla el analista.
 *
 * Formato: `[SIGLA] Cliente · Plataforma · Detalle`
 *
 * Regla de MetriQ que conviene recordar: **la sigla se asigna por el objetivo
 * real de negocio, no por el objetivo técnico de la plataforma**. Una campaña
 * con objetivo técnico de tráfico cuyo fin es ganar seguidores se nombra `[AE]`.
 */

export const OBJETIVOS = ["AE", "VTA", "LDS", "TRF", "OCV"] as const;
export type Objetivo = (typeof OBJETIVOS)[number];

export const OBJETIVO_LABELS: Record<Objetivo, string> = {
  AE: "Awareness y engagement",
  VTA: "Ventas",
  LDS: "Leads",
  TRF: "Tráfico",
  OCV: "Otras conversiones",
};

export const OBJETIVO_CORTO: Record<Objetivo, string> = {
  AE: "Awareness",
  VTA: "Ventas",
  LDS: "Leads",
  TRF: "Tráfico",
  OCV: "Conversiones",
};

/**
 * Objetivo de una campaña a partir de su nombre.
 *
 * `null` significa que la campaña no sigue la convención. No se adivina: una
 * campaña mal clasificada entra en el reporte equivocado, y es preferible
 * marcarla para renombrar que ubicarla a ciegas.
 */
export function objetivoDeNombre(nombre: string): Objetivo | null {
  const match = /^\s*\[\s*(AE|VTA|LDS|TRF|OCV)\s*\]/i.exec(nombre);
  return match ? (match[1].toUpperCase() as Objetivo) : null;
}

/**
 * Respaldo: deducir el objetivo del campo de la plataforma.
 *
 * Solo se usa cuando la campaña todavía no lleva sigla. MetriQ lo llama "red
 * de seguridad": sirve para no perder la campaña, pero lo correcto es
 * renombrarla.
 */
export function objetivoDePlataforma(
  provider: string,
  objetivoNativo: string | null,
): Objetivo | null {
  const valor = (objetivoNativo ?? "").toUpperCase();
  if (!valor) return null;

  if (provider === "meta") {
    if (/AWARENESS|REACH|ENGAGEMENT|PAGE_LIKES|VIDEO_VIEWS|EVENT_RESPONSES/.test(valor)) {
      return "AE";
    }
    if (/TRAFFIC|LINK_CLICKS/.test(valor)) return "TRF";
    if (/LEAD/.test(valor)) return "LDS";
    if (/SALES|CONVERSIONS|CATALOG/.test(valor)) return "VTA";
    if (/MESSAGES/.test(valor)) return "OCV";
    return null;
  }

  if (provider === "google") {
    // Solo se deduce awareness, y solo desde los canales visuales.
    //
    // SEARCH NO implica tráfico: una campaña de búsqueda puede ser de leads,
    // de ventas o de tráfico, y el canal no lo distingue. Deducirlo clasificaba
    // mal campañas evidentes — "Conversiones SEM Empresas" aparecía como
    // tráfico. MetriQ lo advierte: para ventas, leads y otras conversiones hay
    // que mirar la categoría de la acción de conversión, no el canal. Sin sigla
    // se deja sin clasificar, que es lo honesto.
    if (/DISPLAY|DEMAND_GEN|VIDEO/.test(valor)) return "AE";
    return null;
  }

  return null;
}

/** Nombre de campaña con la convención de MetriQ. */
export function nombreDeCampana(
  objetivo: Objetivo,
  cliente: string,
  plataforma: string,
  detalle: string,
): string {
  const partes = [cliente.trim(), plataforma.trim(), detalle.trim()].filter(
    Boolean,
  );
  return `[${objetivo}] ${partes.join(" · ")}`;
}

/**
 * Qué métrica es "el resultado" para cada objetivo.
 *
 * No existe un resultado único: en awareness es la interacción, en leads el
 * formulario, en ventas la compra. Reportar una sola cifra para todos mezcla
 * cosas que no se comparan.
 */
export const RESULTADO_POR_OBJETIVO: Record<Objetivo, string> = {
  AE: "Interacciones",
  VTA: "Compras",
  LDS: "Leads",
  TRF: "Clics al enlace",
  OCV: "Conversaciones y llamadas",
};

/**
 * Totales de una familia de objetivo.
 *
 * Cada objetivo se mide con su propia métrica: en awareness la interacción, en
 * leads el formulario, en ventas la compra. Reportar una sola cifra de
 * "resultados" para todos mezcla cosas que no se comparan entre sí.
 */
export type ObjectiveTotal = {
  objetivo: Objetivo;
  label: string;
  resultLabel: string;
  campaigns: number;
  currencyTotals: CurrencyTotal[];
  impressions: number;
  clicks: number;
  /** La métrica propia del objetivo. null: no se mide con conversiones. */
  result: number | null;
};

/** La métrica que Meta usa como resultado en cada familia. */
function metaResult(
  campaign: CampaignSummary,
  objetivo: Objetivo,
): number | null {
  if (objetivo === "AE") return campaign.engagement;
  if (objetivo === "TRF") return campaign.linkClicks;
  if (objetivo === "LDS") return campaign.leads;
  if (objetivo === "VTA") return campaign.purchases;
  // Otras conversiones: Meta las reporta como conversaciones iniciadas, un
  // campo que solo viene en el corte diario, no en el de campaña.
  return null;
}

/**
 * Agrupa las campañas por objetivo y calcula el resultado propio de cada uno.
 *
 * Meta reporta la métrica directamente; Google la obtiene de las categorías de
 * conversión que corresponden a ese objetivo. Las campañas sin sigla quedan
 * fuera: clasificarlas a ciegas las pondría en la familia equivocada.
 *
 * Vive acá, no en `lib/performance-store.ts`, a propósito: es pura (nada de
 * `fetch` ni de D1), así que también la llaman componentes de cliente para
 * desglosar el resumen de un solo cliente — importarla desde
 * `performance-store.ts` arrastraría `cloudflare:workers` al bundle del
 * navegador y rompería la build ahí.
 */
export function summarizeObjectives(campaigns: CampaignSummary[]): ObjectiveTotal[] {
  const grupos = new Map<Objetivo, CampaignSummary[]>();
  for (const campaign of campaigns) {
    if (!campaign.objetivo) continue;
    // Las campañas que existen pero no entregaron en el rango quedan fuera de
    // este resumen: es el resumen del periodo. Contarlas diría "12 campañas de
    // ventas" cuando solo dos estuvieron al aire. En la tabla sí aparecen.
    if (!campaign.conActividad) continue;
    grupos.set(campaign.objetivo, [
      ...(grupos.get(campaign.objetivo) ?? []),
      campaign,
    ]);
  }

  return [...grupos.entries()]
    .map(([objetivo, items]) => {
      const totals = new Map<string, CurrencyTotal>();
      for (const item of items) {
        const currency = item.currency ?? "N/D";
        const actual = totals.get(currency) ?? {
          currency,
          spendMicros: 0,
          conversionValueMicros: null,
        };
        actual.spendMicros += item.spendMicros;
        totals.set(currency, actual);
      }

      let result: number | null = null;
      for (const item of items) {
        const valor =
          item.provider === "google"
            ? valorPorObjetivo(item.conversionBreakdown, objetivo)
            : metaResult(item, objetivo);
        if (valor === null) continue;
        result = (result ?? 0) + valor;
      }

      return {
        objetivo,
        label: OBJETIVO_LABELS[objetivo],
        resultLabel: RESULTADO_POR_OBJETIVO[objetivo],
        campaigns: items.length,
        currencyTotals: [...totals.values()].sort((a, b) =>
          a.currency.localeCompare(b.currency),
        ),
        impressions: items.reduce((sum, i) => sum + i.impressions, 0),
        clicks: items.reduce((sum, i) => sum + i.clicks, 0),
        result: result === null ? null : Math.round(result * 100) / 100,
      };
    })
    .sort((a, b) => b.campaigns - a.campaigns);
}
