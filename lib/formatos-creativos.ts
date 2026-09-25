/**
 * Ids, labels y notas de las proporciones y estrategias del generador de
 * variantes — sin dependencias de servidor (nada de `cloudflare:workers` ni
 * `@google/genai`), así lo importan tanto `app/generador-variantes.tsx`
 * (cliente) como `lib/generador-creativos.ts` (servidor, dueño del texto
 * real de cada prompt) sin que uno tenga que copiar a mano lo que define el
 * otro. Agregar o renombrar una proporción/estrategia es un cambio en un
 * solo lugar.
 */

export type ProporcionId = "1:1" | "4:5" | "9:16" | "16:9";

export const PROPORCIONES: Record<ProporcionId, { label: string; nota: string }> = {
  "1:1": { label: "1:1 · Cuadrado", nota: "Feed de Facebook e Instagram" },
  "4:5": { label: "4:5 · Vertical", nota: "Feed, ocupa más pantalla" },
  "9:16": { label: "9:16 · Historia", nota: "Stories y Reels" },
  "16:9": { label: "16:9 · Horizontal", nota: "Video en feed, in-stream" },
};

export type EstrategiaId = "adapt" | "redesign" | "legibility" | "simplify";

export const ESTRATEGIAS: Record<EstrategiaId, { label: string; nota: string }> = {
  adapt: { label: "Adaptar", nota: "Mismo diseño, reacomodado al nuevo formato" },
  redesign: { label: "Rediseñar", nota: "Libertad creativa, mantiene marca y mensaje" },
  legibility: { label: "Legibilidad", nota: "Textos más grandes, más contraste" },
  simplify: { label: "Simplificar", nota: "Solo lo esencial: pieza, titular, logo, CTA" },
};
