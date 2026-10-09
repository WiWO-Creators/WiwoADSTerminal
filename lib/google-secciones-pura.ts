import type { NivelEntidad } from "@/lib/plataformas";

/**
 * Qué secciones tiene el editor de Google según el tipo de campaña, como Google Ads: cada tipo (Búsqueda, Display, Performance
 * Max, Demand Gen, Video, Shopping…) pide campos distintos, pero la estructura es siempre la misma: árbol Campaña → Grupo → Anuncio.
 * Parte pura: la usan el editor y el Orb para no ofrecer un campo que ese tipo de campaña no tiene.
 */

export type SeccionGoogle =
  | "redes"
  | "rotacion"
  | "extensiones"
  | "gruposDeRecursos"
  | "cpcMaximo"
  | "palabrasClave"
  | "contenidoRsa";

export const TIPOS_DE_CAMPANA_GOOGLE: Record<string, string> = {
  SEARCH: "Búsqueda",
  DISPLAY: "Display",
  SHOPPING: "Shopping",
  VIDEO: "Video",
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Generación de demanda",
  MULTI_CHANNEL: "Aplicaciones",
  SMART: "Inteligente",
  LOCAL: "Local",
  TRAVEL: "Viajes",
  HOTEL: "Hoteles",
};

export function nombreDeTipoGoogle(tipo: string | null | undefined): string {
  return TIPOS_DE_CAMPANA_GOOGLE[(tipo ?? "").toUpperCase()] ?? (tipo ? tipo.replace(/_/g, " ").toLowerCase() : "de otro tipo");
}

export const AVISO_NO_AÑADIDO =
  "Esa configuración todavía no está añadida al sistema: se cambia en Google Ads, o contacta con soporte o con el equipo de paid media.";

/** Las secciones que aplican a una campaña de ese tipo, en ese nivel del árbol. */
export function seccionesDeGoogle(tipoCampana: string | null | undefined, nivel: NivelEntidad): Set<SeccionGoogle> {
  const tipo = (tipoCampana ?? "").toUpperCase();
  const s = new Set<SeccionGoogle>();
  if (nivel === "campana") {
    if (tipo === "SEARCH") {
      s.add("redes");
      s.add("extensiones");
    }
    if (tipo === "SEARCH" || tipo === "DISPLAY") s.add("rotacion");
    if (tipo === "PERFORMANCE_MAX") s.add("gruposDeRecursos");
  } else if (nivel === "conjunto") {
    if (tipo === "SEARCH" || tipo === "DISPLAY" || tipo === "SHOPPING") s.add("cpcMaximo");
    if (tipo === "SEARCH") s.add("palabrasClave");
  } else if (tipo === "SEARCH") {
    s.add("contenidoRsa");
  }
  return s;
}

/** Lo que el sistema todavía no permite editar en ese nivel de ese tipo de campaña (para decirlo, no para esconderlo). */
export function limitesDeGoogle(tipoCampana: string | null | undefined, nivel: NivelEntidad): string | null {
  const tipo = (tipoCampana ?? "").toUpperCase();
  const nombre = nombreDeTipoGoogle(tipo);
  if (nivel === "conjunto") {
    if (tipo === "SEARCH") return null;
    if (tipo === "PERFORMANCE_MAX") return "Performance Max no tiene grupos de anuncios: sus grupos de recursos se editan desde la campaña.";
    if (tipo === "DISPLAY" || tipo === "SHOPPING") return `En ${nombre} aquí se edita el estado, el nombre y el CPC máximo. ${AVISO_NO_AÑADIDO}`;
    return `En ${nombre} aquí se edita el estado y el nombre del grupo; la segmentación y los canales no. ${AVISO_NO_AÑADIDO}`;
  }
  if (nivel === "anuncio") {
    if (tipo === "SEARCH") return null;
    return `El contenido de un anuncio de ${nombre} se muestra tal como está, pero no se edita desde aquí. ${AVISO_NO_AÑADIDO}`;
  }
  return null;
}
