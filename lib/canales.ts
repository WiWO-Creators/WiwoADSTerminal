/**
 * Canales de cada plataforma: dónde se muestran los anuncios. Meta reparte en
 * Facebook, Instagram, Threads…; Google, en Búsqueda, Display y YouTube.
 *
 * Es un registro, no un if por plataforma: cuando se active TikTok o LinkedIn
 * basta con declarar sus canales acá y el simulador (y cualquier reparto) los
 * ofrece solo. Puro (sin red ni base de datos).
 */
import { isActivePlatform, type Platform } from "./plataformas";

export type Canal = { id: string; etiqueta: string };

/** Qué es cada canal, en una frase, para quien no lo conoce (se muestra junto al nombre en el simulador). */
export const AYUDA_DE_CANAL: Record<string, string> = {
  audience_network:
    "Audience Network: la red de apps y sitios externos que muestran anuncios de Meta, fuera de Facebook e Instagram. Es tráfico más barato pero de menor calidad.",
  threads: "Threads: la red de conversación de Meta, asociada a Instagram.",
  messenger: "Messenger: anuncios dentro de la bandeja y los chats de Messenger.",
  display: "Display: banners en sitios y apps de la Red de Display de Google.",
  search: "Búsqueda: anuncios de texto en los resultados de Google (y sus socios de búsqueda).",
};

export const CANALES: Record<Platform, Canal[]> = {
  meta: [
    { id: "facebook", etiqueta: "Facebook" },
    { id: "instagram", etiqueta: "Instagram" },
    { id: "threads", etiqueta: "Threads" },
    { id: "messenger", etiqueta: "Messenger" },
    { id: "audience_network", etiqueta: "Audience Network" },
  ],
  google: [
    { id: "search", etiqueta: "Búsqueda" },
    { id: "display", etiqueta: "Display" },
    { id: "youtube", etiqueta: "YouTube" },
  ],
  // Se llenan (o se confirman) al activar cada plataforma.
  tiktok: [{ id: "tiktok", etiqueta: "TikTok" }],
  linkedin: [{ id: "linkedin", etiqueta: "LinkedIn" }],
};

/** Canales de las plataformas activas, agrupados por plataforma. */
export function canalesActivos(): Array<{ provider: Platform; canales: Canal[] }> {
  return (Object.keys(CANALES) as Platform[])
    .filter((p) => isActivePlatform(p))
    .map((provider) => ({ provider, canales: CANALES[provider] }));
}

export function etiquetaDeCanal(provider: string, canal: string | null): string {
  if (canal === null) return "Todos los canales";
  return CANALES[provider as Platform]?.find((c) => c.id === canal)?.etiqueta ?? canal;
}

/** `publisher_platform` de Meta → canal. Lo que no es un canal conocido (WhatsApp, sin dato) queda fuera. */
export function canalDeMeta(publisherPlatform: unknown): string | null {
  const valor = String(publisherPlatform ?? "").toLowerCase();
  return CANALES.meta.some((c) => c.id === valor) ? valor : null;
}

/** `ad_network_type` de Google → canal. Varias redes de Google se agrupan en uno solo. */
export function canalDeGoogle(adNetworkType: unknown): string | null {
  switch (String(adNetworkType ?? "").toUpperCase()) {
    case "SEARCH":
    case "SEARCH_PARTNERS":
      return "search";
    case "CONTENT":
      return "display";
    case "YOUTUBE":
    case "YOUTUBE_SEARCH":
    case "YOUTUBE_VIDEOS":
      return "youtube";
    default:
      return null;
  }
}

/** Clave estable de un canal dentro de un reparto. */
export const claveDeCanal = (provider: string, canal: string | null): string => `${provider}:${canal ?? "*"}`;
