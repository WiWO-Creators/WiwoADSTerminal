/**
 * Monedas en las que Meta no tiene unidad menor: un monto de presupuesto se
 * envía y se lee en pesos enteros, no en centavos.
 *
 * Verificado contra la tabla de monedas y "offsets" de la Marketing API de
 * Meta: para estas, el offset es 1 (el mínimo es una unidad de la moneda);
 * para el resto —USD, MXN, ARS, PEN, UYU, BOB…— es 100. Tratar todas como
 * centavos hacía que un presupuesto de CLP $3.000 saliera como CLP $300.000,
 * y que uno leído de una cuenta en CLP se mostrara 100 veces más chico.
 */
const SIN_UNIDAD_MENOR_EN_META = new Set([
  "CLP",
  "COP",
  "CRC",
  "HUF",
  "IDR",
  "ISK",
  "JPY",
  "KRW",
  "PYG",
  "TWD",
  "VND",
]);

/** Cuántas unidades menores de Meta hay en una unidad de la moneda: 1 o 100. */
export function unidadesMenoresMeta(currency: string | null | undefined): number {
  return currency && SIN_UNIDAD_MENOR_EN_META.has(currency.trim().toUpperCase())
    ? 1
    : 100;
}

/**
 * Formatea un monto en micros como moneda legible — compartida entre
 * `lib/reglas.ts` y `lib/alertas.ts`, que antes tenían cada una su propia
 * copia idéntica sin ningún comentario que justificara duplicarla (a
 * diferencia de los umbrales de esos mismos archivos, que sí documentan por
 * qué se repiten a propósito).
 */
export function moneda(valorMicros: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: currency ?? "CLP",
      maximumFractionDigits: 0,
    }).format(valorMicros / 1_000_000);
  } catch {
    // Un código de moneda que Intl no reconoce no debe tumbar la evaluación.
    return `${(valorMicros / 1_000_000).toLocaleString("es-CL")} ${currency ?? ""}`;
  }
}
