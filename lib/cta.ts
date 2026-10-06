/**
 * Botones de acción (CTA) de un anuncio de Meta: la lista COMPLETA que aceptan
 * `create_ad` y `update_ad_creative` en Windsor (`list_actions`, verificado el
 * 2026-09-29), con su etiqueta en español. El Constructor y el editor de
 * anuncios leen de acá, para que ofrezcan exactamente lo mismo.
 *
 * Antes se ofrecían 10. Meta acepta más de 70; algunos solo tienen sentido con
 * un destino concreto (llamar, WhatsApp, instalar una app, un evento…): si el
 * anuncio no lo tiene, Meta rechaza el cambio y ese error se muestra tal cual,
 * no se adivina acá qué combinación es válida.
 */

/** Los que se usan a diario: van primero en cualquier selector. */
export const CTA_COMUNES = [
  "LEARN_MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "CONTACT_US",
  "GET_QUOTE",
  "BOOK_NOW",
  "DOWNLOAD",
  "SUBSCRIBE",
  "WHATSAPP_MESSAGE",
  "MESSAGE_PAGE",
  "CALL_NOW",
  "APPLY_NOW",
  "ORDER_NOW",
  "GET_OFFER",
  "WATCH_MORE",
  "SEE_MORE",
  "NO_BUTTON",
] as const;

const ETIQUETAS_RESTO = {
  ADD_TO_CART: "Añadir al carrito",
  AUDIO_CALL: "Llamada de audio",
  BOOK_TRAVEL: "Reservar viaje",
  BUY: "Comprar",
  BUY_NOW: "Comprar ahora",
  BUY_TICKETS: "Comprar entradas",
  CALL: "Llamar",
  CALL_ME: "Llámame",
  CONFIRM: "Confirmar",
  CONTACT: "Contactar",
  DONATE: "Donar",
  DONATE_NOW: "Donar ahora",
  EVENT_RSVP: "Confirmar asistencia",
  FIND_A_GROUP: "Buscar un grupo",
  FIND_YOUR_GROUPS: "Encuentra tus grupos",
  FOLLOW_NEWS_STORYLINE: "Seguir la noticia",
  FOLLOW_PAGE: "Seguir la página",
  FOLLOW_USER: "Seguir",
  GET_DIRECTIONS: "Cómo llegar",
  GET_OFFER_VIEW: "Ver oferta",
  GET_PROMOTIONS: "Ver promociones",
  GET_SHOWTIMES: "Ver horarios",
  GET_STARTED: "Comenzar",
  INQUIRE_NOW: "Consultar ahora",
  INSTALL_APP: "Instalar la app",
  INSTALL_MOBILE_APP: "Instalar la app móvil",
  LIKE_PAGE: "Me gusta",
  LISTEN_MUSIC: "Escuchar música",
  LISTEN_NOW: "Escuchar ahora",
  MOBILE_DOWNLOAD: "Descargar (móvil)",
  OPEN_INSTANT_APP: "Abrir app instantánea",
  OPEN_LINK: "Abrir enlace",
  PAY_TO_ACCESS: "Pagar para acceder",
  PLAY_GAME: "Jugar",
  PLAY_GAME_ON_FACEBOOK: "Jugar en Facebook",
  PURCHASE_GIFT_CARDS: "Comprar tarjetas de regalo",
  RAISE_MONEY: "Recaudar fondos",
  RECORD_NOW: "Grabar ahora",
  REFER_FRIENDS: "Invitar amigos",
  REQUEST_TIME: "Solicitar horario",
  SAY_THANKS: "Dar las gracias",
  SELL_NOW: "Vender ahora",
  SEND_A_GIFT: "Enviar un regalo",
  SEND_GIFT_MONEY: "Enviar dinero de regalo",
  SEND_UPDATES: "Enviar novedades",
  SHARE: "Compartir",
  SOTTO_SUBSCRIBE: "Suscribirse (Sotto)",
  START_ORDER: "Iniciar pedido",
  SWIPE_UP_PRODUCT: "Desliza hacia arriba: producto",
  SWIPE_UP_SHOP: "Desliza hacia arriba: tienda",
  UPDATE_APP: "Actualizar la app",
  USE_APP: "Usar la app",
  USE_MOBILE_APP: "Usar la app móvil",
  VIDEO_ANNOTATION: "Anotación de video",
  VIDEO_CALL: "Videollamada",
  VISIT_PAGES_FEED: "Ver publicaciones de la página",
  WATCH_VIDEO: "Ver video",
  WOODHENGE_SUPPORT: "Apoyar",
} as const;

