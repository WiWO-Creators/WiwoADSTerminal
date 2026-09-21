/**
 * Lectura del id que deja una acción de creación de Windsor. Vive aparte de
 * `windsor.ts` para poder probarse sola: ese módulo depende del runtime de
 * Cloudflare.
 */

/**
 * Busca el identificador que dejó una acción de creación.
 *
 * Windsor no documenta una forma única de respuesta por acción, así que se
 * recorren las claves que las APIs de Google y Meta usan, en orden, y se
 * devuelve la primera que traiga algo. Si ninguna aparece, devuelve null y el
 * ejecutor se detiene en vez de encadenar un paso con un id inventado.
 */
export function idDeResultado(raw: unknown, claves: string[]): string | null {
  const visitar = (valor: unknown, profundidad: number): string | null => {
    if (profundidad > 4 || !valor || typeof valor !== "object") return null;
    const objeto = valor as Record<string, unknown>;
    for (const clave of claves) {
      const encontrado = objeto[clave];
      if (typeof encontrado === "string" && encontrado.trim()) return encontrado;
      if (typeof encontrado === "number") return String(encontrado);
    }
    for (const anidado of Object.values(objeto)) {
      const encontrado = visitar(anidado, profundidad + 1);
      if (encontrado) return encontrado;
    }
    return null;
  };
  const porCampo = visitar(raw, 0);
  if (porCampo) return porCampo;
  // Verificado con una ejecución real: a diferencia de Meta, `create_campaign`
  // de Google Ads no siempre trae el id en un campo estructurado — a veces
  // viene solo dentro de un texto libre, p.ej. `"result": "Search campaign
  // '...' (id 24257873743) created successfully..."`. Se busca como último
  // recurso, nunca antes que un campo estructurado real.
  return idDentroDeTexto(raw, 0);
}

/**
 * Formas en que las acciones de Windsor dicen el id de lo que acaban de crear
 * dentro de un texto libre, todas vistas en ejecuciones reales:
 *
 *   Google campaña:  "Search campaign '…' (id 24271920233) created…"
 *   Google grupo:    "Ad group '…' (id 200046612869, type SEARCH_STANDARD) created…"
 *   Meta campaña:    "Campaign created successfully with id 52528989290637. Use…"
 *
 * El orden importa: se prueba primero la forma entre paréntesis, que es la
 * que nombra el objeto recién creado, y solo después "with id"/"id N". Un
 * texto como "created in campaign 24271920233" no coincide con ninguna —el
 * id de la campaña padre no se confunde con el del grupo—.
 */
const PATRONES_DE_ID_EN_TEXTO = [
  /\(id[:\s]+(\d+)/i,
  /\bwith id[:\s]+(\d+)/i,
  /\b(?:video|adset|ad set|campaign|ad)[_ ]id[:\s=]+(\d+)/i,
  /\bid[:\s=]+(\d{6,})/i,
];

export function idEnTextoLibre(texto: string): string | null {
  for (const patron of PATRONES_DE_ID_EN_TEXTO) {
    const coincidencia = texto.match(patron);
    if (coincidencia) return coincidencia[1];
  }
  return null;
}

function idDentroDeTexto(valor: unknown, profundidad: number): string | null {
  if (profundidad > 4 || valor === null || valor === undefined) return null;
  if (typeof valor === "string") return idEnTextoLibre(valor);
  if (typeof valor !== "object") return null;
  for (const anidado of Object.values(valor as Record<string, unknown>)) {
    const encontrado = idDentroDeTexto(anidado, profundidad + 1);
    if (encontrado) return encontrado;
  }
  return null;
}
