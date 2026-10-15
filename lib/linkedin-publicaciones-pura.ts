/**
 * «Añadir un anuncio con una publicación existente» en LinkedIn: qué publicaciones se pueden usar, en qué formato de campaña
 * calzan y cómo se reconoce el enlace que pega la persona. Puro (sin red). Formatos medidos el 2026-10-14 sobre las campañas y
 * anuncios reales de Colbún: video → SINGLE_VIDEO, documento → SPONSORED_UPDATE_NATIVE_DOCUMENT (el anuncio guarda la publicación
 * en `content.documentAd.reference`), texto o artículo → STANDARD_UPDATE. LinkedIn rechaza un anuncio de un tipo en una campaña de
 * otro formato («Creative type cannot be SPONSORED_VIDEO if Campaign format is set to STANDARD_UPDATE»).
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export type TipoDePublicacion = "video" | "imagen" | "documento" | "articulo" | "texto" | "otro";

export type FormatoDePublicacion = {
  tipo: TipoDePublicacion;
  /** Formato que debe tener la campaña; `null` si este tipo todavía no se puede usar desde aquí. */
  formatoDeCampana: string | null;
  /** Dónde guarda LinkedIn la publicación dentro del anuncio. */
  contenido: "reference" | "documentAd";
  /** Lo que se le dice a la persona. */
  etiqueta: string;
};

const NO_SOPORTADO = "Este tipo de publicación (carrusel, encuesta u otro) todavía no se puede usar desde aquí.";

export function formatoDePublicacion(publicacion: unknown): FormatoDePublicacion {
  const c = obj(obj(publicacion).content);
  const medio = texto(obj(c.media).id) ?? "";
  if (/^urn:li:video:/.test(medio)) return { tipo: "video", formatoDeCampana: "SINGLE_VIDEO", contenido: "reference", etiqueta: "Video" };
  if (/^urn:li:image:/.test(medio)) return { tipo: "imagen", formatoDeCampana: "SINGLE_IMAGE", contenido: "reference", etiqueta: "Imagen" };
  if (/^urn:li:document:/.test(medio)) return { tipo: "documento", formatoDeCampana: "SPONSORED_UPDATE_NATIVE_DOCUMENT", contenido: "documentAd", etiqueta: "Documento" };
  if (c.article) return { tipo: "articulo", formatoDeCampana: "STANDARD_UPDATE", contenido: "reference", etiqueta: "Artículo" };
  if (c.multiImage || c.carousel || c.poll || medio) return { tipo: "otro", formatoDeCampana: null, contenido: "reference", etiqueta: NO_SOPORTADO };
  return { tipo: "texto", formatoDeCampana: "STANDARD_UPDATE", contenido: "reference", etiqueta: "Solo texto" };
}

/** ¿La publicación sirve para esta campaña? Si no, el motivo en palabras de la persona. */
export function compatibleConCampana(formato: FormatoDePublicacion, formatoDeLaCampana: string | null): { ok: true } | { ok: false; motivo: string } {
  if (formato.formatoDeCampana === null) return { ok: false, motivo: formato.etiqueta };
  if (!formatoDeLaCampana) return { ok: true };
  if (formato.formatoDeCampana === formatoDeLaCampana) return { ok: true };
  return {
    ok: false,
    motivo: `Es una publicación de ${formato.etiqueta.toLowerCase()} y esta campaña es de otro formato (${formatoDeLaCampana}). LinkedIn no deja mezclarlos: usa una campaña del mismo formato o crea una nueva.`,
  };
}

const URN_DE_PUBLICACION = /urn:li:(?:ugcPost|share):\d+/;

/** El URN de una publicación a partir de lo que pega la persona: el URN mismo o un enlace de LinkedIn que lo trae. */
export function urnDePublicacionPegada(entrada: unknown): string | null {
  const t = String(entrada ?? "").trim();
  if (!t) return null;
  let decodificado = t;
  try {
    decodificado = decodeURIComponent(t);
  } catch {
    // se usa tal cual
  }
  return URN_DE_PUBLICACION.exec(decodificado)?.[0] ?? null;
}

export type CandidataDePublicacion = {
  urn: string;
  tipo: TipoDePublicacion;
  etiqueta: string;
  texto: string;
  compatible: boolean;
  motivo: string | null;
  /** Cuántos anuncios de la cuenta ya la usan. */
  anunciosQueLaUsan: number;
};

/** Las publicaciones que ya usan los anuncios de la cuenta, con su tipo y si calzan con la campaña. Las compatibles primero. */
export function candidatasDePublicacion(
  referencias: string[],
  publicaciones: Map<string, Obj>,
  formatoDeLaCampana: string | null,
  resumirTexto: (comentario: unknown) => string | null,
): CandidataDePublicacion[] {
  const usos = new Map<string, number>();
  for (const r of referencias) usos.set(r, (usos.get(r) ?? 0) + 1);
  const lista: CandidataDePublicacion[] = [];
  for (const [urn, n] of usos) {
    const post = publicaciones.get(urn);
    if (!post) continue;
    const formato = formatoDePublicacion(post);
    const veredicto = compatibleConCampana(formato, formatoDeLaCampana);
    const cuerpo = resumirTexto(post.commentary) ?? "(sin texto)";
    lista.push({
      urn,
      tipo: formato.tipo,
      etiqueta: formato.etiqueta,
      texto: cuerpo.length > 140 ? `${cuerpo.slice(0, 139)}…` : cuerpo,
      compatible: veredicto.ok,
      motivo: veredicto.ok ? null : veredicto.motivo,
      anunciosQueLaUsan: n,
    });
  }
  return lista.sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.anunciosQueLaUsan - a.anunciosQueLaUsan);
}
