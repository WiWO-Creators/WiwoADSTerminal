/**
 * Anuncios de formulario instantáneo (lead ads) de Meta: lo que se manda para crear el conjunto y el creativo. Puro (sin red).
 *
 * Windsor no deja pasar el id del formulario ni el destino «en el anuncio», así que estos dos pasos se hacen con la API directa de Meta:
 *  - conjunto: `destination_type: ON_AD`, `optimization_goal: LEAD_GENERATION` y `promoted_object: { page_id }`;
 *  - creativo: el botón lleva `lead_gen_form_id` y el enlace es un sitio externo (Meta rechaza la página de Facebook).
 */

export type CuerpoDeConjunto = {
  campaignId: string;
  nombre: string;
  pageId: string;
  /** Presupuesto en la unidad menor de la moneda (5000 = 50,00). `total` exige fecha de fin. */
  presupuesto: { tipo: "total" | "diario"; menor: number } | null;
  /** Fecha `YYYY-MM-DD` (se interpreta en la zona horaria de la cuenta, como en el Administrador). */
  inicio?: string | null;
  fin?: string | null;
  targeting: Record<string, unknown>;
  estado: "ACTIVE" | "PAUSED";
};

const fechaValida = (f: string | null | undefined): f is string => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f);

export function problemasDelConjuntoDeFormulario(c: CuerpoDeConjunto): string[] {
  const p: string[] = [];
  if (!/^\d+$/.test(c.campaignId)) p.push("Falta la campaña del conjunto.");
  if (!/^\d+$/.test(c.pageId)) p.push("Falta la página de Facebook: el formulario instantáneo se publica desde una página.");
  if (!c.nombre.trim()) p.push("El conjunto necesita un nombre.");
  // Sin presupuesto en el conjunto es válido: la campaña lo reparte (presupuesto de campaña).
  if (c.presupuesto !== null && !(c.presupuesto.menor > 0)) p.push("El presupuesto del conjunto debe ser mayor que cero.");
  if (c.presupuesto?.tipo === "total" && !fechaValida(c.fin)) p.push("Un presupuesto total necesita fecha de finalización.");
  if (fechaValida(c.inicio) && fechaValida(c.fin) && c.fin < c.inicio) p.push("La fecha de fin es anterior a la de inicio.");
  return p;
}

/** Los parámetros de `POST /act_{id}/adsets`. */
export function cuerpoDeConjunto(c: CuerpoDeConjunto): Record<string, unknown> {
  return {
    name: c.nombre.slice(0, 400),
    campaign_id: c.campaignId,
    destination_type: "ON_AD",
    optimization_goal: "LEAD_GENERATION",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    promoted_object: { page_id: c.pageId },
    ...(c.presupuesto ? (c.presupuesto.tipo === "total" ? { lifetime_budget: Math.round(c.presupuesto.menor) } : { daily_budget: Math.round(c.presupuesto.menor) }) : {}),
    ...(fechaValida(c.inicio) ? { start_time: `${c.inicio}T00:00:00` } : {}),
    ...(fechaValida(c.fin) ? { end_time: `${c.fin}T23:59:00` } : {}),
    targeting: c.targeting,
    status: c.estado,
  };
}

export type CreativoDeFormulario = {
  nombre: string;
  pageId: string;
  formularioId: string;
  /** A dónde lleva el anuncio: Meta exige un sitio EXTERNO (no la página de Facebook) en un anuncio de formulario. */
  enlace: string;
  mensaje: string;
  titulo?: string;
  descripcion?: string;
  /** Botón de Meta; con formulario los válidos son estos. */
  boton?: string;
  /** Una imagen ya subida (hash) o un video ya subido con su miniatura. */
  imageHash?: string;
  video?: { id: string; miniaturaUrl: string };
};

/** Los botones que Meta admite en un anuncio de formulario. */
export const BOTONES_DE_FORMULARIO = ["SIGN_UP", "LEARN_MORE", "APPLY_NOW", "GET_QUOTE", "SUBSCRIBE", "DOWNLOAD", "BOOK_TRAVEL", "CONTACT_US"] as const;

export function problemasDelCreativo(c: CreativoDeFormulario): string[] {
  const p: string[] = [];
  if (!/^\d+$/.test(c.pageId)) p.push("Falta la página de Facebook.");
  if (!/^\d+$/.test(c.formularioId)) p.push("Falta el formulario instantáneo del anuncio.");
  if (!c.mensaje.trim()) p.push("Falta el texto principal del anuncio.");
  if (!/^https:\/\/[^\s]+\.[^\s]+/i.test(c.enlace)) p.push("Un anuncio de formulario necesita una URL de destino https:// de un sitio externo: Meta no acepta la página de Facebook.");
  if (!c.imageHash && !c.video) p.push("Falta la imagen o el video del anuncio.");
  if (c.video && !/^https:\/\//i.test(c.video.miniaturaUrl)) p.push("El video necesita una miniatura.");
  if (c.boton && !(BOTONES_DE_FORMULARIO as readonly string[]).includes(c.boton)) p.push(`El botón «${c.boton}» no sirve para un formulario instantáneo.`);
  return p;
}

/** Los parámetros de `POST /act_{id}/adcreatives`. */
export function cuerpoDeCreativo(c: CreativoDeFormulario): Record<string, unknown> {
  const boton = { type: c.boton ?? "SIGN_UP", value: { lead_gen_form_id: c.formularioId } };
  return {
    name: c.nombre.slice(0, 100),
    object_story_spec: c.video
      ? {
          page_id: c.pageId,
          video_data: {
            video_id: c.video.id,
            image_url: c.video.miniaturaUrl,
            message: c.mensaje,
            ...(c.titulo ? { title: c.titulo } : {}),
            ...(c.descripcion ? { link_description: c.descripcion } : {}),
            call_to_action: boton,
          },
        }
      : {
          page_id: c.pageId,
          link_data: {
            link: c.enlace,
            message: c.mensaje,
            image_hash: c.imageHash,
            ...(c.titulo ? { name: c.titulo } : {}),
            ...(c.descripcion ? { description: c.descripcion } : {}),
            call_to_action: boton,
          },
        },
  };
}
