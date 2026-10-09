import type { DetalleAnuncio, GrupoDeRecursos, ImagenGoogle } from "@/lib/detalle-entidad";

/**
 * Vistas previas de Google. A diferencia de Meta, Google no entrega una vista previa lista para incrustar: se dibuja con los
 * textos y las piezas reales del anuncio. Parte pura (sin React) para poder probarla.
 */

export type FormatoGoogle = "busqueda-movil" | "busqueda-escritorio" | "display" | "discover" | "youtube" | "gmail" | "maps";

export const ETIQUETA_DE_FORMATO: Record<FormatoGoogle, string> = {
  "busqueda-movil": "Búsqueda · móvil",
  "busqueda-escritorio": "Búsqueda · escritorio",
  display: "Display",
  discover: "Discover",
  youtube: "YouTube",
  gmail: "Gmail",
  maps: "Maps",
};

export type FamiliaDeAnuncio = "busqueda" | "display" | "video" | "demanda" | "pmax";

export type PiezaGoogle = {
  familia: FamiliaDeAnuncio;
  negocio: string;
  dominio: string;
  /** `dominio › ruta1 › ruta2`, como lo muestra Búsqueda. */
  urlVisible: string;
  titulares: string[];
  titularesLargos: string[];
  descripciones: string[];
  imagenes: ImagenGoogle[];
  logo: string | null;
  videoYoutube: string | null;
  cta: string;
};

const CTA_POR_DEFECTO = "Más información";

