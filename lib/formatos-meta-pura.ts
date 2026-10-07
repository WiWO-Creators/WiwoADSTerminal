/**
 * Formato de entrega dentro de cada red de Meta — Feed, Historias o Reels. Un mismo formato lógico es un valor de API
 * distinto por red (`facebook_positions` vs `instagram_positions`). Parte pura, sin red.
 */
export const META_SURFACES: Record<string, { label: string; facebook: string; instagram: string }> = {
  feed: { label: "Feed", facebook: "feed", instagram: "stream" },
  historias: { label: "Historias", facebook: "story", instagram: "story" },
  reels: { label: "Reels", facebook: "facebook_reels", instagram: "reels" },
};

export type FormatoMeta = "feed" | "historias" | "reels";
export const FORMATOS_META = Object.keys(META_SURFACES) as FormatoMeta[];

/** Los formatos lógicos que ya trae una segmentación cruda de Meta (los de Facebook e Instagram, sin repetir). */
export function formatosDeSegmentacion(cruda: Record<string, unknown> | null | undefined): FormatoMeta[] {
  const encontrados = new Set<FormatoMeta>();
  for (const red of ["facebook", "instagram"] as const) {
    const valores = cruda?.[`${red}_positions`];
    if (!Array.isArray(valores)) continue;
    for (const f of FORMATOS_META) if (valores.includes(META_SURFACES[f][red])) encontrados.add(f);
  }
  return FORMATOS_META.filter((f) => encontrados.has(f));
}

/**
 * Todas las ubicaciones (posiciones) que admite Meta, por red, con su valor de API y su nombre en español.
 * Lista de la documentación de segmentación de Meta; si Meta añade o quita una, rechaza el valor al aplicar y se ve el motivo.
 */
export type RedConPosiciones = "facebook" | "instagram" | "messenger" | "audience_network";

export const POSICIONES_META: Record<RedConPosiciones, Array<{ valor: string; label: string }>> = {
  facebook: [
    { valor: "feed", label: "Feed" },
    { valor: "right_hand_column", label: "Columna derecha" },
    { valor: "marketplace", label: "Marketplace" },
    { valor: "video_feeds", label: "Feed de videos" },
    { valor: "story", label: "Historias" },
    { valor: "search", label: "Resultados de búsqueda" },
    { valor: "instream_video", label: "Videos in-stream" },
    { valor: "facebook_reels", label: "Reels" },
    { valor: "facebook_reels_overlay", label: "Anuncios sobre Reels" },
    { valor: "profile_feed", label: "Feed del perfil" },
    { valor: "notification", label: "Notificaciones" },
  ],
  instagram: [
    { valor: "stream", label: "Feed" },
    { valor: "story", label: "Historias" },
    { valor: "explore", label: "Explorar" },
    { valor: "explore_home", label: "Inicio de Explorar" },
    { valor: "reels", label: "Reels" },
    { valor: "profile_feed", label: "Feed del perfil" },
    { valor: "ig_search", label: "Resultados de búsqueda" },
    { valor: "profile_reels", label: "Reels del perfil" },
  ],
  messenger: [
    { valor: "messenger_home", label: "Bandeja de Messenger" },
    { valor: "sponsored_messages", label: "Mensajes patrocinados" },
    { valor: "story", label: "Historias" },
  ],
  audience_network: [
    { valor: "classic", label: "Nativo, banner e intersticial" },
    { valor: "rewarded_video", label: "Videos con recompensa" },
    { valor: "instream_video", label: "Videos in-stream" },
  ],
};

export const REDES_CON_POSICIONES = Object.keys(POSICIONES_META) as RedConPosiciones[];

/** Las ubicaciones que pidió la persona que no existen para esa red. */
export function posicionesInvalidas(red: RedConPosiciones, pedidas: string[]): string[] {
  const validas = new Set(POSICIONES_META[red].map((p) => p.valor));
  return pedidas.filter((p) => !validas.has(p));
}
