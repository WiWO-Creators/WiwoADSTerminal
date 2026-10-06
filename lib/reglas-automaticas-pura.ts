/**
 * Reglas automáticas, como las de Meta o Google: «si [métrica] [supera / baja de] [umbral] en [periodo], [acción]».
 * Parte pura: sin red ni base de datos, para poder probarla.
 */
export const METRICAS_DE_REGLA = ["gasto", "cpc", "ctr", "frecuencia", "cpl", "cpa"] as const;
export type MetricaDeRegla = (typeof METRICAS_DE_REGLA)[number];
export const OPERADORES_DE_REGLA = [">=", "<="] as const;
export type OperadorDeRegla = (typeof OPERADORES_DE_REGLA)[number];
import { rangoPersonalizado, type RangoId } from "@/lib/rangos";

export const PERIODOS_DE_REGLA = ["hoy", "ultimos_7", "mes_actual", "total"] as const;
export type PeriodoDeRegla = (typeof PERIODOS_DE_REGLA)[number];
export const ACCIONES_DE_REGLA = ["pausar", "avisar", "bajar_presupuesto"] as const;
export type AccionDeRegla = (typeof ACCIONES_DE_REGLA)[number];
export const NIVELES_DE_REGLA = ["campana", "conjunto", "anuncio"] as const;
export type NivelDeRegla = (typeof NIVELES_DE_REGLA)[number];

export const ETIQUETA_METRICA: Record<MetricaDeRegla, string> = {
  gasto: "Gasto",
  cpc: "Costo por clic",
  ctr: "CTR (%)",
  frecuencia: "Frecuencia",
  cpl: "Costo por lead",
  cpa: "Costo por conversión",
};
export const ETIQUETA_PERIODO: Record<PeriodoDeRegla, string> = {
  hoy: "hoy",
  ultimos_7: "los últimos 7 días",
  mes_actual: "este mes",
  total: "en total (desde que empezó, hasta 180 días)",
};

/** Rango de datos con el que se evalúa una regla. «Total» mira los últimos 180 días: un anuncio nuevo no tiene más historia. */
export function rangoDeRegla(periodo: PeriodoDeRegla, ahora: Date): RangoId {
  if (periodo !== "total") return periodo;
  const desde = new Date(ahora.getTime() - 179 * 86400000).toISOString().slice(0, 10);
  return rangoPersonalizado(desde, ahora.toISOString().slice(0, 10));
}

export type Totales = { spendMicros: number; impressions: number; clicks: number; reach: number | null; leads: number | null; conversions: number | null };

/** Suma varias filas (anuncios) en los totales de su campaña o conjunto. El alcance no se suma: se toma el máximo. */
export function sumar(filas: Totales[]): Totales {
  const t: Totales = { spendMicros: 0, impressions: 0, clicks: 0, reach: null, leads: null, conversions: null };
  for (const f of filas) {
    t.spendMicros += f.spendMicros;
    t.impressions += f.impressions;
    t.clicks += f.clicks;
    if (f.reach !== null) t.reach = Math.max(t.reach ?? 0, f.reach);
    if (f.leads !== null) t.leads = (t.leads ?? 0) + f.leads;
    if (f.conversions !== null) t.conversions = (t.conversions ?? 0) + f.conversions;
  }
  return t;
}

/** Valor de la métrica en unidades de la moneda (gasto, costos) o la propia (CTR %, frecuencia). `null` si no se puede calcular. */
export function valorDeMetrica(m: MetricaDeRegla, t: Totales): number | null {
  const gasto = t.spendMicros / 1_000_000;
  switch (m) {
    case "gasto":
      return gasto;
    case "cpc":
      return t.clicks > 0 ? gasto / t.clicks : null;
    case "ctr":
      return t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null;
    case "frecuencia":
      return t.reach && t.reach > 0 ? t.impressions / t.reach : null;
    case "cpl":
      return t.leads && t.leads > 0 ? gasto / t.leads : null;
    case "cpa":
      return t.conversions && t.conversions > 0 ? gasto / t.conversions : null;
  }
}

/** Una métrica de costo sin resultados todavía no dispara una regla de «máximo» (no hay costo que medir). */
export function cumpleRegla(regla: { metrica: MetricaDeRegla; operador: OperadorDeRegla; umbral: number }, t: Totales): { cumple: boolean; valor: number | null } {
  const valor = valorDeMetrica(regla.metrica, t);
  if (valor === null) return { cumple: false, valor: null };
  return { cumple: regla.operador === ">=" ? valor >= regla.umbral : valor <= regla.umbral, valor };
}

/**
 * Clave del periodo en el que una regla ya disparada no vuelve a dispararse: «hoy» se rearma mañana, «este mes» el mes
 * siguiente; los demás no se rearman solos (se rearman a mano).
 */
export function claveDePeriodo(periodo: PeriodoDeRegla, ahora: Date): string {
  const iso = ahora.toISOString();
  if (periodo === "hoy") return iso.slice(0, 10);
  if (periodo === "mes_actual") return iso.slice(0, 7);
  return "unica";
}

/** Presupuesto que queda al bajarlo `porcentaje` %, en unidades enteras de la moneda y nunca menos de 1. */
export function presupuestoReducido(actual: number, porcentaje: number): number {
  return Math.max(1, Math.round(actual * (1 - porcentaje / 100)));
}

/** Por qué una acción no sirve para este nivel o valor; `null` si sirve. */
export function problemaDeAccion(accion: AccionDeRegla, nivel: NivelDeRegla, valor: number | null | undefined): string | null {
  if (accion !== "bajar_presupuesto") return null;
  if (nivel === "anuncio") return "Un anuncio no tiene presupuesto propio: baja el de su conjunto o su campaña.";
  if (valor == null || !(valor >= 1 && valor <= 90)) return "El porcentaje a bajar debe estar entre 1 y 90.";
  return null;
}

export function textoDeRegla(r: { metrica: MetricaDeRegla; operador: OperadorDeRegla; umbral: number; periodo: PeriodoDeRegla; accion: AccionDeRegla; moneda?: string | null; accionValor?: number | null }): string {
  const unidad = r.metrica === "ctr" ? " %" : r.metrica === "frecuencia" ? "" : r.moneda ? ` ${r.moneda}` : "";
  return `Si ${ETIQUETA_METRICA[r.metrica].toLowerCase()} ${r.operador === ">=" ? "llega a o supera" : "baja de"} ${r.umbral}${unidad} ${ETIQUETA_PERIODO[r.periodo]}: ${r.accion === "pausar" ? "pausar" : r.accion === "bajar_presupuesto" ? `bajar el presupuesto ${r.accionValor ?? ""} %` : "avisar"}`;
}
