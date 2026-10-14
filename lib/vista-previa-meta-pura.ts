/**
 * Medidas de la vista previa real de Meta (la que se muestra en un iframe). Meta declara un tamaño que no calza con su contenido
 * (un Reel dice 274×213 y mide 320×624; el feed dice 450 de alto y un video vertical necesita 650), y la página de Meta no avisa su
 * altura real a quien la incrusta. Por eso el alto se estima con lo que sí se sabe: el formato y la proporción de la pieza.
 * Puro (sin red): medido sobre las vistas reales de Meta.
 */

export type FormatoDeVista = "MOBILE_FEED_STANDARD" | "INSTAGRAM_STANDARD" | "INSTAGRAM_STORY" | "INSTAGRAM_REELS";

export type MedidasDeVista = {
  ancho: number;
  alto: number;
  /** Píxeles del borde derecho que se recortan: esconde la barra de desplazamiento propia que Meta pone en el feed de Instagram. */
  recorteDerecho: number;
};

/** Ancho útil de la pieza en cada feed. */
const ANCHO_PIEZA = 320;
/** Meta recorta la pieza del feed entre 1,91:1 (apaisada) y 4:5 (vertical). */
const PIEZA_MIN = Math.round(ANCHO_PIEZA / 1.91);
const PIEZA_MAX = Math.round(ANCHO_PIEZA * 1.25);
/** Alto máximo del feed de Instagram: lo que pasa de ahí, Meta lo desplaza con su propia barra. */
const ALTO_FEED_INSTAGRAM = 567;

/** Alto de la pieza en el feed, según su proporción (ancho / alto). Sin proporción conocida se asume la más alta, para no cortar nada. */
export function altoDePieza(aspecto: number | null): number {
  if (!aspecto || !Number.isFinite(aspecto) || aspecto <= 0) return PIEZA_MAX;
  return Math.min(PIEZA_MAX, Math.max(PIEZA_MIN, Math.round(ANCHO_PIEZA / aspecto)));
}

export function medidasDeVista(formato: FormatoDeVista, aspecto: number | null, conBoton: boolean): MedidasDeVista {
  const pieza = altoDePieza(aspecto);
  switch (formato) {
    case "MOBILE_FEED_STANDARD":
      // Encabezado y texto (124) + pieza + barra del botón (56, si lo hay) + reacciones y acciones (65) + aire.
      return { ancho: 335, alto: 124 + pieza + (conBoton ? 121 : 65) + 6, recorteDerecho: 0 };
    case "INSTAGRAM_STANDARD": {
      const contenido = 218 + pieza;
      return contenido > ALTO_FEED_INSTAGRAM
        ? { ancho: 320, alto: ALTO_FEED_INSTAGRAM, recorteDerecho: 16 }
        : { ancho: 320, alto: contenido, recorteDerecho: 0 };
    }
    case "INSTAGRAM_STORY":
      return { ancho: 320, alto: 567, recorteDerecho: 0 };
    case "INSTAGRAM_REELS":
      return { ancho: 320, alto: 625, recorteDerecho: 0 };
  }
}
