/**
 * Google Tag Manager por cliente. Puro (sin red ni base de datos).
 *
 * `null` = sin verificar: no se afirma que falte GTM si nadie lo confirmó.
 * Solo un cliente marcado `no_tiene` genera la alerta "NO cuenta con GTM".
 */
export const GTM_ESTADOS = ["tiene", "no_tiene"] as const;
export type GtmEstado = (typeof GTM_ESTADOS)[number];

export function esGtmEstado(valor: unknown): valor is GtmEstado {
  return typeof valor === "string" && (GTM_ESTADOS as readonly string[]).includes(valor);
}

const FORMATO_CONTENEDOR = /^GTM-[A-Z0-9]{4,10}$/;

/** Devuelve el ID normalizado (mayúsculas) o `null` si no tiene el formato de un contenedor. */
export function normalizarContenedor(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "").trim().toUpperCase();
  return FORMATO_CONTENEDOR.test(limpio) ? limpio : null;
}

export const TEXTO_SIN_GTM = "NO cuenta con GTM";
