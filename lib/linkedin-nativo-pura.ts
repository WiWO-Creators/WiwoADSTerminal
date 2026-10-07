/**
 * LinkedIn directo (Advertising API y Lead Sync API): la parte pura, sin red ni `env`, para poder probarla sola.
 * La parte que llama a LinkedIn está en `linkedin-nativo.ts`.
 *
 * SIN VERIFICAR contra la API real: la app «WiwoAds» de LinkedIn todavía no tiene los productos aprobados, así que
 * los nombres de alcances, rutas y campos salen de la documentación de LinkedIn y NO de una respuesta real. Cuando
 * lleguen las credenciales hay que contrastar cada forma contra una cuenta real (como se hizo con Windsor) antes de
 * confiar en ella. Las filas que produce `filaDeAnalytics` usan los nombres de Windsor para que `adaptarFilaLinkedin`
 * (lib/linkedin.ts) las entienda sin un camino aparte.
 */
import type { FilaCruda } from "@/lib/linkedin";

/**
 * Cabecera `Linkedin-Version` (AAAAMM). LinkedIn retira versiones viejas (la 202510 se retira el 2026-10-15; la más nueva
 * documentada al 2026-10-06 es la 202609): si falla con 426, subirla con `LINKEDIN_API_VERSION`.
 */
export const VERSION_API_POR_DEFECTO = "202609";

/** Alcances por producto. Se pide solo lo que ya esté aprobado: uno no aprobado hace fallar toda la autorización. */
export const ALCANCES = {
  /** Advertising API: leer cuentas, campañas y creativos / leer métricas. */
  lectura: ["r_ads", "r_ads_reporting"],
  /** Advertising API: crear, editar, pausar y activar grupos, campañas y presupuestos. */
  administrar: ["rw_ads"],
  /**
   * Advertising API: lo que hace falta para CREAR ANUNCIOS. Un anuncio apunta a una publicación de una página de empresa:
   * ver qué páginas administra la persona (`r_organization_admin`), leer sus publicaciones para patrocinar una existente
   * (`r_organization_social`) y crear la publicación «oculta» del anuncio (`w_organization_social`). Comprobado el
   * 2026-10-07: LinkedIn los acepta para esta app sin pedir ningún otro producto.
   */
  anuncios: ["r_organization_admin", "r_organization_social", "w_organization_social"],
  /** Lead Sync API: leer las respuestas de los formularios. */
  leads: ["r_marketing_leadgen_automation"],
} as const;

export class ErrorDeLinkedin extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------- OAuth

export function urlDeAutorizacion(datos: { clientId: string; redirectUri: string; state: string; alcances: readonly string[] }): string {
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", datos.clientId);
  url.searchParams.set("redirect_uri", datos.redirectUri);
  url.searchParams.set("state", datos.state);
  url.searchParams.set("scope", datos.alcances.join(" "));
  return url.toString();
}

export function cuerpoCanjeDeCodigo(datos: { code: string; clientId: string; clientSecret: string; redirectUri: string }): URLSearchParams {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code: datos.code,
    client_id: datos.clientId,
    client_secret: datos.clientSecret,
    redirect_uri: datos.redirectUri,
  });
}

/** LinkedIn solo entrega `refresh_token` a las apps con ciertos productos aprobados; sin él hay que reconectar a los 60 días. */
export function cuerpoDeRenovacion(datos: { refreshToken: string; clientId: string; clientSecret: string }): URLSearchParams {
  return new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: datos.refreshToken,
    client_id: datos.clientId,
    client_secret: datos.clientSecret,
  });
}

export type TokensLinkedin = { accessToken: string; refreshToken: string | null; expiraEn: number | null; alcances: string };

