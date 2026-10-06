/**
 * Propiedades de Google Analytics 4 de un cliente. Algunos clientes tienen varias (ALO: 8, SQM: 6, Valor: 2 o más),
 * así que la ficha guarda una lista escrita con comas («307451372, 430828037») en el mismo campo de siempre:
 * los clientes con una sola propiedad no cambian. Puro (sin red ni base de datos).
 */

const ID_GA4 = /^\d{5,15}$/;
export const MAXIMO_PROPIEDADES_GA4 = 12;

/** Los ids de una lista escrita a mano (separados por coma, punto y coma, espacio o salto de línea), sin repetidos. */
export function propiedadesDeGa4(valor: string | null | undefined): string[] {
  if (!valor) return [];
  return [...new Set(valor.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
}

/** Un mensaje si la lista no es válida; `null` si está bien (o vacía). */
export function problemaDeGa4(valor: string | null | undefined): string | null {
  const ids = propiedadesDeGa4(valor);
  if (ids.length > MAXIMO_PROPIEDADES_GA4) return `Máximo ${MAXIMO_PROPIEDADES_GA4} propiedades de GA4 por cliente.`;
  const malo = ids.find((id) => !ID_GA4.test(id));
  return malo
    ? `«${malo}» no es un ID de propiedad de GA4: son solo dígitos (por ejemplo 307451372). Para varias, sepáralas con comas.`
    : null;
}

/** Lo que se guarda: ids limpios, sin repetidos, separados por coma; `null` si no hay ninguno. */
export function guardarPropiedadesGa4(valor: string | null | undefined): string | null {
  const ids = propiedadesDeGa4(valor);
  return ids.length > 0 ? ids.join(",") : null;
}
