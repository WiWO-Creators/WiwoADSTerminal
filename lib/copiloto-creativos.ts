import Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";

import { MODELO_POR_DEFECTO, mensajeDeError } from "@/lib/asistente";

/**
 * Copiloto de creativos: le pide a Claude títulos y textos para un anuncio
 * nuevo, ya ajustados a los límites reales de cada plataforma.
 *
 * Un solo llamado, sin herramientas ni conversación — la respuesta es un
 * único bloque de datos, forzado por un tool_choice fijo con `strict: true`
 * para que el formato sea exacto (nunca hay que interpretar texto suelto del
 * modelo). Aun así se recortan los campos al volver: un límite "garantizado"
 * por el esquema sigue mereciendo un resguardo de verdad antes de llegar al
 * formulario.
 */

export type EntradaCopiloto = {
  plataforma: "google" | "meta";
  clienteNombre: string;
  objetivoLabel: string;
  nombreCampana: string;
  notaInterna: string;
  landingUrl: string;
  brief: string;
  actual: {
    titulos?: string[];
    descripciones?: string[];
    textoPrincipal?: string;
    titulo?: string;
    descripcion?: string;
  };
};

export type SugerenciaGoogle = { titulos: string[]; descripciones: string[] };
export type SugerenciaMeta = { textoPrincipal: string; titulo: string; descripcion: string };

const LIMITE_GOOGLE_TITULO = 30;
const LIMITE_GOOGLE_DESCRIPCION = 90;
const LIMITE_META_TEXTO = 125;
const LIMITE_META_TITULO = 40;
const LIMITE_META_DESCRIPCION = 30;

const HERRAMIENTA_GOOGLE: Anthropic.Tool = {
  name: "copys_google",
  description: "Entrega los títulos y descripciones para un anuncio de búsqueda de Google Ads.",
  input_schema: {
    type: "object",
    properties: {
      titulos: {
        type: "array",
        description: `Exactamente entre 5 y 8 títulos distintos entre sí (nunca menos de 5 ni más de 8), máximo ${LIMITE_GOOGLE_TITULO} caracteres cada uno.`,
        items: { type: "string", maxLength: LIMITE_GOOGLE_TITULO },
        // El esquema estricto de tool_use no admite `minItems`/`maxItems` en
        // arrays acá — el largo real queda en la descripción de arriba y se
        // recorta y se verifica igual al volver, en `generarCopys`.
      },
      descripciones: {
        type: "array",
        description: `Exactamente entre 2 y 3 descripciones distintas entre sí (nunca menos de 2 ni más de 3), máximo ${LIMITE_GOOGLE_DESCRIPCION} caracteres cada una.`,
        items: { type: "string", maxLength: LIMITE_GOOGLE_DESCRIPCION },
      },
    },
    required: ["titulos", "descripciones"],
    additionalProperties: false,
  },
  strict: true,
};

const HERRAMIENTA_META: Anthropic.Tool = {
  name: "copys_meta",
  description: "Entrega el texto principal, título y descripción para un anuncio de Meta.",
  input_schema: {
    type: "object",
    properties: {
      texto_principal: {
        type: "string",
        description: `El texto que va arriba de la imagen, máximo ${LIMITE_META_TEXTO} caracteres — Meta lo corta ahí en el feed.`,
        maxLength: LIMITE_META_TEXTO,
      },
      titulo: {
        type: "string",
        description: `La línea en negrita bajo la imagen, máximo ${LIMITE_META_TITULO} caracteres.`,
        maxLength: LIMITE_META_TITULO,
      },
      descripcion: {
        type: "string",
        description: `La línea chica bajo el título, máximo ${LIMITE_META_DESCRIPCION} caracteres.`,
        maxLength: LIMITE_META_DESCRIPCION,
      },
    },
    required: ["texto_principal", "titulo", "descripcion"],
    additionalProperties: false,
  },
  strict: true,
};

function prompt(entrada: EntradaCopiloto): string {
  const partes = [
    `Cliente: ${entrada.clienteNombre || "no indicado"}.`,
    `Objetivo de la campaña: ${entrada.objetivoLabel}.`,
    entrada.nombreCampana.trim() && `Nombre interno de la campaña: "${entrada.nombreCampana.trim()}".`,
    entrada.notaInterna.trim() && `Nota interna del equipo (no es texto público, es contexto): ${entrada.notaInterna.trim()}`,
    entrada.landingUrl.trim() && `Destino del anuncio: ${entrada.landingUrl.trim()}`,
    entrada.brief.trim() && `Lo que pide quien arma la campaña: ${entrada.brief.trim()}`,
  ].filter(Boolean);

  if (entrada.plataforma === "google") {
    if (entrada.actual.titulos?.some((t) => t.trim()) || entrada.actual.descripciones?.some((d) => d.trim())) {
      partes.push(
        `Ya hay un borrador escrito — mejóralo o dale variedad, no lo ignores: títulos actuales: ${JSON.stringify(entrada.actual.titulos ?? [])}. Descripciones actuales: ${JSON.stringify(entrada.actual.descripciones ?? [])}.`,
      );
    }
  } else if (entrada.actual.textoPrincipal || entrada.actual.titulo || entrada.actual.descripcion) {
    partes.push(
      `Ya hay un borrador escrito — mejóralo o dale variedad, no lo ignores: texto principal actual: "${entrada.actual.textoPrincipal ?? ""}", título actual: "${entrada.actual.titulo ?? ""}", descripción actual: "${entrada.actual.descripcion ?? ""}".`,
    );
  }

  return partes.join("\n");
}

