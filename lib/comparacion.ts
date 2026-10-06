/**
 * Comparación de una métrica contra el periodo anterior, para las tablas.
 *
 * Dos reglas que evitan los errores clásicos de un reporte de medios:
 *
 *  - **Subir no siempre es bueno.** Más resultados es bueno; un costo por
 *    resultado más alto es malo; el gasto es neutro (depende de si se quería
 *    gastar más). Cada columna declara su sentido.
 *  - **Sin base, no hay comparación.** Pasar de 1 a 3 resultados no es "+200%":
 *    es ruido. Los conteos chicos no se comparan.
 *
 * Es puro y sin dependencias.
 */

export type Sentido = "mas" | "menos" | "neutro";

export type Tono = "bueno" | "malo" | "neutro";

/** Sentido de cada columna de la tabla de anuncios (ids de `COLUMNAS_METRICA`). */
export const SENTIDO_POR_COLUMNA: Record<string, Sentido> = {
  invertido: "neutro",
  impresiones: "mas",
  clics: "mas",
  ctr: "mas",
  cpc: "menos",
  cpm: "menos",
  resultados: "mas",
  costo: "menos",
  alcance: "mas",
  clicsEnlace: "mas",
  interacciones: "mas",
  leads: "mas",
  compras: "mas",
  conversiones: "mas",
  tasaInteraccion: "mas",
  ctrEnlace: "mas",
  // La frecuencia ideal depende del cliente (su meta); acá solo se muestra el cambio.
  frecuencia: "neutro",
  roas: "mas",
  landingPageViews: "mas",
  costoLandingPageView: "menos",
  thruplays: "mas",
  costoThruplay: "menos",
  videoViews: "mas",
};

/** Columnas que son conteos: con una base muy chica el porcentaje engaña. */
const CONTEOS = new Set([
  "resultados", "leads", "compras", "conversiones", "interacciones",
  "clicsEnlace", "landingPageViews", "thruplays", "videoViews",
]);

export const BASE_MINIMA_CONTEO = 5;
/** Cambios más chicos que esto no se muestran: es ruido de redondeo. */
export const CAMBIO_MINIMO = 0.005;

export type Cambio = { texto: string; tono: Tono; variacion: number };

/** Variación relativa, o `null` si el periodo base no permite compararla. */
export function variacionRelativa(actual: number | null, previo: number | null): number | null {
  if (actual === null || previo === null) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(previo) || previo <= 0) return null;
  return (actual - previo) / previo;
}

function formatear(v: number): string {
  const pct = Math.round(v * 100);
  if (pct > 999) return "+999%+";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export function cambioDeColumna(
  columnaId: string,
  actual: number | null,
  previo: number | null,
): Cambio | null {
  if (CONTEOS.has(columnaId) && (previo === null || previo < BASE_MINIMA_CONTEO)) return null;
  const v = variacionRelativa(actual, previo);
  if (v === null || Math.abs(v) < CAMBIO_MINIMO) return null;
  const sentido = SENTIDO_POR_COLUMNA[columnaId] ?? "neutro";
  const tono: Tono =
    sentido === "neutro" ? "neutro" : (v > 0) === (sentido === "mas") ? "bueno" : "malo";
  return { texto: formatear(v), tono, variacion: v };
}