const ETIQUETAS_COMUNES: Record<(typeof CTA_COMUNES)[number], string> = {
  LEARN_MORE: "Más información",
  SHOP_NOW: "Comprar ahora",
  SIGN_UP: "Registrarse",
  CONTACT_US: "Contáctanos",
  GET_QUOTE: "Cotizar",
  BOOK_NOW: "Reservar",
  DOWNLOAD: "Descargar",
  SUBSCRIBE: "Suscribirse",
  WHATSAPP_MESSAGE: "Enviar WhatsApp",
  MESSAGE_PAGE: "Enviar mensaje",
  CALL_NOW: "Llamar ahora",
  APPLY_NOW: "Solicitar ahora",
  ORDER_NOW: "Pedir ahora",
  GET_OFFER: "Obtener oferta",
  WATCH_MORE: "Ver más",
  SEE_MORE: "Ver más",
  NO_BUTTON: "Sin botón",
};

export type CtaComun = (typeof CTA_COMUNES)[number];
export type CtaResto = keyof typeof ETIQUETAS_RESTO;
/** Todo botón que Meta acepta al crear o editar un anuncio. */
export type CallToAction = CtaComun | CtaResto;

export const CTA_ETIQUETAS: Record<CallToAction, string> = {
  ...ETIQUETAS_COMUNES,
  ...ETIQUETAS_RESTO,
};

/** Comunes primero, el resto en orden alfabético de su etiqueta en español. */
export const CTA_CODIGOS: CallToAction[] = [
  ...CTA_COMUNES,
  ...(Object.keys(ETIQUETAS_RESTO) as CtaResto[]).sort((a, b) =>
    ETIQUETAS_RESTO[a].localeCompare(ETIQUETAS_RESTO[b], "es"),
  ),
];

/**
 * Botones que Meta muestra en un anuncio pero que NO acepta al crear o editar
 * (llegan de anuncios armados desde una publicación, por ejemplo). Solo se leen.
 */
const SOLO_LECTURA: Record<string, string> = {
  VIEW_INSTAGRAM_PROFILE: "Ver perfil de Instagram",
  VISIT_PROFILE: "Visitar el perfil",
};

export function esCta(valor: string): valor is CallToAction {
  return Object.prototype.hasOwnProperty.call(CTA_ETIQUETAS, valor);
}

/**
 * Etiqueta en español de cualquier botón, incluso uno que no se puede elegir.
 * Un código desconocido se muestra tal cual: feo pero honesto.
 */
export function etiquetaCta(codigo: string | null | undefined): string {
  if (!codigo) return "—";
  return esCta(codigo) ? CTA_ETIQUETAS[codigo] : (SOLO_LECTURA[codigo] ?? codigo);
}

/** Botones que exigen un destino concreto; Meta rechaza el cambio si el anuncio no lo tiene. */
export const CTA_CON_DESTINO = new Set<string>([
  "CALL_NOW", "CALL", "CALL_ME", "AUDIO_CALL", "VIDEO_CALL",
  "WHATSAPP_MESSAGE", "MESSAGE_PAGE",
  "INSTALL_APP", "INSTALL_MOBILE_APP", "USE_APP", "USE_MOBILE_APP", "UPDATE_APP", "MOBILE_DOWNLOAD", "OPEN_INSTANT_APP",
  "EVENT_RSVP", "FOLLOW_PAGE", "LIKE_PAGE", "VISIT_PAGES_FEED",
  "GET_DIRECTIONS", "GET_SHOWTIMES", "PLAY_GAME_ON_FACEBOOK",
]);