/** Lo que devuelve `oauth/v2/accessToken`, con la caducidad en milisegundos absolutos. */
export function tokensDeRespuesta(cuerpo: Record<string, unknown>, ahora: number): TokensLinkedin {
  const accessToken = typeof cuerpo.access_token === "string" ? cuerpo.access_token : "";
  if (!accessToken) throw new ErrorDeLinkedin("LinkedIn no devolvió un token de acceso.", 502);
  const segundos = Number(cuerpo.expires_in);
  return {
    accessToken,
    refreshToken: typeof cuerpo.refresh_token === "string" ? cuerpo.refresh_token : null,
    expiraEn: Number.isFinite(segundos) && segundos > 0 ? ahora + segundos * 1000 : null,
    alcances: typeof cuerpo.scope === "string" ? cuerpo.scope : "",
  };
}

// ---------------------------------------------------------------- URN y fechas (formato Rest.li)

export const urnCuenta = (id: string | number): string => `urn:li:sponsoredAccount:${id}`;
export const urnCampana = (id: string | number): string => `urn:li:sponsoredCampaign:${id}`;
export const urnGrupo = (id: string | number): string => `urn:li:sponsoredCampaignGroup:${id}`;
/** El id numérico al final de un URN (o el mismo valor si ya era un id). */
export const idDeUrn = (urn: unknown): string => String(urn ?? "").split(":").pop() ?? "";

