/**
 * Formatos de anuncio nuevos para Meta (imágenes sueltas y carrusel) y las ubicaciones (feed, stories, reels) que cubre un
 * conjunto. Parte pura, sin red: arma las especificaciones que se mandan a la API de Meta y valida lo que se pide.
 */

export const CTA_POR_DEFECTO = "LEARN_MORE";
/** Botones habituales; Meta acepta más, pero estos cubren el uso normal de la agencia. */
export const CTA_PERMITIDOS = ["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "CONTACT_US", "GET_QUOTE", "BOOK_NOW", "DOWNLOAD", "SUBSCRIBE", "SEE_MORE", "NO_BUTTON"] as const;

export const MIN_TARJETAS = 2;
export const MAX_TARJETAS = 10;
export const MAX_IMAGENES = 20;

export type Tarjeta = { imagenUrl: string; titulo: string; descripcion?: string; enlace?: string };
export type FormatoDeContenido = "imagenes" | "carrusel";

export type DatosDeContenido = {
  formato: FormatoDeContenido;
  /** Texto principal del anuncio. */
  mensaje: string;
  /** Destino general (cada tarjeta puede traer el suyo). */
  enlace: string;
  cta?: string;
  /** Imágenes sueltas (cada una será un anuncio) o tarjetas del carrusel. */
  imagenes: Array<{ url: string; titulo?: string; descripcion?: string; enlace?: string }>;
};

const esHttps = (u: string): boolean => {
  try {
    return new URL(u.trim()).protocol === "https:";
  } catch {
    return false;
  }
};

/** Todo lo que impide crear este contenido; vacío si está bien. */
export function validarContenido(d: DatosDeContenido): string[] {
  const errores: string[] = [];
  if (!d.mensaje.trim()) errores.push("Falta el texto principal del anuncio.");
  if (d.mensaje.length > 2200) errores.push("El texto principal es demasiado largo (máximo 2.200 caracteres).");
  if (!esHttps(d.enlace)) errores.push("El destino debe ser un enlace https.");
  if (d.cta && !(CTA_PERMITIDOS as readonly string[]).includes(d.cta)) errores.push(`El botón «${d.cta}» no está permitido.`);
  if (d.formato === "carrusel") {
    if (d.imagenes.length < MIN_TARJETAS || d.imagenes.length > MAX_TARJETAS) errores.push(`Un carrusel lleva entre ${MIN_TARJETAS} y ${MAX_TARJETAS} imágenes.`);
  } else if (d.imagenes.length < 1 || d.imagenes.length > MAX_IMAGENES) {
    errores.push(`Elige entre 1 y ${MAX_IMAGENES} imágenes.`);
  }
  d.imagenes.forEach((im, i) => {
    if (!esHttps(im.url)) errores.push(`La imagen ${i + 1} debe ser una dirección https pública.`);
    if (im.enlace && !esHttps(im.enlace)) errores.push(`El enlace de la imagen ${i + 1} debe ser https.`);
    if (d.formato === "carrusel" && !(im.titulo ?? "").trim()) errores.push(`La tarjeta ${i + 1} necesita un título.`);
  });
  return errores;
}

type Destinos = { paginaId: string; instagramUserId?: string | null };

const boton = (cta: string | undefined, enlace: string) =>
  cta === "NO_BUTTON" ? { type: "NO_BUTTON" } : { type: cta || CTA_POR_DEFECTO, value: { link: enlace } };

/** Una imagen suelta: un anuncio de imagen con enlace. */
export function creativoDeImagen(
  d: Pick<DatosDeContenido, "mensaje" | "enlace" | "cta">,
  imagen: { url: string; titulo?: string; descripcion?: string; enlace?: string },
  destinos: Destinos,
  nombre: string,
): Record<string, string | object> {
  const enlace = imagen.enlace?.trim() || d.enlace.trim();
  return {
    name: nombre.slice(0, 100),
    object_story_spec: {
      page_id: destinos.paginaId,
      ...(destinos.instagramUserId ? { instagram_user_id: destinos.instagramUserId } : {}),
      link_data: {
        link: enlace,
        message: d.mensaje.trim(),
        picture: imagen.url.trim(),
        ...(imagen.titulo?.trim() ? { name: imagen.titulo.trim() } : {}),
        ...(imagen.descripcion?.trim() ? { description: imagen.descripcion.trim() } : {}),
        call_to_action: boton(d.cta, enlace),
      },
    },
  };
}

/** Un carrusel: una sola pieza con varias tarjetas deslizables. */
export function creativoDeCarrusel(
  d: Pick<DatosDeContenido, "mensaje" | "enlace" | "cta" | "imagenes">,
  destinos: Destinos,
  nombre: string,
): Record<string, string | object> {
  return {
    name: nombre.slice(0, 100),
    object_story_spec: {
      page_id: destinos.paginaId,
      ...(destinos.instagramUserId ? { instagram_user_id: destinos.instagramUserId } : {}),
      link_data: {
        link: d.enlace.trim(),
        message: d.mensaje.trim(),
        child_attachments: d.imagenes.map((im) => {
          const enlace = im.enlace?.trim() || d.enlace.trim();
          return {
            link: enlace,
            picture: im.url.trim(),
            name: (im.titulo ?? "").trim(),
            ...(im.descripcion?.trim() ? { description: im.descripcion.trim() } : {}),
            call_to_action: boton(d.cta, enlace),
          };
        }),
        multi_share_optimized: true,
        multi_share_end_card: false,
      },
    },
  };
}

/** Nombre claro del contenido, para la solicitud y el anuncio. */
export function tituloDeContenido(d: Pick<DatosDeContenido, "formato" | "imagenes">): string {
  const n = d.imagenes.length;
  return d.formato === "carrusel" ? `un carrusel de ${n} imágenes` : n === 1 ? "un anuncio de imagen" : `${n} anuncios de imagen`;
}

export type Colocaciones = { automaticas: boolean; feed: boolean; stories: boolean; reels: boolean };

/**
 * Qué ubicaciones cubre un conjunto de Meta, a partir de su `targeting`. Sin `publisher_platforms` son automáticas
 * (Advantage+): cubren todo. Sirve para avisar cuando un contenido pensado para Stories o Reels no se mostraría ahí.
 */
export function colocacionesDeConjunto(targeting: Record<string, unknown> | null): Colocaciones {
  const plataformas = Array.isArray(targeting?.publisher_platforms) ? (targeting!.publisher_platforms as unknown[]).map(String) : [];
  if (plataformas.length === 0) return { automaticas: true, feed: true, stories: true, reels: true };
  const lista = (k: string): string[] => (Array.isArray(targeting?.[k]) ? (targeting![k] as unknown[]).map(String) : []);
  const fb = lista("facebook_positions");
  const ig = lista("instagram_positions");
  // Una plataforma elegida sin posiciones explícitas usa todas las suyas.
  const todas = (p: string, pos: string[]) => plataformas.includes(p) && pos.length === 0;
  return {
    automaticas: false,
    feed: todas("facebook", fb) || todas("instagram", ig) || fb.includes("feed") || ig.includes("stream"),
    stories: todas("facebook", fb) || todas("instagram", ig) || fb.includes("story") || ig.includes("story"),
    reels: todas("facebook", fb) || todas("instagram", ig) || fb.includes("facebook_reels") || ig.includes("reels"),
  };
}