/**
 * El esquema estricto ya limita cada texto en el origen, pero no siempre
 * alcanza (ver la nota junto a `HERRAMIENTA_GOOGLE`) — con varias opciones de
 * sobra, es mejor descartar la que se pasó de largo que cortarla a la mitad
 * de una palabra. Solo se recorta si descartar deja menos del mínimo real.
 */
function limitarLista(valores: unknown[], limite: number, minimo: number): string[] {
  const validos = valores.filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
  const dentroDelLimite = validos.filter((v) => v.length <= limite);
  return dentroDelLimite.length >= minimo
    ? dentroDelLimite
    : validos.map((v) => v.slice(0, limite));
}

const SISTEMA = `Escribes copy de anuncios en español para una agencia de medios pagados (Chile y Latinoamérica). Con lo que te den, redacta textos concretos y persuasivos, no genéricos — nada de "la mejor calidad" o "el mejor servicio" sin un motivo detrás. No inventes cifras, descuentos, plazos de envío ni garantías que no te hayan dado: si falta ese dato, escribe sobre lo que sí sabes (el objetivo, el rubro que se deduce del nombre o el destino) en vez de inventarlo. No escribas en mayúsculas sostenidas ni abuses de signos de exclamación. Cada opción debe leerse distinta a las demás, no variaciones mínimas de la misma frase.`;

export async function generarCopys(
  entrada: EntradaCopiloto,
): Promise<{ ok: true; google: SugerenciaGoogle } | { ok: true; meta: SugerenciaMeta } | { ok: false; error: string }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const modelo = env.ANTHROPIC_MODEL || MODELO_POR_DEFECTO;
  const herramienta = entrada.plataforma === "google" ? HERRAMIENTA_GOOGLE : HERRAMIENTA_META;

  try {
    const respuesta = await client.messages.create({
      model: modelo,
      max_tokens: 2000,
      system: SISTEMA,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      tools: [herramienta],
      tool_choice: { type: "tool", name: herramienta.name },
      messages: [{ role: "user", content: prompt(entrada) }],
    });

    if (respuesta.stop_reason === "refusal") {
      return { ok: false, error: "No pude generar textos para ese contenido." };
    }
    const bloque = respuesta.content.find((b) => b.type === "tool_use");
    if (!bloque || bloque.type !== "tool_use") {
      return { ok: false, error: "El modelo no devolvió una sugerencia. Intenta de nuevo." };
    }

    if (entrada.plataforma === "google") {
      const datos = bloque.input as { titulos?: unknown; descripciones?: unknown };
      const titulos = limitarLista(
        Array.isArray(datos.titulos) ? datos.titulos : [],
        LIMITE_GOOGLE_TITULO,
        3,
      ).slice(0, 8);
      const descripciones = limitarLista(
        Array.isArray(datos.descripciones) ? datos.descripciones : [],
        LIMITE_GOOGLE_DESCRIPCION,
        2,
      ).slice(0, 3);
      if (titulos.length < 3 || descripciones.length < 2) {
        return { ok: false, error: "La sugerencia no alcanzó el mínimo de Google. Intenta de nuevo." };
      }
      return { ok: true, google: { titulos, descripciones } };
    }

    const datos = bloque.input as { texto_principal?: unknown; titulo?: unknown; descripcion?: unknown };
    const textoPrincipal = typeof datos.texto_principal === "string" ? datos.texto_principal.slice(0, LIMITE_META_TEXTO) : "";
    if (!textoPrincipal.trim()) {
      return { ok: false, error: "La sugerencia llegó vacía. Intenta de nuevo." };
    }
    return {
      ok: true,
      meta: {
        textoPrincipal,
        titulo: typeof datos.titulo === "string" ? datos.titulo.slice(0, LIMITE_META_TITULO) : "",
        descripcion: typeof datos.descripcion === "string" ? datos.descripcion.slice(0, LIMITE_META_DESCRIPCION) : "",
      },
    };
  } catch (error) {
    console.error("[copiloto-creativos]", error);
    return { ok: false, error: mensajeDeError(error) };
  }
}
