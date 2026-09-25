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
 *
 * `evitar` son ids de pasos hermanos ya conocidos de este mismo plan (por
 * ejemplo, el id del ad group al extraer el id del anuncio que se acaba de
 * crear en él). Un texto libre de Windsor a veces nombra al padre en la misma
 * frase que anuncia la creación del hijo — confirmado en vivo con Colbún
 * (2026-09-24): la relectura reportó el mismo id como grupo de anuncios Y
 * como anuncio de Google. Sin esto, ese id ajeno se aceptaba como si fuera
 * el propio; con esto, se descarta como los demás candidatos y, si no
 * aparece ningún id genuino, se informa como no reconocible en vez de
 * devolver uno equivocado con total confianza.
 */
export function idDeResultado(
  raw: unknown,
  claves: string[],
  evitar: ReadonlySet<string> = new Set(),
): string | null {
  const visitar = (valor: unknown, profundidad: number): string | null => {
    if (profundidad > 4 || !valor || typeof valor !== "object") return null;
    const objeto = valor as Record<string, unknown>;
    for (const clave of claves) {
      const encontrado = objeto[clave];
      if (typeof encontrado === "string" && encontrado.trim() && !evitar.has(encontrado.trim())) {
        return encontrado.trim();
      }
      if (typeof encontrado === "number" && !evitar.has(String(encontrado))) return String(encontrado);
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
  const porTexto = idDentroDeTexto(raw, 0, evitar);
  return porTexto;
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
  /\(id[:\s]+(\d+)/gi,
  /\bwith id[:\s]+(\d+)/gi,
  /\b(?:video|adset|ad set|campaign|ad)[_ ]id[:\s=]+(\d+)/gi,
  /\bid[:\s=]+(\d{6,})/gi,
];

export function idEnTextoLibre(
  texto: string,
  evitar: ReadonlySet<string> = new Set(),
): string | null {
  for (const patron of PATRONES_DE_ID_EN_TEXTO) {
    // `matchAll` en vez de `match`: si la primera coincidencia de un patrón
    // es justo el id de un hermano ya conocido (el padre nombrado en la
    // misma frase), se prueba la siguiente coincidencia de ese mismo patrón
    // antes de pasar al patrón menos específico.
    for (const coincidencia of texto.matchAll(patron)) {
      if (!evitar.has(coincidencia[1])) return coincidencia[1];
    }
  }
  return null;
}

function idDentroDeTexto(
  valor: unknown,
  profundidad: number,
  evitar: ReadonlySet<string>,
): string | null {
  if (profundidad > 4 || valor === null || valor === undefined) return null;
  if (typeof valor === "string") return idEnTextoLibre(valor, evitar);
  if (typeof valor !== "object") return null;
  for (const anidado of Object.values(valor as Record<string, unknown>)) {
    const encontrado = idDentroDeTexto(anidado, profundidad + 1, evitar);
    if (encontrado) return encontrado;
  }
  return null;
}