export function dominioDe(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function urlVisibleDe(dominio: string, path1: string | null, path2: string | null): string {
  return [dominio, path1, path2].filter((p): p is string => !!p).join(" › ");
}

export function familiaDeTipo(tipo: string | null): FamiliaDeAnuncio {
  const t = (tipo ?? "").toUpperCase();
  if (t.startsWith("DEMAND_GEN")) return "demanda";
  if (t.includes("VIDEO")) return "video";
  if (t.includes("DISPLAY") || t === "IMAGE_AD" || t === "RESPONSIVE_DISPLAY_AD") return "display";
  return "busqueda";
}

/** `DEMAND_GEN_VIDEO_RESPONSIVE_AD` → «anuncio de Generación de demanda (video)». */
export function nombreDeTipoDeAnuncio(tipo: string | null): string {
  const t = (tipo ?? "").toUpperCase();
  const base = t.startsWith("DEMAND_GEN")
    ? "Generación de demanda"
    : t.includes("DISPLAY")
      ? "Display"
      : t.includes("VIDEO")
        ? "video"
        : t.includes("SHOPPING")
          ? "Shopping"
          : t.includes("SEARCH")
            ? "búsqueda"
            : "";
  const detalle = t.startsWith("DEMAND_GEN") && t.includes("VIDEO") ? " (video)" : t.includes("CAROUSEL") ? " (carrusel)" : "";
  return base ? `anuncio de ${base}${detalle}` : "anuncio de otro tipo";
}

/** Dónde se puede ver cada familia de anuncio. En Performance Max Google decide: se muestran todos. */
export function formatosDeFamilia(familia: FamiliaDeAnuncio): FormatoGoogle[] {
  switch (familia) {
    case "busqueda":
      return ["busqueda-movil", "busqueda-escritorio"];
    case "display":
      return ["display", "gmail"];
    case "video":
      return ["youtube"];
    case "demanda":
      return ["discover", "youtube", "gmail"];
    case "pmax":
      return ["busqueda-movil", "display", "youtube", "discover", "gmail", "maps"];
  }
}

export function piezaDeAnuncioGoogle(a: DetalleAnuncio, negocioPorDefecto: string): PiezaGoogle {
  const c = a.contenido;
  const v = c.visual ?? null;
  const dominio = dominioDe(c.urlDestino);
  const familia = familiaDeTipo(a.tipo);
  const logo = v?.imagenes.find((i) => i.forma === "logo")?.url ?? null;
  return {
    familia,
    negocio: v?.negocio ?? negocioPorDefecto,
    dominio,
    urlVisible: c.urlVisible ?? urlVisibleDe(dominio, c.path1, c.path2),
    titulares: v?.titulares.length ? v.titulares : c.titulares.map((t) => t.texto),
    titularesLargos: v?.titularesLargos ?? [],
    descripciones: v?.descripciones.length ? v.descripciones : c.descripciones.map((t) => t.texto),
    imagenes: (v?.imagenes ?? []).filter((i) => i.forma !== "logo"),
    logo,
    videoYoutube: v?.videosYoutube[0] ?? null,
    cta: v?.cta ? humanizarCta(v.cta) : CTA_POR_DEFECTO,
  };
}

const FORMA_DE_CAMPO: Record<string, ImagenGoogle["forma"]> = {
  MARKETING_IMAGE: "horizontal",
  SQUARE_MARKETING_IMAGE: "cuadrada",
  PORTRAIT_MARKETING_IMAGE: "vertical",
  LOGO: "logo",
  LANDSCAPE_LOGO: "logo",
};

export function piezaDeGrupoDeRecursos(g: GrupoDeRecursos, negocioPorDefecto: string): PiezaGoogle {
  const activos = g.recursos.filter((r) => (r.estado ?? "ENABLED") !== "REMOVED");
  const textos = (campo: string) => activos.filter((r) => r.campo === campo && r.texto).map((r) => r.texto as string);
  const dominio = dominioDe(g.urlsFinales[0]);
  const imagenes: ImagenGoogle[] = [];
  let logo: string | null = null;
  for (const r of activos) {
    const forma = FORMA_DE_CAMPO[r.campo];
    if (!forma || !r.imagenUrl) continue;
    if (forma === "logo") logo = logo ?? r.imagenUrl;
    else imagenes.push({ url: r.imagenUrl, forma });
  }
  return {
    familia: "pmax",
    negocio: textos("BUSINESS_NAME")[0] ?? negocioPorDefecto,
    dominio,
    urlVisible: urlVisibleDe(dominio, g.path1, g.path2),
    titulares: textos("HEADLINE"),
    titularesLargos: textos("LONG_HEADLINE"),
    descripciones: textos("DESCRIPTION"),
    imagenes,
    logo,
    videoYoutube: activos.find((r) => r.campo === "YOUTUBE_VIDEO" && r.videoYoutube)?.videoYoutube ?? null,
    cta: CTA_POR_DEFECTO,
  };
}

/** `LEARN_MORE` → «Más información». Lo que no se conoce se deja tal cual, en minúsculas legibles. */
const CTAS: Record<string, string> = {
  LEARN_MORE: "Más información",
  SHOP_NOW: "Comprar ahora",
  SIGN_UP: "Registrarse",
  BOOK_NOW: "Reservar",
  CONTACT_US: "Contactar",
  APPLY_NOW: "Solicitar",
  GET_QUOTE: "Pedir cotización",
  DOWNLOAD: "Descargar",
  VISIT_SITE: "Visitar el sitio",
  SUBSCRIBE: "Suscribirse",
  WATCH_MORE: "Ver más",
};
export function humanizarCta(cta: string): string {
  const clave = cta.trim().toUpperCase();
  if (CTAS[clave]) return CTAS[clave];
  const legible = cta.replace(/_/g, " ").toLowerCase();
  return legible.charAt(0).toUpperCase() + legible.slice(1);
}

/** La mejor imagen para un formato: Display y Discover prefieren la horizontal; Gmail y Maps, la cuadrada. */
export function imagenPara(p: PiezaGoogle, formato: FormatoGoogle, indice = 0): ImagenGoogle | null {
  const orden: ImagenGoogle["forma"][] =
    formato === "gmail" || formato === "maps" ? ["cuadrada", "horizontal", "vertical"] : ["horizontal", "cuadrada", "vertical"];
  for (const forma of orden) {
    const de = p.imagenes.filter((i) => i.forma === forma);
    if (de.length > 0) return de[indice % de.length];
  }
  // Un anuncio solo de video no trae imágenes: Google usa un fotograma del video.
  return p.videoYoutube ? { url: miniaturaYoutube(p.videoYoutube), forma: "horizontal" } : null;
}

/** La miniatura pública de un video de YouTube. */
export function miniaturaYoutube(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

/** Titulares combinados como Búsqueda: «Titular 1 | Titular 2 | Titular 3», recortados a lo que cabe en 90 caracteres. */
export function titularDeBusqueda(titulares: string[]): string {
  const salida: string[] = [];
  let largo = 0;
  for (const t of titulares.slice(0, 3)) {
    const nuevo = largo + t.length + (salida.length > 0 ? 3 : 0);
    if (nuevo > 90) break;
    salida.push(t);
    largo = nuevo;
  }
  return salida.join(" | ");
}
