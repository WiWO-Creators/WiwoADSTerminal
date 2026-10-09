import { OBJETIVO_LABELS, RESULTADO_POR_OBJETIVO, resultadoDeCampana, type Objetivo } from "./objetivos";
import type { AdSummary, CampaignSummary } from "./performance-store";

/**
 * Lo mejor y lo que peor va de un cliente: las 3 mejores y las 3 peores campañas, y lo mismo con los anuncios, cada una con su porqué.
 * Para que sirva a quien decide qué replicar o qué cortar.
 *
 * Cómo se compara (siempre contra pares, nunca a ciegas): una campaña de Awareness no se mide como una de Ventas. Cada pieza se
 * compara con la MEDIANA de las de su mismo objetivo, moneda y plataforma:
 *  - si el objetivo trae resultados medidos (interacciones, leads, compras…), por costo por resultado;
 *  - si no los trae en la lectura, por CTR, y el porqué lo dice.
 * Solo entra lo que tuvo inversión y al menos 1.000 impresiones (menos es ruido), y los grupos de una sola pieza no tienen con quién
 * compararse. Puro: no lee nada, solo calcula con lo que recibe.
 */

export const MIN_IMPRESIONES = 1000;
/** Qué tan por encima o por debajo de la mediana tiene que estar para contarse como mejor o peor. */
const UMBRAL_MEJOR = 1.15;
const UMBRAL_PEOR = 0.85;
const CUANTOS = 3;

export type EntradaDeRanking = {
  tipo: "campana" | "anuncio";
  id: string;
  nombre: string;
  /** Anuncios: la campaña a la que pertenecen. */
  campana: string | null;
  cuenta: string;
  provider: string;
  objetivo: Objetivo | null;
  moneda: string | null;
  /** El objetivo que declara la plataforma (`OUTCOME_ENGAGEMENT`, `OUTCOME_AWARENESS`…): dentro de una misma sigla no se mezclan tipos de campaña distintos. */
  familia: string | null;
  gasto: number;
  impresiones: number;
  clics: number;
  /** `null`: el resultado de este objetivo no viene en la lectura (distinto de 0, que sí se midió y fue cero). */
  resultado: number | null;
  miniatura: string | null;
  boton: string | null;
  /** Rankings de diagnóstico de Meta, para reforzar el porqué. */
  calidad: string | null;
  interaccion: string | null;
  conversion: string | null;
};

export type ItemDeRanking = EntradaDeRanking & {
  ctr: number | null;
  costo: number | null;
  metrica: "costo" | "ctr";
  /** Contra la mediana de sus pares: mayor que 1 es mejor, menor que 1 es peor. */
  puntaje: number;
  porQue: string;
};

export type TopDeCliente = { mejores: ItemDeRanking[]; peores: ItemDeRanking[] };

/* -------------------------------------------------------------------------- */
/* Adaptadores                                                                 */
/* -------------------------------------------------------------------------- */

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function entradasDeCampanas(campanas: CampaignSummary[], nombreDeCuenta: (id: string, porDefecto: string) => string): EntradaDeRanking[] {
  return campanas
    .filter((c) => c.conActividad && c.campaignId)
    .map((c) => ({
      tipo: "campana" as const,
      id: String(c.campaignId),
      nombre: c.name,
      campana: null,
      cuenta: nombreDeCuenta(c.accountKey, c.accountName),
      provider: c.provider,
      objetivo: c.objetivo,
      moneda: c.currency,
      familia: c.nativeObjective,
      gasto: c.spendMicros / 1_000_000,
      impresiones: c.impressions,
      clics: c.clicks,
      resultado: c.objetivo ? resultadoDeCampana(c, c.objetivo) : null,
      miniatura: null,
      boton: null,
      calidad: null,
      interaccion: null,
      conversion: null,
    }));
}

function resultadoDeAnuncio(a: AdSummary, objetivo: Objetivo): number | null {
  if (a.provider === "google") return num(a.conversions);
  if (objetivo === "AE") return num(a.engagement);
  if (objetivo === "TRF") return num(a.linkClicks);
  if (objetivo === "LDS") return num(a.leads);
  if (objetivo === "VTA") return num(a.purchases);
  return null;
}