const SOLO_ID = /^\d+$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-10-05` → `(year:2026,month:10,day:5)`. Rest.li no admite ceros a la izquierda en mes y día. */
export function fechaRest(fecha: string): string {
  const m = FECHA.exec(fecha);
  if (!m) throw new ErrorDeLinkedin(`Fecha inválida para LinkedIn: ${fecha}`, 400);
  return `(year:${Number(m[1])},month:${Number(m[2])},day:${Number(m[3])})`;
}

/** Los ids se validan antes de meterlos en la URL: llegan de la base o de la persona, y la ruta se arma como texto. */
export function soloIds(ids: readonly string[], que: string): string[] {
  for (const id of ids) if (!SOLO_ID.test(id)) throw new ErrorDeLinkedin(`Id de ${que} inválido: ${id}`, 400);
  return [...ids];
}

// ---------------------------------------------------------------- Rutas

export const CAMPOS_ANALYTICS = [
  "dateRange",
  "pivotValues",
  "impressions",
  "clicks",
  "costInLocalCurrency",
  "landingPageClicks",
  "totalEngagements",
  "oneClickLeads",
  "externalWebsiteConversions",
  "approximateMemberReach",
] as const;

/**
 * Métricas diarias por campaña (en la API, «campaign» es el conjunto de anuncios de WiWO.ADS). Se arma como texto y no con
 * `URLSearchParams` porque Rest.li usa paréntesis y dos puntos literales en los valores compuestos; solo los URN van codificados.
 */
export function rutaDeAnalytics(datos: { cuentaId: string; desde: string; hasta: string; pivote?: "CAMPAIGN" | "CAMPAIGN_GROUP" | "CREATIVE" }): string {
  const [cuenta] = soloIds([datos.cuentaId], "cuenta");
  const partes = [
    "q=analytics",
    `pivot=${datos.pivote ?? "CAMPAIGN"}`,
    "timeGranularity=DAILY",
    `dateRange=(start:${fechaRest(datos.desde)},end:${fechaRest(datos.hasta)})`,
    `accounts=List(${encodeURIComponent(urnCuenta(cuenta))})`,
    `fields=${CAMPOS_ANALYTICS.join(",")}`,
  ];
  return `/rest/adAnalytics?${partes.join("&")}`;
}

export function rutaDeCampanas(cuentaId: string): string {
  const [cuenta] = soloIds([cuentaId], "cuenta");
  return `/rest/adAccounts/${cuenta}/adCampaigns?q=search&pageSize=100`;
}

export function rutaDeGrupos(cuentaId: string): string {
  const [cuenta] = soloIds([cuentaId], "cuenta");
  return `/rest/adAccounts/${cuenta}/adCampaignGroups?q=search&pageSize=100`;
}

export const rutaDeCuentas = (): string => "/rest/adAccounts?q=search&pageSize=100";

export function rutaDeLeads(cuentaId: string): string {
  const [cuenta] = soloIds([cuentaId], "cuenta");
  return `/rest/leadFormResponses?q=owner&owner=(sponsoredAccount:${encodeURIComponent(urnCuenta(cuenta))})&leadType=(leadType:SPONSORED)&count=100`;
}

// ---------------------------------------------------------------- Lectura de respuestas

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Los `elements` de una respuesta de LinkedIn (vacío si no vienen). */
export function elementos(cuerpo: unknown): Obj[] {
  if (!esObj(cuerpo) || !Array.isArray(cuerpo.elements)) return [];
  return cuerpo.elements.filter(esObj);
}

/** El mensaje de error de LinkedIn, sin volcar el cuerpo entero. */
export function mensajeDeError(cuerpo: unknown, status: number): string {
  const msg = esObj(cuerpo) && typeof cuerpo.message === "string" ? cuerpo.message : "";
  if (status === 401) return "El token de LinkedIn venció o fue revocado: hay que reconectar.";
  if (status === 403) return `LinkedIn negó el acceso (falta un producto aprobado o un alcance). ${msg}`.trim();
  if (status === 426) return "LinkedIn retiró esta versión de la API: actualizar LINKEDIN_API_VERSION.";
  if (status === 429) return "LinkedIn limitó las llamadas (429): reintentar más tarde.";
  return `LinkedIn respondió ${status}. ${msg}`.trim();
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Un elemento de `adAnalytics` (diario, por campaña) con los nombres de Windsor, listo para `adaptarFilaLinkedin`.
 * `costInLocalCurrency` llega como texto con decimales en la moneda de la cuenta.
 */
export function filaDeAnalytics(el: Obj, cuenta: { id: string; nombre?: string; moneda?: string }): FilaCruda {
  const inicio = esObj(el.dateRange) && esObj(el.dateRange.start) ? el.dateRange.start : null;
  const fecha = inicio
    ? `${numero(inicio.year)}-${String(numero(inicio.month)).padStart(2, "0")}-${String(numero(inicio.day)).padStart(2, "0")}`
    : null;
  const pivote = Array.isArray(el.pivotValues) ? el.pivotValues[0] : null;
  return {
    date: fecha,
    account_id: cuenta.id,
    account_name: cuenta.nombre ?? null,
    currency: cuenta.moneda ?? null,
    campaign_id: pivote ? idDeUrn(pivote) : null,
    spend: numero(el.costInLocalCurrency),
    impressions: numero(el.impressions),
    clicks: numero(el.clicks),
    landingpageclicks: numero(el.landingPageClicks),
    engagements: numero(el.totalEngagements),
    oneclickleads: numero(el.oneClickLeads),
    externalwebsiteconversions: numero(el.externalWebsiteConversions),
    approximate_unique_impressions: numero(el.approximateMemberReach),
  };
}

export type RespuestaDeLead = {
  id: string;
  enviadoEn: number | null;
  formularioId: string | null;
  campanaId: string | null;
  respuestas: { pregunta: string; respuesta: string }[];
};

/**
 * Una respuesta de formulario. Contiene datos personales: quien la use no debe guardarla en logs ni en la bitácora
 * (mismo criterio que Audiencias: la bitácora registra cuántos, nunca quiénes).
 */
export function respuestaDeLead(el: Obj): RespuestaDeLead {
  const formulario = esObj(el.formResponse) ? el.formResponse : {};
  const respuestas: { pregunta: string; respuesta: string }[] = [];
  const brutas = Array.isArray(formulario.answers) ? formulario.answers : [];
  for (const r of brutas) {
    if (!esObj(r)) continue;
    const detalle = esObj(r.answerDetails) ? r.answerDetails : {};
    const texto = esObj(detalle.textQuestionAnswer) ? detalle.textQuestionAnswer.answer : undefined;
    if (typeof texto === "string" && texto !== "") respuestas.push({ pregunta: String(r.questionId ?? ""), respuesta: texto });
  }
  const enviado = Number(el.submittedAt);
  return {
    id: String(el.id ?? ""),
    enviadoEn: Number.isFinite(enviado) && enviado > 0 ? enviado : null,
    formularioId: el.versionedForm ? idDeUrn(el.versionedForm) : null,
    campanaId: el.associatedEntity ? idDeUrn(el.associatedEntity) : null,
    respuestas,
  };
}

// ---------------------------------------------------------------- Cuenta publicitaria de PRUEBA

const MONEDA = /^[A-Z]{3}$/;

export type CuerpoDeCuentaDePrueba = {
  currency: string;
  name: string;
  type: "BUSINESS";
  test: true;
  notifiedOnCampaignOptimization: false;
  notifiedOnCreativeApproval: false;
  notifiedOnCreativeRejection: false;
  notifiedOnEndOfCampaign: false;
  reference?: string;
};

/**
 * El cuerpo EXACTO que se enviaría a `POST /rest/adAccounts` para crear la cuenta de prueba (documentación de LinkedIn,
 * «Working with Test Ad Accounts»). `test: true` solo se puede fijar al crear y es inmutable; hay una sola por app.
 * `reference` (la organización) es opcional y solo se manda si se pide: una cuenta de prueba no la necesita.
 * Las notificaciones van apagadas para no escribirle a nadie por una cuenta que nunca sirve anuncios.
 */
export function cuerpoDeCuentaDePrueba(datos: { nombre?: string; moneda?: string; organizacionId?: string } = {}): CuerpoDeCuentaDePrueba {
  const name = (datos.nombre ?? "WiWO.ADS - Cuenta de prueba").trim();
  if (name.length < 1 || name.length > 100) throw new ErrorDeLinkedin("El nombre de la cuenta de prueba debe tener entre 1 y 100 caracteres.", 400);
  const currency = (datos.moneda ?? "USD").trim().toUpperCase();
  if (!MONEDA.test(currency)) throw new ErrorDeLinkedin(`Moneda inválida: ${datos.moneda}`, 400);
  const cuerpo: CuerpoDeCuentaDePrueba = {
    currency,
    name,
    type: "BUSINESS",
    test: true,
    notifiedOnCampaignOptimization: false,
    notifiedOnCreativeApproval: false,
    notifiedOnCreativeRejection: false,
    notifiedOnEndOfCampaign: false,
  };
  if (datos.organizacionId !== undefined) {
    const [organizacion] = soloIds([datos.organizacionId], "organización");
    cuerpo.reference = `urn:li:organization:${organizacion}`;
  }
  return cuerpo;
}

/** Un id numérico de una cabecera (`x-linkedin-id`, `x-restli-id`…); `null` si no es un número. */
export function idDeCabeceraCreada(valor: string | null | undefined): string | null {
  const id = (valor ?? "").trim();
  return SOLO_ID.test(id) ? id : null;
}

/** Días que le quedan a un token (redondeado hacia abajo); negativo si ya venció; `null` si no se sabe. */
export function diasHastaVencer(expiraEn: number | null, ahora: number): number | null {
  if (expiraEn === null || !Number.isFinite(expiraEn)) return null;
  return Math.floor((expiraEn - ahora) / 86_400_000);
}

/**
 * El id de lo recién creado. Las APIs versionadas (cabecera `Linkedin-Version`) lo devuelven en `x-linkedin-id`; las
 * anteriores, en `x-restli-id`; y como último recurso se lee el final de `location` (`/adAccounts/123`). Se comprobó con la
 * creación real de la cuenta de prueba: `x-restli-id` no vino y la cuenta sí se creó.
 */
export function idDeCreacion(cabeceras: { get(nombre: string): string | null }): string | null {
  for (const nombre of ["x-linkedin-id", "x-restli-id"]) {
    const id = idDeCabeceraCreada(cabeceras.get(nombre));
    if (id) return id;
  }
  const ubicacion = (cabeceras.get("location") ?? "").split("?")[0].split("/").filter(Boolean).pop();
  return idDeCabeceraCreada(ubicacion);
}
