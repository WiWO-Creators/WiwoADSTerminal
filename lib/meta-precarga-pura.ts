/**
 * Lo que el editor precarga de Meta para que cada campo venga como está configurado en la plataforma (y no vacío): la descripción
 * actual del anuncio y la ventana de atribución del conjunto. Puro: interpreta lo que devuelve Meta, no llama a nada.
 */

export type VentanaDeAtribucion = "default" | "click_1d" | "click_7d" | "click_1d_view_1d";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const lista = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** La descripción (la línea bajo el título) de un creativo de Meta, venga de un enlace, un video o un anuncio con varios textos. */
export function descripcionDeCreativo(creativo: unknown): string | null {
  const c = objeto(creativo);
  const historia = objeto(c.object_story_spec);
  const enlace = objeto(historia.link_data);
  const video = objeto(historia.video_data);
  const deEnlace = texto(enlace.description);
  if (deEnlace) return deEnlace;
  const deVideo = texto(video.link_description);
  if (deVideo) return deVideo;
  const varias = lista(objeto(c.asset_feed_spec).descriptions);
  const primera = varias.map((d) => texto(d.text)).find(Boolean);
  return primera ?? null;
}

/**
 * La ventana de atribución del conjunto en los términos del editor. Sin `attribution_spec` (o la de Meta por defecto: 7 días tras el
 * clic y 1 tras la vista) es «default»; una que el editor no ofrece queda en `null`, para no cambiarla sin querer.
 */
export function ventanaDeAtribucion(spec: unknown): VentanaDeAtribucion | null {
  const items = lista(spec);
  if (items.length === 0) return "default";
  const clave = items
    .map((i) => `${String(i.event_type ?? "")}:${Number(i.window_days ?? 0)}`)
    .sort()
    .join("|");
  switch (clave) {
    case "CLICK_THROUGH:1": return "click_1d";
    case "CLICK_THROUGH:7": return "click_7d";
    case "CLICK_THROUGH:1|VIEW_THROUGH:1": return "click_1d_view_1d";
    case "CLICK_THROUGH:7|VIEW_THROUGH:1": return "default";
    default: return null;
  }
}

/** Proporción (ancho / alto) de la pieza de un creativo de Meta, o `null` si no se puede saber. */
export function aspectoDe(ancho: unknown, alto: unknown): number | null {
  const w = Number(ancho);
  const h = Number(alto);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? Math.round((w / h) * 1000) / 1000 : null;
}

/** El video y la imagen que usa un creativo, para pedirle a Meta sus medidas. */
export function piezaDeCreativo(creativo: unknown): { videoId: string | null; imageHash: string | null } {
  const c = objeto(creativo);
  const historia = objeto(c.object_story_spec);
  const video = objeto(historia.video_data);
  const enlace = objeto(historia.link_data);
  const videos = lista(objeto(c.asset_feed_spec).videos);
  const imagenes = lista(objeto(c.asset_feed_spec).images);
  return {
    videoId: texto(video.video_id) ?? texto(videos[0]?.video_id),
    imageHash: texto(enlace.image_hash) ?? texto(video.image_hash) ?? texto(imagenes[0]?.hash),
  };
}

/** La medida más grande de un video (Meta lo entrega en varios tamaños). */
export function medidaDeVideo(formatos: unknown): { ancho: number; alto: number } | null {
  const mejor = lista(formatos)
    .map((f) => ({ ancho: Number(f.width), alto: Number(f.height) }))
    .filter((f) => f.ancho > 0 && f.alto > 0)
    .sort((a, b) => b.ancho - a.ancho)[0];
  return mejor ?? null;
}
