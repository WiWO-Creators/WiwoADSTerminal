import { GoogleGenAI } from "@google/genai";
import { env } from "cloudflare:workers";

import {
  ESTRATEGIAS,
  PROPORCIONES,
  type EstrategiaId,
  type ProporcionId,
} from "@/lib/formatos-creativos";

export { ESTRATEGIAS, PROPORCIONES, type EstrategiaId, type ProporcionId };

/**
 * Genera variantes de formato de una pieza de Meta con Gemini (modelo de
 * imagen), en vez de que alguien tenga que rediagramar cada proporción a
 * mano. Prompts y patrón de llamada verificados contra un repo hermano
 * (AdScale/"Adaptatron") que ya los usaba en producción — no son un intento
 * a ciegas de la API de Gemini.
 *
 * Solo Meta: Google no tiene ninguna acción de escritura para un anuncio con
 * imagen (`create_responsive_search_ad` es puro texto), así que no hay
 * dónde usar un creativo generado del lado de Google.
 */

export class GeneradorCreativosError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

export function generadorConfigurado(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

/**
 * Modelo estable, sin requerir una key de pago — a diferencia de
 * "gemini-3.1-flash-image-preview" (Nano Banana 2), que el repo de
 * referencia marca explícitamente como "requiere API Key de pago". Con esto
 * la función anda con cualquier key nueva de Google AI Studio.
 */
const MODELO = "gemini-2.5-flash-image";

/**
 * Texto real de cada prompt — server-only a propósito (son ~800 caracteres
 * cada uno, no hace falta mandarlos al cliente solo para poblar un select).
 * Los labels/notas que sí ve la persona viven en `lib/formatos-creativos.ts`,
 * compartidos con `app/generador-variantes.tsx`.
 */
const INSTRUCCIONES: Record<EstrategiaId, string> = {
  adapt:
    "Actúa como un diseñador profesional. Tu función es rediagramar y ajustar composición, proporción y jerarquía visual SIN alterar el concepto creativo, estilo visual, branding, textos, colores ni tipografías. Mantén consistencia en logo, jerarquía visual entre titulares, bajadas, CTA e imágenes. Solo ajusta tamaño, posición y alineación para que encaje perfectamente en el nuevo formato. No recortes elementos críticos.",
  redesign:
    "Actúa como un director de arte creativo. Tu función es rediseñar completamente la pieza publicitaria para el nuevo formato. Mantén el mensaje principal y la identidad de marca (logo, colores corporativos), pero siéntete libre de proponer una nueva composición, cambiar la distribución de los elementos, modificar el fondo o alterar la estructura visual para crear un impacto renovado y moderno.",
  legibility:
    "Actúa como un experto en accesibilidad y diseño UX/UI. Tu objetivo principal es maximizar la legibilidad de la pieza en el nuevo formato. Aumenta el tamaño de los textos, mejora el contraste entre el texto y el fondo (añadiendo sombras, cajas de color o desenfoques si es necesario), y asegúrate de que el mensaje principal se lea instantáneamente. Mantén la marca y el concepto, pero prioriza la claridad.",
  simplify:
    "Actúa como un diseñador minimalista. Tu objetivo es simplificar la pieza publicitaria al máximo para el nuevo formato. Elimina elementos decorativos innecesarios, textos secundarios prescindibles o fondos recargados. Quédate únicamente con lo esencial: el producto/imagen principal, el titular más importante, el logo y el llamado a la acción (CTA). Crea un diseño limpio, directo y con mucho espacio en blanco (aire).",
};

const MAX_IMAGEN_B64 = 4 * 1024 * 1024;

export async function generarVariante(params: {
  imagenBase: { data: string; mimeType: string };
  proporcion: ProporcionId;
  estrategia: EstrategiaId;
}): Promise<{ data: string; mimeType: string }> {
  if (!env.GEMINI_API_KEY) {
    throw new GeneradorCreativosError(
      "El generador de variantes no está configurado en este entorno.",
      503,
    );
  }
  if (params.imagenBase.data.length > MAX_IMAGEN_B64) {
    throw new GeneradorCreativosError("La imagen base pesa demasiado para generar una variante.", 400);
  }

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: MODELO,
      contents: {
        parts: [
          { inlineData: { data: params.imagenBase.data, mimeType: params.imagenBase.mimeType } },
          { text: INSTRUCCIONES[params.estrategia] },
        ],
      },
      config: { imageConfig: { aspectRatio: params.proporcion } },
    });
  } catch (error) {
    throw new GeneradorCreativosError(
      `Gemini no pudo generar la variante: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parte = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!parte?.inlineData?.data) {
    throw new GeneradorCreativosError("Gemini no devolvió ninguna imagen.");
  }
  return {
    data: parte.inlineData.data,
    mimeType: parte.inlineData.mimeType || "image/png",
  };
}