export function entradasDeAnuncios(
  anuncios: AdSummary[],
  nombreDeCuenta: (id: string, porDefecto: string) => string,
  /** Las campañas del cliente, para saber de qué tipo es la de cada anuncio. */
  campanas: CampaignSummary[] = [],
): EntradaDeRanking[] {
  const familiaDe = new Map<string, string | null>();
  for (const c of campanas) {
    if (c.campaignId) familiaDe.set(`id:${c.campaignId}`, c.nativeObjective);
    familiaDe.set(`n:${c.accountKey}|${c.name}`, c.nativeObjective);
  }
  return anuncios
    .filter((a) => a.adId)
    .map((a) => ({
      tipo: "anuncio" as const,
      id: String(a.adId),
      nombre: a.adName?.split("|")[0]?.trim() || String(a.adId),
      campana: a.campaignName,
      cuenta: nombreDeCuenta(a.accountKey, a.accountName),
      provider: a.provider,
      objetivo: a.objetivo,
      moneda: a.currency,
      familia: (a.campaignId ? familiaDe.get(`id:${a.campaignId}`) : undefined) ?? familiaDe.get(`n:${a.accountKey}|${a.campaignName}`) ?? null,
      gasto: a.spendMicros / 1_000_000,
      impresiones: a.impressions,
      clics: a.clicks,
      resultado: a.objetivo ? resultadoDeAnuncio(a, a.objetivo) : null,
      miniatura: a.thumbnailUrl ?? null,
      boton: a.callToAction ?? null,
      calidad: a.qualityRanking,
      interaccion: a.engagementRateRanking,
      conversion: a.conversionRateRanking,
    }));
}

/* -------------------------------------------------------------------------- */
/* Formato                                                                     */
/* -------------------------------------------------------------------------- */

