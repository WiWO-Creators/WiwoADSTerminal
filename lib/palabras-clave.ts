/**
 * Sintaxis de palabras clave de Google Ads: `[palabra]` es concordancia exacta,
 * `"palabra"` de frase y cualquier otra cosa es amplia. Es la misma convención
 * del editor de palabras clave de Google, no una inventada acá. La usan el
 * Constructor (positivas y negativas) y la edición de un grupo ya publicado.
 */
export type Concordancia = "BROAD" | "PHRASE" | "EXACT";

export function parsearPalabraClave(linea: string): { text: string; match_type: Concordancia } {
  const limpia = linea.trim();
  if (limpia.startsWith("[") && limpia.endsWith("]")) {
    return { text: limpia.slice(1, -1).trim(), match_type: "EXACT" };
  }
  if (limpia.startsWith('"') && limpia.endsWith('"')) {
    return { text: limpia.slice(1, -1).trim(), match_type: "PHRASE" };
  }
  return { text: limpia, match_type: "BROAD" };
}

/** Lo inverso: cómo se escribe una palabra clave con su concordancia. */
export function formatearPalabraClave(texto: string, concordancia: Concordancia | string | null): string {
  if (concordancia === "EXACT") return `[${texto}]`;
  if (concordancia === "PHRASE") return `"${texto}"`;
  return texto;
}

/** Límites de Google: hasta 80 caracteres y 10 palabras. `null` si es válida. */
export function problemaDePalabraClave(texto: string): string | null {
  if (!texto.trim()) return "Hay una palabra clave vacía.";
  if (texto.length > 80) return `«${texto.slice(0, 30)}…» tiene ${texto.length} caracteres (máximo 80).`;
  if (texto.trim().split(/\s+/).length > 10) return `«${texto.slice(0, 30)}…» tiene más de 10 palabras.`;
  return null;
}