export function dinero(valor: number, moneda: string | null): string {
  // Un costo por interacción suele ser de centavos: con dos decimales todos se verían «0,00».
  const decimales = Math.abs(valor) < 0.1 ? 3 : Math.abs(valor) < 10 ? 2 : 0;
  try {
    return valor.toLocaleString("es-CL", { style: "currency", currency: moneda ?? "USD", minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  } catch {
    return `${valor.toLocaleString("es-CL", { maximumFractionDigits: decimales })} ${moneda ?? ""}`.trim();
  }
}

/** Cómo se llama UN resultado de cada objetivo, para «cada interacción le cuesta…». */
const RESULTADO_EN_SINGULAR: Record<Objetivo, string> = { AE: "interacción", VTA: "compra", LDS: "lead", TRF: "clic al enlace", OCV: "conversación" };

const entero = (v: number) => Math.round(v).toLocaleString("es-CL");
const dec = (v: number) => v.toLocaleString("es-CL", { maximumFractionDigits: 1 });

function mediana(valores: number[]): number {
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const calificacion = (valor: string | null, sentido: "arriba" | "abajo"): boolean =>
  valor !== null && (sentido === "arriba" ? valor.startsWith("ABOVE") : valor.startsWith("BELOW"));

/** Lo que Meta dice de su calidad, solo cuando refuerza la conclusión (arriba para los mejores, abajo para los peores). */
function refuerzoDeMeta(e: EntradaDeRanking, sentido: "arriba" | "abajo"): string {
  const partes = [
    calificacion(e.calidad, sentido) ? "calidad" : null,
    calificacion(e.interaccion, sentido) ? "interacción" : null,
    calificacion(e.conversion, sentido) ? "conversión" : null,
  ].filter((p): p is string => p !== null);
  if (partes.length === 0) return "";
  return ` Meta lo califica ${sentido === "arriba" ? "por encima" : "por debajo"} del promedio en ${partes.join(" y ")}.`;
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                     */
/* -------------------------------------------------------------------------- */

type Grupo = { clave: string; objetivo: Objetivo; items: EntradaDeRanking[] };

function enGrupos(entradas: EntradaDeRanking[]): Grupo[] {
  const por = new Map<string, Grupo>();
  for (const e of entradas) {
    if (!e.objetivo || e.gasto <= 0 || e.impresiones < MIN_IMPRESIONES) continue;
    const clave = `${e.objetivo}|${e.moneda ?? ""}|${e.provider}|${e.familia ?? ""}`;
    const g = por.get(clave) ?? { clave, objetivo: e.objetivo, items: [] };
    g.items.push(e);
    por.set(clave, g);
  }
  return [...por.values()].filter((g) => g.items.length >= 2);
}

function puntuarGrupo(g: Grupo): ItemDeRanking[] {
  const objetivo = OBJETIVO_LABELS[g.objetivo];
  const resultadoNombre = RESULTADO_POR_OBJETIVO[g.objetivo].toLowerCase();
  const gastoDelGrupo = g.items.reduce((s, i) => s + i.gasto, 0);
  const conCtr = g.items.map((i) => ({ ...i, ctr: i.impresiones > 0 ? (i.clics / i.impresiones) * 100 : null }));
  const positivos = conCtr.filter((i) => (i.resultado ?? 0) > 0);
  const salida: ItemDeRanking[] = [];

  if (positivos.length >= 2) {
    const costos = positivos.map((i) => i.gasto / (i.resultado as number));
    const med = mediana(costos);
    const ctrMed = mediana(conCtr.map((i) => i.ctr ?? 0));
    for (const i of conCtr) {
      if (i.resultado === null) continue;
      if (i.resultado === 0) {
        salida.push({
          ...i,
          costo: null,
          metrica: "costo",
          puntaje: 0,
          porQue: `Gastó ${dinero(i.gasto, i.moneda)} (${dec((i.gasto / gastoDelGrupo) * 100)} % de lo invertido en ${objetivo}) y no logró ningún resultado (${resultadoNombre}) en ${entero(i.impresiones)} impresiones.${refuerzoDeMeta(i, "abajo")}`,
        });
        continue;
      }
      const costo = i.gasto / i.resultado;
      const puntaje = med / costo;
      const comparado = puntaje >= 1
        ? `${dec((1 - costo / med) * 100)} % menos que la mediana de sus pares de ${objetivo} (${dinero(med, i.moneda)})`
        : `${dec(costo / med)}× la mediana de sus pares de ${objetivo} (${dinero(med, i.moneda)})`;
      const ctrFrase = i.ctr !== null && ctrMed > 0 ? ` Su CTR es ${dec(i.ctr)} % (mediana ${dec(ctrMed)} %).` : "";
      salida.push({
        ...i,
        costo,
        metrica: "costo",
        puntaje,
        porQue: `Cada ${RESULTADO_EN_SINGULAR[g.objetivo]} le cuesta ${dinero(costo, i.moneda)}: ${comparado}.${ctrFrase} Con ${dinero(i.gasto, i.moneda)} logró ${entero(i.resultado)}.${refuerzoDeMeta(i, puntaje >= 1 ? "arriba" : "abajo")}`,
      });
    }
    return salida;
  }

  // El resultado de este objetivo no viene medido (o solo hay una pieza con resultados): se compara por CTR.
  const ctrs = conCtr.filter((i) => i.ctr !== null).map((i) => i.ctr as number);
  const med = ctrs.length >= 2 ? mediana(ctrs) : 0;
  if (med <= 0) return [];
  for (const i of conCtr) {
    if (i.ctr === null) continue;
    const puntaje = i.ctr / med;
    salida.push({
      ...i,
      costo: null,
      metrica: "ctr",
      puntaje,
      porQue: `Su CTR es ${dec(i.ctr)} %, ${puntaje >= 1 ? `${dec(puntaje)}× la mediana` : `solo ${dec(puntaje * 100)} % de la mediana`} de sus pares de ${objetivo} (${dec(med)} %). El resultado de este objetivo no viene medido en esta lectura, por eso se compara por CTR. Invirtió ${dinero(i.gasto, i.moneda)} en ${entero(i.impresiones)} impresiones.${refuerzoDeMeta(i, puntaje >= 1 ? "arriba" : "abajo")}`,
    });
  }
  return salida;
}

export function rankear(entradas: EntradaDeRanking[], cuantos = CUANTOS): TopDeCliente {
  const puntuadas = enGrupos(entradas).flatMap(puntuarGrupo);
  const mejores = puntuadas
    .filter((i) => i.puntaje >= UMBRAL_MEJOR)
    .sort((a, b) => b.puntaje - a.puntaje || b.gasto - a.gasto)
    .slice(0, cuantos);
  const peores = puntuadas
    .filter((i) => i.puntaje <= UMBRAL_PEOR)
    .sort((a, b) => a.puntaje - b.puntaje || b.gasto - a.gasto)
    .slice(0, cuantos);
  return { mejores, peores };
}
