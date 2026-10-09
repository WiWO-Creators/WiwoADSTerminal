import { registrarEscritura } from "@/lib/escrituras";
/**
 * Cliente directo de la API de Google Ads, para lo que Windsor no cubre.
 *
 * Windsor solo entrega por REST las entidades con actividad en el rango (un
 * anuncio pausado o recién creado no aparece) y no tiene ninguna acción para
 * editar el contenido de un anuncio existente. Los dos límites son de Windsor,
 * no de Google: la API oficial lee cualquier anuncio y permite editar sus
 * titulares, descripciones y URLs sin cambiar su id.
 *
 * Es puro a propósito —recibe las credenciales, no las busca— para poder
 * probarlo con `fetch` simulado. Quien obtiene y refresca el token es
 * `accesoNativoGoogle` (`integration-store.ts`).
 *
 * **Escribe en cuentas reales.** Nada en este archivo se ejecuta solo: la
 * única función que muta es `actualizarAnuncioRsa`, y admite `validateOnly`
 * (Google valida el cambio completo sin aplicarlo) para poder simular.
 */

export type CredencialesGoogle = {
  accessToken: string;
  developerToken: string;
  apiVersion: string;
  /** Cuenta administradora (MCC) por la que se accede, si la cuenta es de cliente. */
  managerId: string | null;
};

export class GoogleAdsNativoError extends Error {
  readonly status: number;
  /** true: el token no sirve; hay que volver a conectar la cuenta de Google. */
  readonly requiereAutorizar: boolean;
  /** Detalle técnico de Google, para la bitácora; no para mostrar tal cual. */
  readonly detalle: unknown;

  // Campos explícitos y no propiedades de parámetro: los tests corren este
  // archivo con Node directo (solo quita tipos) y esa sintaxis no la admite.
  constructor(message: string, status: number, requiereAutorizar = false, detalle: unknown = null) {
    super(message);
    this.status = status;
    this.requiereAutorizar = requiereAutorizar;
    this.detalle = detalle;
  }
}

const soloDigitos = (valor: string): string => valor.replace(/\D/g, "");

/** Ids de Google Ads son numéricos. Se validan antes de ir a una consulta GAQL. */
export function idNumerico(valor: string): string {
  const limpio = soloDigitos(valor);
  if (!limpio || limpio !== valor.replace(/-/g, "").trim()) {
    throw new GoogleAdsNativoError(`Identificador no válido: "${valor}"`, 400);
  }
  return limpio;
}

function cabeceras(cred: CredencialesGoogle): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${cred.accessToken}`,
    "content-type": "application/json",
    "developer-token": cred.developerToken,
  };
  if (cred.managerId) headers["login-customer-id"] = soloDigitos(cred.managerId);
  return headers;
}

type ErrorDeGoogle = {
  error?: { code?: number; message?: string; status?: string; details?: unknown };
};

/** Los primeros motivos que Google da en un rechazo (400), con el campo al que se refieren. Son suyos, no hay datos sensibles. */
function motivosDeGoogle(detalle: unknown): string {
  const detalles = (detalle as { details?: unknown } | null)?.details;
  if (!Array.isArray(detalles)) return "";
  const textos: string[] = [];
  for (const d of detalles as Array<{ errors?: Array<{ message?: string; location?: { fieldPathElements?: Array<{ fieldName?: string }> } }> }>) {
    for (const e of d.errors ?? []) {
      const campo = (e.location?.fieldPathElements ?? []).map((f) => f.fieldName).filter(Boolean).join(".");
      if (e.message) textos.push(campo ? `${e.message} (${campo})` : e.message);
    }
  }
  return textos.slice(0, 5).join(" · ");
}

function mensajePublico(status: number, codigo?: string): string {
  if (status === 401 || codigo === "UNAUTHENTICATED") {
    return "Google rechazó la conexión. Vuelve a conectar tu cuenta de Google en Integraciones.";
  }
  if (status === 403 || codigo === "PERMISSION_DENIED") {
    return "Tu cuenta de Google no tiene permiso sobre esta cuenta publicitaria.";
  }
  if (status === 429) return "Google Ads pidió esperar (límite de uso). Intenta de nuevo en un momento.";
  if (status >= 500) return "Google Ads no respondió. Intenta de nuevo en un momento.";
  return "Google Ads rechazó la solicitud.";
}

async function llamar<T>(
  cred: CredencialesGoogle,
  ruta: string,
  cuerpo: unknown,
  timeoutMs = 30_000,
): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`https://googleads.googleapis.com/${cred.apiVersion}/${ruta}`, {
      method: "POST",
      headers: cabeceras(cred),
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new GoogleAdsNativoError(
      "No se pudo contactar a Google Ads. Intenta de nuevo en un momento.",
      504,
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
  const json = (await respuesta.json().catch(() => null)) as T | ErrorDeGoogle | null;
  const error = !Array.isArray(json) && json ? (json as ErrorDeGoogle).error : undefined;
  if (!respuesta.ok || error) {
    const status = respuesta.ok ? 502 : respuesta.status;
    const motivos = status === 400 ? motivosDeGoogle(error) : "";
    throw new GoogleAdsNativoError(
      motivos ? `${mensajePublico(status, error?.status)} ${motivos}` : mensajePublico(status, error?.status),
      status,
      status === 401 || error?.status === "UNAUTHENTICATED",
      error ?? json,
    );
  }
  return json as T;
}

/* -------------------------------------------------------------------------- */
/* Lectura (GAQL)                                                             */
/* -------------------------------------------------------------------------- */

export type FilaGaql = Record<string, unknown>;

export async function consultarGaql(
  cred: CredencialesGoogle,
  customerId: string,
  consulta: string,
): Promise<FilaGaql[]> {
  const trozos = await llamar<Array<{ results?: FilaGaql[] }>>(
    cred,
    `customers/${idNumerico(customerId)}/googleAds:searchStream`,
    { query: consulta },
  );
  return (Array.isArray(trozos) ? trozos : []).flatMap((t) => t.results ?? []);
}

/** Todo lo de un tipo salvo lo eliminado, con o sin actividad. */
export const GAQL_CAMPANAS = [
  "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,",
  "campaign.bidding_strategy_type, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.period,",
  "campaign.target_cpa.target_cpa_micros, campaign.maximize_conversions.target_cpa_micros,",
  "campaign.target_roas.target_roas, campaign.network_settings.target_google_search,",
  "campaign.network_settings.target_search_network, campaign.network_settings.target_content_network,",
  "campaign.tracking_url_template, campaign.start_date_time, campaign.end_date_time,",
  "campaign.ad_serving_optimization_status, campaign.geo_target_type_setting.positive_geo_target_type",
  "FROM campaign WHERE campaign.status != 'REMOVED'",
].join(" ");

export const GAQL_GRUPOS = [
  "SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type,",
  "ad_group.cpc_bid_micros, ad_group.target_cpa_micros, ad_group.target_roas, campaign.id",
  "FROM ad_group WHERE ad_group.status != 'REMOVED'",
].join(" ");

/** Palabras clave positivas (no negativas ni eliminadas), con o sin actividad. */
export const GAQL_PALABRAS = [
  "SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,",
  "ad_group_criterion.keyword.match_type, ad_group_criterion.status,",
  "ad_group_criterion.cpc_bid_micros, ad_group.id",
  "FROM ad_group_criterion",
  "WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE",
  "AND ad_group_criterion.status != 'REMOVED'",
].join(" ");

/** Performance Max: sus grupos de recursos (no tiene grupos de anuncios ni anuncios sueltos). */
export const GAQL_GRUPOS_DE_RECURSOS = [
  "SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.final_urls,",
  "asset_group.path1, asset_group.path2, campaign.id",
  "FROM asset_group WHERE asset_group.status != 'REMOVED'",
].join(" ");

/** Los recursos (textos, imágenes, videos, logos) de cada grupo de recursos. */
export const GAQL_RECURSOS_DE_GRUPO = [
  "SELECT asset_group.id, asset_group_asset.field_type, asset_group_asset.status,",
  "asset.id, asset.name, asset.text_asset.text, asset.image_asset.full_size.url,",
  "asset.youtube_video_asset.youtube_video_id",
  "FROM asset_group_asset WHERE asset_group_asset.status != 'REMOVED'",
].join(" ");

export const GAQL_ANUNCIOS = [
  "SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status,",
  "ad_group_ad.ad.final_urls, ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.display_url,",
  "ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,",
  "ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2,",
  "ad_group_ad.policy_summary.approval_status, ad_group.id, campaign.id",
  "FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'",
].join(" ");

/**
 * Lo visual de los anuncios que no son de búsqueda. Una consulta por familia: si Google cambia o no reconoce un campo en
 * una cuenta, solo falla esa familia y el resto del detalle se lee igual.
 */
const ANUNCIO_VISUAL = "ad_group_ad.ad.id, ad_group_ad.ad.type";
export const GAQL_ANUNCIOS_VISUALES = [
  [
    `SELECT ${ANUNCIO_VISUAL},`,
    "ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.long_headline,",
    "ad_group_ad.ad.responsive_display_ad.descriptions, ad_group_ad.ad.responsive_display_ad.business_name,",
    "ad_group_ad.ad.responsive_display_ad.marketing_images, ad_group_ad.ad.responsive_display_ad.square_marketing_images,",
    "ad_group_ad.ad.responsive_display_ad.logo_images, ad_group_ad.ad.responsive_display_ad.square_logo_images,",
    "ad_group_ad.ad.responsive_display_ad.youtube_videos, ad_group_ad.ad.responsive_display_ad.call_to_action_text",
    "FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'RESPONSIVE_DISPLAY_AD'",
  ].join(" "),
  [
    `SELECT ${ANUNCIO_VISUAL},`,
    "ad_group_ad.ad.video_responsive_ad.headlines, ad_group_ad.ad.video_responsive_ad.long_headlines,",
    "ad_group_ad.ad.video_responsive_ad.descriptions, ad_group_ad.ad.video_responsive_ad.videos,",
    "ad_group_ad.ad.video_responsive_ad.call_to_actions",
    "FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'VIDEO_RESPONSIVE_AD'",
  ].join(" "),
  [
    `SELECT ${ANUNCIO_VISUAL},`,
    "ad_group_ad.ad.demand_gen_multi_asset_ad.headlines, ad_group_ad.ad.demand_gen_multi_asset_ad.descriptions,",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.business_name, ad_group_ad.ad.demand_gen_multi_asset_ad.call_to_action_text,",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images, ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images,",
    "ad_group_ad.ad.demand_gen_multi_asset_ad.portrait_marketing_images, ad_group_ad.ad.demand_gen_multi_asset_ad.logo_images",
    "FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'DEMAND_GEN_MULTI_ASSET_AD'",
  ].join(" "),
  [
    `SELECT ${ANUNCIO_VISUAL},`,
    "ad_group_ad.ad.demand_gen_video_responsive_ad.headlines, ad_group_ad.ad.demand_gen_video_responsive_ad.long_headlines,",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.descriptions, ad_group_ad.ad.demand_gen_video_responsive_ad.business_name,",
    "ad_group_ad.ad.demand_gen_video_responsive_ad.videos, ad_group_ad.ad.demand_gen_video_responsive_ad.logo_images",
    "FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'DEMAND_GEN_VIDEO_RESPONSIVE_AD'",
  ].join(" "),
] as const;

/** Imágenes y videos de YouTube por nombre de recurso. Se piden de a 100 para no pasarse del tamaño de la consulta. */
export function gaqlDeRecursos(nombres: string[]): string[] {
  const consultas: string[] = [];
  for (let i = 0; i < nombres.length; i += 100) {
    const lista = nombres
      .slice(i, i + 100)
      .filter((n) => /^customers\/\d+\/assets\/\d+$/.test(n))
      .map((n) => `'${n}'`)
      .join(", ");
    if (lista) {
      consultas.push(
        `SELECT asset.resource_name, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.resource_name IN (${lista})`,
      );
    }
  }
  return consultas;
}

/* -------------------------------------------------------------------------- */
/* Escritura: editar un anuncio de búsqueda responsivo                        */
/* -------------------------------------------------------------------------- */

export type TextoParaRsa = { texto: string; fijado?: string | null };

/** Lo que se quiere cambiar. Un campo ausente no se toca. */
export type CambiosRsa = {
  titulares?: TextoParaRsa[];
  descripciones?: TextoParaRsa[];
  urlsFinales?: string[];
  path1?: string;
  path2?: string;
  sufijoUrl?: string;
};

export const LIMITES_RSA = {
  titulares: { min: 3, max: 15, largo: 30 },
  descripciones: { min: 2, max: 4, largo: 90 },
  path: 15,
} as const;

/**
 * Límites de Google Ads para un anuncio responsivo de búsqueda. Se validan
 * acá, antes de llamar, para dar un mensaje claro en vez del error genérico
 * de la API. Devuelve la lista de problemas (vacía si está bien).
 */
export function validarCambiosRsa(cambios: CambiosRsa): string[] {
  const problemas: string[] = [];
  const { titulares: t, descripciones: d } = LIMITES_RSA;

  if (cambios.titulares) {
    if (cambios.titulares.length < t.min || cambios.titulares.length > t.max) {
      problemas.push(`Se necesitan entre ${t.min} y ${t.max} titulares (hay ${cambios.titulares.length}).`);
    }
    cambios.titulares.forEach((x, i) => {
      if (!x.texto.trim()) problemas.push(`El titular ${i + 1} está vacío.`);
      else if (x.texto.length > t.largo) {
        problemas.push(`El titular ${i + 1} tiene ${x.texto.length} caracteres (máximo ${t.largo}).`);
      }
    });
  }
  if (cambios.descripciones) {
    if (cambios.descripciones.length < d.min || cambios.descripciones.length > d.max) {
      problemas.push(`Se necesitan entre ${d.min} y ${d.max} descripciones (hay ${cambios.descripciones.length}).`);
    }
    cambios.descripciones.forEach((x, i) => {
      if (!x.texto.trim()) problemas.push(`La descripción ${i + 1} está vacía.`);
      else if (x.texto.length > d.largo) {
        problemas.push(`La descripción ${i + 1} tiene ${x.texto.length} caracteres (máximo ${d.largo}).`);
      }
    });
  }
  for (const [nombre, valor] of [["path1", cambios.path1], ["path2", cambios.path2]] as const) {
    if (valor !== undefined && valor.length > LIMITES_RSA.path) {
      problemas.push(`${nombre} tiene ${valor.length} caracteres (máximo ${LIMITES_RSA.path}).`);
    }
  }
  if (cambios.path2 && !(cambios.path1 ?? "").trim() && cambios.path1 !== undefined) {
    problemas.push("path2 exige path1.");
  }
  if (cambios.urlsFinales) {
    if (cambios.urlsFinales.length === 0) problemas.push("Falta la URL final.");
    for (const url of cambios.urlsFinales) {
      if (!/^https?:\/\/[^\s]+$/i.test(url)) problemas.push(`La URL final "${url}" no es válida.`);
    }
  }
  if (Object.keys(cambios).length === 0) problemas.push("No hay ningún cambio que aplicar.");
  return problemas;
}

/** Cuerpo exacto de la mutación de `AdService`, sin llamarla (para mostrarlo en la simulación). */
export function armarMutacionRsa(
  customerId: string,
  adId: string,
  cambios: CambiosRsa,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): { ruta: string; cuerpo: Record<string, unknown> } {
  const cliente = idNumerico(customerId);
  const anuncio = idNumerico(adId);
  const update: Record<string, unknown> = { resourceName: `customers/${cliente}/ads/${anuncio}` };
  const mascara: string[] = [];
  const rsa: Record<string, unknown> = {};

  const asset = (x: TextoParaRsa) => ({
    text: x.texto,
    ...(x.fijado ? { pinnedField: x.fijado } : {}),
  });

  // Google REEMPLAZA la lista completa de titulares/descripciones: por eso
  // siempre se manda entera, nunca solo lo que cambió.
  if (cambios.titulares) {
    rsa.headlines = cambios.titulares.map(asset);
    mascara.push("responsiveSearchAd.headlines");
  }
  if (cambios.descripciones) {
    rsa.descriptions = cambios.descripciones.map(asset);
    mascara.push("responsiveSearchAd.descriptions");
  }
  if (cambios.path1 !== undefined) {
    rsa.path1 = cambios.path1;
    mascara.push("responsiveSearchAd.path1");
  }
  if (cambios.path2 !== undefined) {
    rsa.path2 = cambios.path2;
    mascara.push("responsiveSearchAd.path2");
  }
  if (Object.keys(rsa).length > 0) update.responsiveSearchAd = rsa;
  if (cambios.urlsFinales) {
    update.finalUrls = cambios.urlsFinales;
    mascara.push("finalUrls");
  }
  if (cambios.sufijoUrl !== undefined) {
    update.finalUrlSuffix = cambios.sufijoUrl;
    mascara.push("finalUrlSuffix");
  }

  return {
    ruta: `customers/${cliente}/ads:mutate`,
    cuerpo: {
      operations: [{ updateMask: mascara.join(","), update }],
      validateOnly,
      partialFailure: false,
    },
  };
}

export type ResultadoMutacion = {
  /** true: solo se validó, no se aplicó nada. */
  soloValidado: boolean;
  resourceName: string | null;
};

/**
 * Edita el anuncio en el mismo anuncio (conserva el id). Con `validateOnly`,
 * Google valida el cambio entero contra la cuenta real y no aplica nada:
 * es la simulación fiel. Google vuelve a revisar el anuncio tras editarlo.
 */
export async function actualizarAnuncioRsa(
  cred: CredencialesGoogle,
  customerId: string,
  adId: string,
  cambios: CambiosRsa,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): Promise<ResultadoMutacion> {
  const problemas = validarCambiosRsa(cambios);
  if (problemas.length > 0) {
    throw new GoogleAdsNativoError(problemas.join(" "), 400);
  }
  const { ruta, cuerpo } = armarMutacionRsa(customerId, adId, cambios, { validateOnly });
  if (!validateOnly) registrarEscritura();
  let respuesta: { results?: Array<{ resourceName?: string }> };
  try {
    respuesta = await llamar<{ results?: Array<{ resourceName?: string }> }>(cred, ruta, cuerpo);
  } finally {
    if (!validateOnly) registrarEscritura();
  }
  return {
    soloValidado: validateOnly,
    resourceName: respuesta.results?.[0]?.resourceName ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Crear un anuncio de Display responsivo (con imágenes)                      */
/* -------------------------------------------------------------------------- */

/**
 * Windsor no tiene ninguna acción para crear anuncios con imagen en Google; la API oficial sí. Se crea un
 * **anuncio de Display responsivo**: Google combina las imágenes, el logo y los textos en cada espacio.
 *
 * Dos pasos contra la cuenta real: (1) subir cada imagen como recurso (`assets:mutate`) y (2) crear el
 * anuncio en un grupo de anuncios de Display ya existente apuntando a esos recursos (`adGroupAds:mutate`).
 * El anuncio nace PAUSADO. Ningún paso se ejecuta solo: lo llama el ejecutor del Constructor tras la
 * aprobación de un admin.
 */
export const LIMITES_DISPLAY = {
  titulares: { min: 1, max: 5, largo: 30 },
  tituloLargo: 90,
  descripciones: { min: 1, max: 5, largo: 90 },
  nombreNegocio: 25,
  bytesPorImagen: 5 * 1024 * 1024,
  /** Proporción y tamaño mínimo que exige Google a cada tipo de imagen. */
  paisaje: { ratio: 1.91, minAncho: 600, minAlto: 314 },
  cuadrada: { ratio: 1, minAncho: 300, minAlto: 300 },
  logo: { ratio: 1, minAncho: 128, minAlto: 128 },
} as const;

export type AnuncioDisplay = {
  titulares: string[];
  tituloLargo: string;
  descripciones: string[];
  nombreNegocio: string;
  urlFinal: string;
  /** URLs públicas (https) de las imágenes. Paisaje 1,91:1 y cuadrada 1:1 son obligatorias. */
  imagenPaisajeUrl: string;
  imagenCuadradaUrl: string;
  logoUrl?: string | null;
};

export type DimensionesDeImagen = { ancho: number; alto: number };

/** Ancho y alto de un PNG o JPEG a partir de sus bytes; `null` si no es ninguno de los dos. */
export function dimensionesDeImagen(bytes: Uint8Array): DimensionesDeImagen | null {
  // PNG: firma de 8 bytes, luego el chunk IHDR con ancho y alto de 4 bytes cada uno.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { ancho: v.getUint32(16), alto: v.getUint32(20) };
  }
  // JPEG: se recorren los segmentos hasta uno SOFn, que trae alto y ancho.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marcador = bytes[i + 1];
      if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
        i += 2;
        continue;
      }
      const largo = v.getUint16(i + 2);
      const esSof = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
      if (esSof) return { alto: v.getUint16(i + 5), ancho: v.getUint16(i + 7) };
      i += 2 + largo;
    }
  }
  return null;
}

function problemaDeImagen(
  nombre: string,
  d: DimensionesDeImagen | null,
  regla: { ratio: number; minAncho: number; minAlto: number },
): string | null {
  if (!d) return `${nombre}: solo se admiten imágenes PNG o JPEG.`;
  if (d.ancho < regla.minAncho || d.alto < regla.minAlto) {
    return `${nombre}: mide ${d.ancho}×${d.alto} y Google pide al menos ${regla.minAncho}×${regla.minAlto}.`;
  }
  const ratio = d.ancho / d.alto;
  // Google tolera una diferencia pequeña respecto de la proporción pedida.
  if (Math.abs(ratio - regla.ratio) / regla.ratio > 0.01) {
    return `${nombre}: tiene proporción ${ratio.toFixed(2)}:1 y Google pide ${regla.ratio === 1 ? "1:1 (cuadrada)" : "1,91:1 (horizontal)"}.`;
  }
  return null;
}

/** Validación de textos y datos, sin red: lo que se puede decir antes de tocar la cuenta. */
export function validarAnuncioDisplay(a: AnuncioDisplay): string[] {
  const p: string[] = [];
  const L = LIMITES_DISPLAY;
  const titulares = a.titulares.map((t) => t.trim()).filter(Boolean);
  const descripciones = a.descripciones.map((t) => t.trim()).filter(Boolean);
  if (titulares.length < L.titulares.min || titulares.length > L.titulares.max) {
    p.push(`Display pide entre ${L.titulares.min} y ${L.titulares.max} títulos cortos.`);
  }
  if (titulares.some((t) => t.length > L.titulares.largo)) p.push(`Cada título corto admite hasta ${L.titulares.largo} caracteres.`);
  if (!a.tituloLargo.trim()) p.push("Falta el título largo.");
  else if (a.tituloLargo.trim().length > L.tituloLargo) p.push(`El título largo admite hasta ${L.tituloLargo} caracteres.`);
  if (descripciones.length < L.descripciones.min || descripciones.length > L.descripciones.max) {
    p.push(`Display pide entre ${L.descripciones.min} y ${L.descripciones.max} descripciones.`);
  }
  if (descripciones.some((t) => t.length > L.descripciones.largo)) p.push(`Cada descripción admite hasta ${L.descripciones.largo} caracteres.`);
  if (!a.nombreNegocio.trim()) p.push("Falta el nombre del negocio.");
  else if (a.nombreNegocio.trim().length > L.nombreNegocio) p.push(`El nombre del negocio admite hasta ${L.nombreNegocio} caracteres.`);
  if (!/^https?:\/\//i.test(a.urlFinal.trim())) p.push("La URL final debe empezar con http:// o https://.");
  if (!a.imagenPaisajeUrl.trim()) p.push("Falta la imagen horizontal (1,91:1).");
  if (!a.imagenCuadradaUrl.trim()) p.push("Falta la imagen cuadrada (1:1).");
  return p;
}

const IP_PRIVADA = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i;

/** Descarga una imagen pública y la devuelve en bytes. No admite direcciones locales ni privadas. */
export async function descargarImagen(url: string): Promise<Uint8Array> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new GoogleAdsNativoError(`La dirección de la imagen no es válida: ${url}`, 400);
  }
  if (u.protocol !== "https:" || IP_PRIVADA.test(u.hostname)) {
    throw new GoogleAdsNativoError("La imagen debe estar en una dirección pública https: Google no puede leer una local.", 400);
  }
  let r: Response;
  try {
    r = await fetch(u, { signal: AbortSignal.timeout(20_000), redirect: "follow" });
  } catch (error) {
    console.error("WiWO.ADS descarga de imagen", u.hostname, error instanceof Error ? error.message : error);
    throw new GoogleAdsNativoError("No se pudo descargar la imagen. Revisa que la dirección sea pública.", 502);
  }
  if (!r.ok) throw new GoogleAdsNativoError(`No se pudo descargar la imagen (HTTP ${r.status}).`, 502);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > LIMITES_DISPLAY.bytesPorImagen) {
    throw new GoogleAdsNativoError("La imagen pesa más de 5 MB: Google no la acepta.", 400);
  }
  return bytes;
}

function aBase64(bytes: Uint8Array): string {
  let binario = "";
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  return btoa(binario);
}

/** Cuerpo exacto de la creación del anuncio, dados los recursos ya subidos. Sin red. */
export function armarCreacionDisplay(
  customerId: string,
  adGroupId: string,
  a: AnuncioDisplay,
  recursos: { paisaje: string; cuadrada: string; logo: string | null },
): { ruta: string; cuerpo: Record<string, unknown> } {
  const cliente = idNumerico(customerId);
  const grupo = idNumerico(adGroupId);
  return {
    ruta: `customers/${cliente}/adGroupAds:mutate`,
    cuerpo: {
      operations: [
        {
          create: {
            adGroup: `customers/${cliente}/adGroups/${grupo}`,
            // Decisión del equipo: lo aprobado queda corriendo.
            status: "ENABLED",
            ad: {
              finalUrls: [a.urlFinal.trim()],
              responsiveDisplayAd: {
                headlines: a.titulares.map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
                longHeadline: { text: a.tituloLargo.trim() },
                descriptions: a.descripciones.map((t) => t.trim()).filter(Boolean).map((text) => ({ text })),
                businessName: a.nombreNegocio.trim(),
                marketingImages: [{ asset: recursos.paisaje }],
                squareMarketingImages: [{ asset: recursos.cuadrada }],
                ...(recursos.logo ? { logoImages: [{ asset: recursos.logo }] } : {}),
              },
            },
          },
        },
      ],
      partialFailure: false,
    },
  };
}

export type ResultadoDisplay = { anuncio: string | null; recursos: string[] };

type RespuestaMutacion = { results?: Array<{ resourceName?: string }> };

/**
 * Sube las imágenes y crea el anuncio. Valida primero (textos, tamaño y proporción de cada imagen), para
 * fallar con un mensaje claro antes de tocar la cuenta. Con `soloValidar` solo hace esa parte.
 */
export async function crearAnuncioDisplay(
  cred: CredencialesGoogle,
  customerId: string,
  adGroupId: string,
  anuncio: AnuncioDisplay,
  { soloValidar = false }: { soloValidar?: boolean } = {},
): Promise<ResultadoDisplay> {
  const textos = validarAnuncioDisplay(anuncio);
  if (textos.length > 0) throw new GoogleAdsNativoError(textos.join(" "), 400);

  const L = LIMITES_DISPLAY;
  const [paisaje, cuadrada, logo] = await Promise.all([
    descargarImagen(anuncio.imagenPaisajeUrl),
    descargarImagen(anuncio.imagenCuadradaUrl),
    anuncio.logoUrl?.trim() ? descargarImagen(anuncio.logoUrl) : Promise.resolve(null),
  ]);
  const problemas = [
    problemaDeImagen("La imagen horizontal", dimensionesDeImagen(paisaje), L.paisaje),
    problemaDeImagen("La imagen cuadrada", dimensionesDeImagen(cuadrada), L.cuadrada),
    ...(logo ? [problemaDeImagen("El logo", dimensionesDeImagen(logo), L.logo)] : []),
  ].filter((x): x is string => x !== null);
  if (problemas.length > 0) throw new GoogleAdsNativoError(problemas.join(" "), 400);
  if (soloValidar) return { anuncio: null, recursos: [] };

  const cliente = idNumerico(customerId);
  const sello = Date.now();
  const imagenes = [
    { nombre: `WiWO paisaje ${sello}`, bytes: paisaje },
    { nombre: `WiWO cuadrada ${sello}`, bytes: cuadrada },
    ...(logo ? [{ nombre: `WiWO logo ${sello}`, bytes: logo }] : []),
  ];
  registrarEscritura();
  let subida: RespuestaMutacion;
  try {
    subida = await llamar<RespuestaMutacion>(
      cred,
      `customers/${cliente}/assets:mutate`,
      {
        operations: imagenes.map((i) => ({ create: { name: i.nombre, type: "IMAGE", imageAsset: { data: aBase64(i.bytes) } } })),
        partialFailure: false,
      },
      60_000,
    );
  } finally {
    registrarEscritura();
  }
  const nombres = (subida.results ?? []).map((r) => r.resourceName ?? "");
  if (nombres.length !== imagenes.length || nombres.some((n) => !n)) {
    throw new GoogleAdsNativoError("Google no confirmó la subida de las imágenes.", 502, false, subida);
  }

  const { ruta, cuerpo } = armarCreacionDisplay(customerId, adGroupId, anuncio, {
    paisaje: nombres[0],
    cuadrada: nombres[1],
    logo: logo ? nombres[2] : null,
  });
  registrarEscritura();
  let creado: RespuestaMutacion;
  try {
    creado = await llamar<RespuestaMutacion>(cred, ruta, cuerpo);
  } finally {
    registrarEscritura();
  }
  return { anuncio: creado.results?.[0]?.resourceName ?? null, recursos: nombres };
}

/* -------------------------------------------------------------------------- */
/* Editar una campaña: fechas, redes y rotación (lo que Windsor no tiene)     */
/* -------------------------------------------------------------------------- */

export type CambiosCampanaGoogle = {
  /** aaaa-mm-dd. Google no deja cambiar el inicio de una campaña que ya empezó. */
  inicio?: string;
  /** aaaa-mm-dd; vacío = sin fecha de fin. */
  fin?: string;
  redes?: { busqueda: boolean; asociadas: boolean; display: boolean };
  /** OPTIMIZE = mostrar preferentemente los anuncios con mejor rendimiento; ROTATE_INDEFINITELY = rotar sin optimizar. */
  rotacion?: "OPTIMIZE" | "ROTATE_INDEFINITELY";
  /** Estrategia de puja de la campaña (importes en micros). */
  puja?: PujaDeBusqueda;
  /** «presencia»: solo personas que están en la ubicación; «presencia_o_interes»: también quienes muestran interés. */
  presencia?: "presencia" | "presencia_o_interes";
  /** Plantilla de URL de seguimiento de la campaña (vacío la quita). */
  plantillaSeguimiento?: string;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Lo que Google toma como «sin fecha de fin». */
const SIN_FIN = "2037-12-30 00:00:00";

export function validarCambiosCampana(c: CambiosCampanaGoogle): string[] {
  const p: string[] = [];
  const valida = (f: string) => FECHA.test(f) && !Number.isNaN(Date.parse(`${f}T00:00:00Z`));
  if (c.inicio !== undefined && !valida(c.inicio)) p.push("La fecha de inicio no es válida (aaaa-mm-dd).");
  if (c.fin !== undefined && c.fin !== "" && !valida(c.fin)) p.push("La fecha de fin no es válida (aaaa-mm-dd).");
  if (c.inicio && c.fin && valida(c.inicio) && valida(c.fin) && c.fin < c.inicio) p.push("La fecha de fin no puede ser anterior a la de inicio.");
  if (c.redes && !c.redes.busqueda) p.push("La campaña debe seguir mostrándose en la Búsqueda de Google.");
  if (c.redes && c.redes.asociadas && !c.redes.busqueda) p.push("Los socios de búsqueda exigen la Búsqueda de Google.");
  if (c.rotacion !== undefined && c.rotacion !== "OPTIMIZE" && c.rotacion !== "ROTATE_INDEFINITELY") p.push("Rotación de anuncios no reconocida.");
  if (c.puja?.tipo === "cuota_impresiones") {
    if (!(c.puja.porcentaje > 0 && c.puja.porcentaje <= 100)) p.push("El porcentaje de cuota de impresiones debe estar entre 1 y 100.");
    if (!(c.puja.cpcMaximoMicros >= 1)) p.push("La cuota de impresiones exige un CPC máximo.");
  }
  if (c.puja?.tipo === "valor_conversion" && c.puja.roasObjetivo != null && !(c.puja.roasObjetivo > 0)) p.push("El ROAS objetivo debe ser mayor que cero.");
  if (c.presencia !== undefined && c.presencia !== "presencia" && c.presencia !== "presencia_o_interes") p.push("Opción de ubicación no reconocida.");
  if (c.plantillaSeguimiento !== undefined && c.plantillaSeguimiento.length > 2000) p.push("La plantilla de seguimiento admite hasta 2000 caracteres.");
  if (Object.keys(c).length === 0) p.push("No hay ningún cambio que aplicar.");
  return p;
}

/** Campo y valor de Google para una estrategia de puja (compartido por crear y editar). */
function camposDePuja(pj: PujaDeBusqueda): { campo: string; valor: Record<string, unknown> } {
  if (pj.tipo === "clics") return { campo: "targetSpend", valor: pj.cpcMaximoMicros ? { cpcBidCeilingMicros: String(pj.cpcMaximoMicros) } : {} };
  if (pj.tipo === "conversiones") return { campo: "maximizeConversions", valor: pj.cpaObjetivoMicros ? { targetCpaMicros: String(pj.cpaObjetivoMicros) } : {} };
  if (pj.tipo === "valor_conversion") return { campo: "maximizeConversionValue", valor: pj.roasObjetivo ? { targetRoas: pj.roasObjetivo } : {} };
  if (pj.tipo === "cpc_manual") return { campo: "manualCpc", valor: { enhancedCpcEnabled: pj.mejorarCpc === true } };
  return { campo: "targetImpressionShare", valor: { location: pj.ubicacion, locationFractionMicros: String(Math.round(pj.porcentaje * 10_000)), cpcBidCeilingMicros: String(pj.cpcMaximoMicros) } };
}

/** Cuerpo exacto de la mutación de la campaña, sin llamarla (para mostrarlo en la simulación). */
export function armarMutacionCampana(
  customerId: string,
  campaignId: string,
  cambios: CambiosCampanaGoogle,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): { ruta: string; cuerpo: Record<string, unknown> } {
  const cliente = idNumerico(customerId);
  const campana = idNumerico(campaignId);
  const update: Record<string, unknown> = { resourceName: `customers/${cliente}/campaigns/${campana}` };
  const mascara: string[] = [];
  if (cambios.inicio !== undefined) {
    update.startDateTime = `${cambios.inicio} 00:00:00`;
    mascara.push("startDateTime");
  }
  if (cambios.fin !== undefined) {
    update.endDateTime = cambios.fin === "" ? SIN_FIN : `${cambios.fin} 23:59:59`;
    mascara.push("endDateTime");
  }
  if (cambios.redes) {
    update.networkSettings = {
      targetGoogleSearch: cambios.redes.busqueda,
      targetSearchNetwork: cambios.redes.asociadas,
      targetContentNetwork: cambios.redes.display,
    };
    mascara.push("networkSettings.targetGoogleSearch", "networkSettings.targetSearchNetwork", "networkSettings.targetContentNetwork");
  }
  if (cambios.rotacion) {
    update.adServingOptimizationStatus = cambios.rotacion;
    mascara.push("adServingOptimizationStatus");
  }
  if (cambios.puja) {
    const { campo, valor } = camposDePuja(cambios.puja);
    update[campo] = valor;
    // Cambiar de estrategia: se fija la nueva entera (Google la toma como un único campo de la campaña).
    mascara.push(Object.keys(valor).length > 0 ? Object.keys(valor).map((k) => `${campo}.${k}`).join(",") : campo);
  }
  if (cambios.presencia) {
    update.geoTargetTypeSetting = { positiveGeoTargetType: cambios.presencia === "presencia" ? "PRESENCE" : "PRESENCE_OR_INTEREST" };
    mascara.push("geoTargetTypeSetting.positiveGeoTargetType");
  }
  if (cambios.plantillaSeguimiento !== undefined) {
    update.trackingUrlTemplate = cambios.plantillaSeguimiento;
    mascara.push("trackingUrlTemplate");
  }
  return {
    ruta: `customers/${cliente}/campaigns:mutate`,
    cuerpo: { operations: [{ updateMask: mascara.join(","), update }], validateOnly, partialFailure: false },
  };
}

/** Elimina (REMOVED, irreversible) una campaña, un grupo de anuncios o un anuncio de Google Ads. */
export async function eliminarEnGoogle(
  cred: CredencialesGoogle,
  customerId: string,
  nivel: "campana" | "conjunto" | "anuncio",
  id: string,
  grupoId: string | null,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): Promise<ResultadoMutacion> {
  const cliente = idNumerico(customerId);
  if (!/^\d+$/.test(id)) throw new GoogleAdsNativoError("Identificador no válido.", 400);
  let ruta: string;
  let recurso: string;
  if (nivel === "campana") {
    ruta = `customers/${cliente}/campaigns:mutate`;
    recurso = `customers/${cliente}/campaigns/${id}`;
  } else if (nivel === "conjunto") {
    ruta = `customers/${cliente}/adGroups:mutate`;
    recurso = `customers/${cliente}/adGroups/${id}`;
  } else {
    if (!grupoId || !/^\d+$/.test(grupoId)) throw new GoogleAdsNativoError("Falta el grupo de anuncios del anuncio.", 400);
    ruta = `customers/${cliente}/adGroupAds:mutate`;
    recurso = `customers/${cliente}/adGroupAds/${grupoId}~${id}`;
  }
  if (!validateOnly) registrarEscritura();
  let respuesta: { results?: Array<{ resourceName?: string }> };
  try {
    respuesta = await llamar<{ results?: Array<{ resourceName?: string }> }>(cred, ruta, { operations: [{ remove: recurso }], validateOnly, partialFailure: false });
  } finally {
    if (!validateOnly) registrarEscritura();
  }
  return { soloValidado: validateOnly, resourceName: respuesta.results?.[0]?.resourceName ?? null };
}

/** Edita la campaña (conserva su id). Con `validateOnly`, Google valida contra la cuenta real sin aplicar nada. */
export async function actualizarCampanaGoogle(
  cred: CredencialesGoogle,
  customerId: string,
  campaignId: string,
  cambios: CambiosCampanaGoogle,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): Promise<ResultadoMutacion> {
  const problemas = validarCambiosCampana(cambios);
  if (problemas.length > 0) throw new GoogleAdsNativoError(problemas.join(" "), 400);
  const { ruta, cuerpo } = armarMutacionCampana(customerId, campaignId, cambios, { validateOnly });
  if (!validateOnly) registrarEscritura();
  let respuesta: { results?: Array<{ resourceName?: string }> };
  try {
    respuesta = await llamar<{ results?: Array<{ resourceName?: string }> }>(cred, ruta, cuerpo);
  } finally {
    if (!validateOnly) registrarEscritura();
  }
  return { soloValidado: validateOnly, resourceName: respuesta.results?.[0]?.resourceName ?? null };
}

/* -------------------------------------------------------------------------- */
/* Crear una campaña de Performance Max                                       */
/* -------------------------------------------------------------------------- */

/**
 * Performance Max no se puede crear con Windsor (su `create_campaign` solo admite Búsqueda y Display). Con la API de
 * Google Ads se arma TODO en una sola mutación atómica (`googleAds:mutate`, con ids temporales negativos): el
 * presupuesto, la campaña, la ubicación, los recursos (textos e imágenes) y el grupo de recursos que los junta.
 * Atómico significa que o se crea todo o no se crea nada: no deja campañas a medias. Nace PAUSADA.
 *
 * Con `validateOnly` Google valida la mutación entera contra la cuenta real sin crear nada: es la simulación fiel.
 */
export const LIMITES_PMAX = {
  titulares: { min: 3, max: 15, largo: 30 },
  titulosLargos: { min: 1, max: 5, largo: 90 },
  descripciones: { min: 2, max: 5, largo: 90, cortaMax: 60 },
  nombreNegocio: 25,
} as const;

export type DatosPmax = {
  nombre: string;
  /** Presupuesto diario en micros de la moneda de la cuenta (entero de unidades, múltiplo de 1.000.000). */
  presupuestoDiarioMicros: number;
  urlFinal: string;
  titulares: string[];
  titulosLargos: string[];
  descripciones: string[];
  nombreNegocio: string;
  imagenPaisajeUrl: string;
  imagenCuadradaUrl: string;
  logoUrl?: string | null;
  /** Ids de destino geográfico de Google (`2152` = Chile). */
  ubicaciones: string[];
  excluidas?: string[];
  /** aaaa-mm-dd; vacío = sin fin. */
  fin?: string | null;
};

export function validarPmax(d: DatosPmax): string[] {
  const p: string[] = [];
  const L = LIMITES_PMAX;
  const t = d.titulares.map((x) => x.trim()).filter(Boolean);
  const l = d.titulosLargos.map((x) => x.trim()).filter(Boolean);
  const ds = d.descripciones.map((x) => x.trim()).filter(Boolean);
  if (!d.nombre.trim()) p.push("Falta el nombre de la campaña.");
  if (!(d.presupuestoDiarioMicros >= 1_000_000)) p.push("Falta el presupuesto diario.");
  if (t.length < L.titulares.min || t.length > L.titulares.max) p.push(`Performance Max pide entre ${L.titulares.min} y ${L.titulares.max} títulos cortos.`);
  if (t.some((x) => x.length > L.titulares.largo)) p.push(`Cada título corto admite hasta ${L.titulares.largo} caracteres.`);
  if (l.length < L.titulosLargos.min || l.length > L.titulosLargos.max) p.push(`Performance Max pide entre ${L.titulosLargos.min} y ${L.titulosLargos.max} títulos largos.`);
  if (l.some((x) => x.length > L.titulosLargos.largo)) p.push(`Cada título largo admite hasta ${L.titulosLargos.largo} caracteres.`);
  if (ds.length < L.descripciones.min || ds.length > L.descripciones.max) p.push(`Performance Max pide entre ${L.descripciones.min} y ${L.descripciones.max} descripciones.`);
  if (ds.some((x) => x.length > L.descripciones.largo)) p.push(`Cada descripción admite hasta ${L.descripciones.largo} caracteres.`);
  if (ds.length > 0 && !ds.some((x) => x.length <= L.descripciones.cortaMax)) p.push(`Al menos una descripción debe tener ${L.descripciones.cortaMax} caracteres o menos.`);
  if (!d.nombreNegocio.trim()) p.push("Falta el nombre del negocio.");
  else if (d.nombreNegocio.trim().length > L.nombreNegocio) p.push(`El nombre del negocio admite hasta ${L.nombreNegocio} caracteres.`);
  if (!/^https?:\/\//i.test(d.urlFinal.trim())) p.push("La URL final debe empezar con http:// o https://.");
  if (!d.imagenPaisajeUrl.trim()) p.push("Falta la imagen horizontal (1,91:1).");
  if (!d.imagenCuadradaUrl.trim()) p.push("Falta la imagen cuadrada (1:1).");
  // Con las pautas de marca de Google (obligatorias en campañas nuevas) hace falta un logo cuadrado.
  if (!d.logoUrl?.trim()) p.push("Performance Max necesita el logo (cuadrado 1:1): Google lo exige junto con el nombre del negocio.");
  if (d.ubicaciones.length === 0) p.push("Falta al menos una ubicación (país).");
  if (d.fin && !/^\d{4}-\d{2}-\d{2}$/.test(d.fin)) p.push("La fecha de fin no es válida (aaaa-mm-dd).");
  return p;
}

type ImagenListaPmax = { nombre: string; base64: string; campo: "MARKETING_IMAGE" | "SQUARE_MARKETING_IMAGE" | "LOGO" };

/** Cuerpo exacto de la mutación (ids temporales negativos entre sí). Sin red. */
export function armarMutacionPmax(
  customerId: string,
  d: DatosPmax,
  imagenes: ImagenListaPmax[],
  { validateOnly = false, sello = Date.now() }: { validateOnly?: boolean; sello?: number } = {},
): { ruta: string; cuerpo: Record<string, unknown> } {
  const cliente = idNumerico(customerId);
  const rc = (tipo: string, n: number) => `customers/${cliente}/${tipo}/${n}`;
  const ops: Array<Record<string, unknown>> = [];

  // 1) Presupuesto propio (no compartido) y 2) la campaña, pausada.
  ops.push({
    campaignBudgetOperation: {
      create: {
        resourceName: rc("campaignBudgets", -1),
        name: `${d.nombre.trim()} · presupuesto ${sello}`,
        amountMicros: String(d.presupuestoDiarioMicros),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    },
  });
  ops.push({
    campaignOperation: {
      create: {
        resourceName: rc("campaigns", -2),
        name: d.nombre.trim(),
        advertisingChannelType: "PERFORMANCE_MAX",
        // Decisión del equipo: lo aprobado queda corriendo.
        status: "ENABLED",
        campaignBudget: rc("campaignBudgets", -1),
        maximizeConversions: {},
        containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        ...(d.fin ? { endDateTime: `${d.fin} 23:59:59` } : {}),
      },
    },
  });
  // 3) Ubicaciones.
  for (const id of d.ubicaciones) {
    ops.push({
      campaignCriterionOperation: {
        create: { campaign: rc("campaigns", -2), location: { geoTargetConstant: `geoTargetConstants/${id}` } },
      },
    });
  }
  for (const id of d.excluidas ?? []) {
    ops.push({
      campaignCriterionOperation: {
        create: { campaign: rc("campaigns", -2), negative: true, location: { geoTargetConstant: `geoTargetConstants/${id}` } },
      },
    });
  }

  // 4) Recursos: textos e imágenes. Cada uno con su id temporal, que el grupo de recursos enlaza después.
  let siguiente = -10;
  const enlaces: Array<{ asset: string; campo: string }> = [];
  // Nombre del negocio y logo se enlazan a la CAMPAÑA (pautas de marca de Google), no al grupo de recursos.
  const enlacesDeCampana: Array<{ asset: string; campo: string }> = [];
  const texto = (campo: string, valor: string) => {
    const nombre = rc("assets", siguiente);
    siguiente -= 1;
    ops.push({ assetOperation: { create: { resourceName: nombre, textAsset: { text: valor.trim() } } } });
    enlaces.push({ asset: nombre, campo });
  };
  d.titulares.map((x) => x.trim()).filter(Boolean).forEach((x) => texto("HEADLINE", x));
  d.titulosLargos.map((x) => x.trim()).filter(Boolean).forEach((x) => texto("LONG_HEADLINE", x));
  d.descripciones.map((x) => x.trim()).filter(Boolean).forEach((x) => texto("DESCRIPTION", x));
  {
    const nombre = rc("assets", siguiente);
    siguiente -= 1;
    ops.push({ assetOperation: { create: { resourceName: nombre, textAsset: { text: d.nombreNegocio.trim() } } } });
    enlacesDeCampana.push({ asset: nombre, campo: "BUSINESS_NAME" });
  }
  for (const img of imagenes) {
    const nombre = rc("assets", siguiente);
    siguiente -= 1;
    ops.push({ assetOperation: { create: { resourceName: nombre, name: img.nombre, type: "IMAGE", imageAsset: { data: img.base64 } } } });
    (img.campo === "LOGO" ? enlacesDeCampana : enlaces).push({ asset: nombre, campo: img.campo });
  }

  // 5) El grupo de recursos y 6) cada recurso enlazado a él con su función.
  ops.push({
    assetGroupOperation: {
      create: {
        resourceName: rc("assetGroups", -3),
        campaign: rc("campaigns", -2),
        name: `${d.nombre.trim()} · grupo de recursos`,
        finalUrls: [d.urlFinal.trim()],
        status: "ENABLED",
      },
    },
  });
  for (const e of enlacesDeCampana) {
    ops.push({ campaignAssetOperation: { create: { campaign: rc("campaigns", -2), asset: e.asset, fieldType: e.campo } } });
  }
  for (const e of enlaces) {
    ops.push({ assetGroupAssetOperation: { create: { assetGroup: rc("assetGroups", -3), asset: e.asset, fieldType: e.campo } } });
  }

  return { ruta: `customers/${cliente}/googleAds:mutate`, cuerpo: { mutateOperations: ops, validateOnly, partialFailure: false } };
}

export type ResultadoPmax = { campanaId: string | null; recursos: string[]; soloValidado: boolean };

/**
 * Valida (y, salvo `soloValidar`, crea) la campaña de Performance Max. La validación revisa textos y descarga las
 * imágenes para comprobar tamaño y proporción; con `soloValidar` además Google valida la mutación entera contra la
 * cuenta (`validateOnly`) sin crear nada.
 */
export async function crearCampanaPmax(
  cred: CredencialesGoogle,
  customerId: string,
  datos: DatosPmax,
  { soloValidar = false }: { soloValidar?: boolean } = {},
): Promise<ResultadoPmax> {
  const textos = validarPmax(datos);
  if (textos.length > 0) throw new GoogleAdsNativoError(textos.join(" "), 400);

  const L = LIMITES_DISPLAY;
  const [paisaje, cuadrada, logo] = await Promise.all([
    descargarImagen(datos.imagenPaisajeUrl),
    descargarImagen(datos.imagenCuadradaUrl),
    datos.logoUrl?.trim() ? descargarImagen(datos.logoUrl) : Promise.resolve(null),
  ]);
  const problemas = [
    problemaDeImagen("La imagen horizontal", dimensionesDeImagen(paisaje), L.paisaje),
    problemaDeImagen("La imagen cuadrada", dimensionesDeImagen(cuadrada), L.cuadrada),
    ...(logo ? [problemaDeImagen("El logo", dimensionesDeImagen(logo), L.logo)] : []),
  ].filter((x): x is string => x !== null);
  if (problemas.length > 0) throw new GoogleAdsNativoError(problemas.join(" "), 400);

  const sello = Date.now();
  const imagenes: ImagenListaPmax[] = [
    { nombre: `WiWO PMax paisaje ${sello}`, base64: aBase64(paisaje), campo: "MARKETING_IMAGE" },
    { nombre: `WiWO PMax cuadrada ${sello}`, base64: aBase64(cuadrada), campo: "SQUARE_MARKETING_IMAGE" },
    ...(logo ? [{ nombre: `WiWO PMax logo ${sello}`, base64: aBase64(logo), campo: "LOGO" as const }] : []),
  ];
  const { ruta, cuerpo } = armarMutacionPmax(customerId, datos, imagenes, { validateOnly: soloValidar, sello });
  if (!soloValidar) registrarEscritura();
  let respuesta: { mutateOperationResponses?: Array<Record<string, { resourceName?: string }>> };
  try {
    respuesta = await llamar<typeof respuesta>(cred, ruta, cuerpo, 90_000);
  } finally {
    if (!soloValidar) registrarEscritura();
  }
  const recursos = (respuesta.mutateOperationResponses ?? []).flatMap((r) => Object.values(r).map((v) => v.resourceName ?? "")).filter(Boolean);
  const campana = recursos.find((r) => /\/campaigns\/\d+$/.test(r));
  return { campanaId: campana ? (campana.split("/").pop() ?? null) : null, recursos, soloValidado: soloValidar };
}

/* -------------------------------------------------------------------------- */
/* Performance Max: editar los textos y las URL de un grupo de recursos        */
/* -------------------------------------------------------------------------- */

/** Lo que se cambia de un grupo de recursos. Un campo ausente no se toca; las listas son la lista COMPLETA que debe quedar. */
export type CambiosGrupoDeRecursos = {
  titulares?: string[];
  titulosLargos?: string[];
  descripciones?: string[];
  urlsFinales?: string[];
  path1?: string;
  path2?: string;
};

/** Límites de Google para los textos de un grupo de recursos de Performance Max. */
export const LIMITES_GRUPO_DE_RECURSOS = {
  titulares: { min: 3, max: 15, largo: 30 },
  titulosLargos: { min: 1, max: 5, largo: 90 },
  descripciones: { min: 2, max: 5, largo: 90, cortaMax: 60 },
  path: 15,
} as const;

export function validarCambiosGrupoDeRecursos(c: CambiosGrupoDeRecursos): string[] {
  const p: string[] = [];
  const L = LIMITES_GRUPO_DE_RECURSOS;
  const lista = (nombre: string, textos: string[] | undefined, lim: { min: number; max: number; largo: number }) => {
    if (!textos) return;
    const limpios = textos.map((t) => t.trim());
    if (limpios.length < lim.min || limpios.length > lim.max) p.push(`Se necesitan entre ${lim.min} y ${lim.max} ${nombre} (hay ${limpios.length}).`);
    limpios.forEach((t, i) => {
      if (!t) p.push(`${nombre} ${i + 1} está vacío.`);
      else if (t.length > lim.largo) p.push(`${nombre} ${i + 1} tiene ${t.length} caracteres (máximo ${lim.largo}).`);
    });
    if (new Set(limpios.map((t) => t.toLowerCase())).size !== limpios.length) p.push(`Hay ${nombre} repetidos.`);
  };
  lista("titulares", c.titulares, L.titulares);
  lista("títulos largos", c.titulosLargos, L.titulosLargos);
  lista("descripciones", c.descripciones, L.descripciones);
  if (c.descripciones && !c.descripciones.some((d) => d.trim() && d.trim().length <= L.descripciones.cortaMax)) {
    p.push(`Al menos una descripción debe tener ${L.descripciones.cortaMax} caracteres o menos.`);
  }
  if (c.urlsFinales) {
    if (c.urlsFinales.length !== 1) p.push("Un grupo de recursos lleva una sola URL final.");
    for (const u of c.urlsFinales) if (!/^https?:\/\/[^\s]+$/i.test(u.trim())) p.push(`La URL final «${u}» no es válida (debe empezar con http:// o https://).`);
  }
  for (const [n, v] of [["path1", c.path1], ["path2", c.path2]] as const) {
    if (v !== undefined && v.length > L.path) p.push(`${n} tiene ${v.length} caracteres (máximo ${L.path}).`);
  }
  return p;
}

/** Un recurso de texto que ya está enlazado al grupo (lo que hay hoy en Google). */
export type TextoEnlazado = { enlace: string; campo: string; texto: string };

/**
 * Arma la mutación: los textos nuevos se crean y se enlazan; los que sobran se desenlazan. Los textos de Google no se
 * editan: se reemplazan. Se crea antes de quitar mientras no se pase del máximo, así nunca queda por debajo del mínimo.
 */
export function armarMutacionGrupoDeRecursos(
  customerId: string,
  grupoId: string,
  actuales: TextoEnlazado[],
  cambios: CambiosGrupoDeRecursos,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): { ruta: string; cuerpo: Record<string, unknown>; resumen: string[] } {
  const cliente = idNumerico(customerId);
  const grupo = idNumerico(grupoId);
  const rc = (tipo: string, n: number | string) => `customers/${cliente}/${tipo}/${n}`;
  const ops: Array<Record<string, unknown>> = [];
  const resumen: string[] = [];
  let temporal = -1;

  const CAMPOS: Array<[keyof CambiosGrupoDeRecursos, string, number]> = [
    ["titulares", "HEADLINE", LIMITES_GRUPO_DE_RECURSOS.titulares.max],
    ["titulosLargos", "LONG_HEADLINE", LIMITES_GRUPO_DE_RECURSOS.titulosLargos.max],
    ["descripciones", "DESCRIPTION", LIMITES_GRUPO_DE_RECURSOS.descripciones.max],
  ];
  for (const [clave, campo, max] of CAMPOS) {
    const pedidos = cambios[clave] as string[] | undefined;
    if (!pedidos) continue;
    const quedan = pedidos.map((t) => t.trim());
    const hoy = actuales.filter((a) => a.campo === campo);
    const hoyTextos = new Set(hoy.map((a) => a.texto.trim().toLowerCase()));
    const quedanTextos = new Set(quedan.map((t) => t.toLowerCase()));
    const aQuitar = hoy.filter((a) => !quedanTextos.has(a.texto.trim().toLowerCase()));
    const aCrear = quedan.filter((t) => !hoyTextos.has(t.toLowerCase()));
    const crear = (t: string) => {
      const nombre = rc("assets", temporal);
      temporal -= 1;
      ops.push({ assetOperation: { create: { resourceName: nombre, textAsset: { text: t } } } });
      ops.push({ assetGroupAssetOperation: { create: { assetGroup: rc("assetGroups", grupo), asset: nombre, fieldType: campo } } });
    };
    let cuenta = hoy.length;
    const pendientes = [...aCrear];
    while (pendientes.length > 0 && cuenta < max) {
      crear(pendientes.shift() as string);
      cuenta += 1;
    }
    for (const q of aQuitar) {
      ops.push({ assetGroupAssetOperation: { remove: q.enlace } });
      cuenta -= 1;
    }
    for (const t of pendientes) crear(t);
    if (aCrear.length > 0 || aQuitar.length > 0) resumen.push(`${clave}: +${aCrear.length} −${aQuitar.length}`);
  }

  const camposDelGrupo: Record<string, unknown> = {};
  const mascara: string[] = [];
  if (cambios.urlsFinales) { camposDelGrupo.finalUrls = cambios.urlsFinales.map((u) => u.trim()); mascara.push("final_urls"); }
  if (cambios.path1 !== undefined) { camposDelGrupo.path1 = cambios.path1; mascara.push("path1"); }
  if (cambios.path2 !== undefined) { camposDelGrupo.path2 = cambios.path2; mascara.push("path2"); }
  if (mascara.length > 0) {
    ops.push({ assetGroupOperation: { update: { resourceName: rc("assetGroups", grupo), ...camposDelGrupo }, updateMask: mascara.join(",") } });
    resumen.push(`grupo: ${mascara.join(", ")}`);
  }
  return { ruta: `customers/${cliente}/googleAds:mutate`, cuerpo: { mutateOperations: ops, validateOnly, partialFailure: false }, resumen };
}

export const GAQL_TEXTOS_DE_GRUPO = (grupoId: string): string =>
  [
    "SELECT asset_group_asset.resource_name, asset_group_asset.field_type, asset.text_asset.text",
    `FROM asset_group_asset WHERE asset_group.id = ${idNumerico(grupoId)}`,
    "AND asset_group_asset.status != 'REMOVED' AND asset.type = 'TEXT'",
  ].join(" ");

export async function actualizarGrupoDeRecursos(
  cred: CredencialesGoogle,
  customerId: string,
  grupoId: string,
  cambios: CambiosGrupoDeRecursos,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): Promise<ResultadoMutacion & { resumen: string[] }> {
  const problemas = validarCambiosGrupoDeRecursos(cambios);
  if (problemas.length > 0) throw new GoogleAdsNativoError(problemas.join(" "), 400);
  const filas = await consultarGaql(cred, customerId, GAQL_TEXTOS_DE_GRUPO(grupoId));
  const actuales: TextoEnlazado[] = [];
  for (const f of filas) {
    const v = (f.assetGroupAsset ?? {}) as { resourceName?: string; fieldType?: string };
    const t = (((f.asset ?? {}) as { textAsset?: { text?: string } }).textAsset ?? {}).text;
    if (v.resourceName && v.fieldType && typeof t === "string") actuales.push({ enlace: v.resourceName, campo: v.fieldType, texto: t });
  }
  const { ruta, cuerpo, resumen } = armarMutacionGrupoDeRecursos(customerId, grupoId, actuales, cambios, { validateOnly });
  if ((cuerpo.mutateOperations as unknown[]).length === 0) return { soloValidado: validateOnly, resourceName: null, resumen: ["sin cambios"] };
  if (!validateOnly) registrarEscritura();
  let respuesta: { mutateOperationResponses?: Array<Record<string, { resourceName?: string }>> };
  try {
    respuesta = await llamar<typeof respuesta>(cred, ruta, cuerpo, 60_000);
  } finally {
    if (!validateOnly) registrarEscritura();
  }
  const primero = Object.values(respuesta.mutateOperationResponses?.[0] ?? {})[0];
  return { soloValidado: validateOnly, resourceName: primero?.resourceName ?? null, resumen };
}

/* -------------------------------------------------------------------------- */
/* Extensiones de campaña: enlaces de sitio y textos destacados               */
/* -------------------------------------------------------------------------- */

/** Los enlaces de sitio y textos destacados enlazados a campañas (con o sin actividad). */
export const GAQL_EXTENSIONES = [
  "SELECT campaign.id, campaign_asset.resource_name, campaign_asset.field_type, campaign_asset.status,",
  "asset.id, asset.final_urls, asset.sitelink_asset.link_text, asset.sitelink_asset.description1,",
  "asset.sitelink_asset.description2, asset.callout_asset.callout_text",
  "FROM campaign_asset WHERE campaign_asset.field_type IN ('SITELINK', 'CALLOUT') AND campaign_asset.status != 'REMOVED'",
].join(" ");

export type EnlaceDeSitio = { texto: string; url: string; descripcion1: string; descripcion2: string };
/** Lo que debe quedar: las listas completas. Un campo ausente no se toca. */
export type CambiosExtensiones = { sitelinks?: EnlaceDeSitio[]; destacados?: string[] };
/** Una extensión que ya está enlazada a la campaña (lo que hay hoy en Google). */
export type ExtensionActual = { enlace: string; tipo: "SITELINK" | "CALLOUT"; texto: string; url: string; descripcion1: string; descripcion2: string };

export const LIMITES_EXTENSIONES = { maxPorTipo: 20, textoEnlace: 25, descripcion: 35, destacado: 25 } as const;

export function validarCambiosExtensiones(c: CambiosExtensiones): string[] {
  const p: string[] = [];
  const L = LIMITES_EXTENSIONES;
  if (c.sitelinks) {
    if (c.sitelinks.length > L.maxPorTipo) p.push(`Una campaña admite hasta ${L.maxPorTipo} enlaces de sitio (hay ${c.sitelinks.length}).`);
    for (const e of c.sitelinks) {
      if (!e.texto.trim() || e.texto.trim().length > L.textoEnlace) p.push(`El enlace «${e.texto.trim() || "sin texto"}» debe tener entre 1 y ${L.textoEnlace} caracteres.`);
      if (e.descripcion1.length > L.descripcion || e.descripcion2.length > L.descripcion) p.push(`Las descripciones del enlace «${e.texto.trim()}» admiten hasta ${L.descripcion} caracteres.`);
      if (Boolean(e.descripcion1.trim()) !== Boolean(e.descripcion2.trim())) p.push(`El enlace «${e.texto.trim()}» necesita las dos descripciones o ninguna: Google no admite solo una.`);
      if (!/^https?:\/\/[^\s]+$/i.test(e.url.trim())) p.push(`El enlace «${e.texto.trim()}» necesita una URL que empiece con http:// o https://.`);
    }
    const claves = c.sitelinks.map((e) => `${e.texto.trim().toLowerCase()}|${e.url.trim().toLowerCase()}`);
    if (new Set(claves).size !== claves.length) p.push("Hay enlaces de sitio repetidos (mismo texto y misma URL).");
  }
  if (c.destacados) {
    if (c.destacados.length > L.maxPorTipo) p.push(`Una campaña admite hasta ${L.maxPorTipo} textos destacados (hay ${c.destacados.length}).`);
    const limpios = c.destacados.map((x) => x.trim());
    if (limpios.some((x) => !x || x.length > L.destacado)) p.push(`Cada texto destacado debe tener entre 1 y ${L.destacado} caracteres.`);
    if (new Set(limpios.map((x) => x.toLowerCase())).size !== limpios.length) p.push("Hay textos destacados repetidos.");
  }
  return p;
}

const claveDeEnlace = (e: { texto: string; url: string; descripcion1: string; descripcion2: string }) =>
  [e.texto, e.url, e.descripcion1, e.descripcion2].map((x) => x.trim().toLowerCase()).join("|");

/** Crea y enlaza lo nuevo; desenlaza lo que sobra. Lo que no cambia ni se toca. */
export function armarMutacionExtensiones(
  customerId: string,
  campaignId: string,
  actuales: ExtensionActual[],
  cambios: CambiosExtensiones,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): { ruta: string; cuerpo: Record<string, unknown>; resumen: string[] } {
  const cliente = idNumerico(customerId);
  const campana = `customers/${cliente}/campaigns/${idNumerico(campaignId)}`;
  const ops: Array<Record<string, unknown>> = [];
  const resumen: string[] = [];
  let temporal = -1;
  const crear = (asset: Record<string, unknown>, campo: "SITELINK" | "CALLOUT") => {
    const nombre = `customers/${cliente}/assets/${temporal}`;
    temporal -= 1;
    ops.push({ assetOperation: { create: { resourceName: nombre, ...asset } } });
    ops.push({ campaignAssetOperation: { create: { campaign: campana, asset: nombre, fieldType: campo } } });
  };

  if (cambios.sitelinks) {
    const hoy = actuales.filter((a) => a.tipo === "SITELINK");
    const hoyClaves = new Set(hoy.map(claveDeEnlace));
    const quedan = cambios.sitelinks.map((e) => ({ texto: e.texto.trim(), url: e.url.trim(), descripcion1: e.descripcion1.trim(), descripcion2: e.descripcion2.trim() }));
    const quedanClaves = new Set(quedan.map(claveDeEnlace));
    const nuevos = quedan.filter((e) => !hoyClaves.has(claveDeEnlace(e)));
    const sobran = hoy.filter((a) => !quedanClaves.has(claveDeEnlace(a)));
    for (const e of nuevos) {
      crear({ finalUrls: [e.url], sitelinkAsset: { linkText: e.texto, ...(e.descripcion1 ? { description1: e.descripcion1 } : {}), ...(e.descripcion2 ? { description2: e.descripcion2 } : {}) } }, "SITELINK");
    }
    for (const a of sobran) ops.push({ campaignAssetOperation: { remove: a.enlace } });
    if (nuevos.length > 0 || sobran.length > 0) resumen.push(`enlaces de sitio: +${nuevos.length} −${sobran.length}`);
  }
  if (cambios.destacados) {
    const hoy = actuales.filter((a) => a.tipo === "CALLOUT");
    const hoyTextos = new Set(hoy.map((a) => a.texto.trim().toLowerCase()));
    const quedan = cambios.destacados.map((x) => x.trim());
    const quedanTextos = new Set(quedan.map((x) => x.toLowerCase()));
    const nuevos = quedan.filter((x) => !hoyTextos.has(x.toLowerCase()));
    const sobran = hoy.filter((a) => !quedanTextos.has(a.texto.trim().toLowerCase()));
    for (const t of nuevos) crear({ calloutAsset: { calloutText: t } }, "CALLOUT");
    for (const a of sobran) ops.push({ campaignAssetOperation: { remove: a.enlace } });
    if (nuevos.length > 0 || sobran.length > 0) resumen.push(`textos destacados: +${nuevos.length} −${sobran.length}`);
  }
  return { ruta: `customers/${cliente}/googleAds:mutate`, cuerpo: { mutateOperations: ops, validateOnly, partialFailure: false }, resumen };
}

/** Las filas de `GAQL_EXTENSIONES` de UNA campaña → extensiones actuales. */
export function extensionesActualesDeFilas(filas: Array<Record<string, unknown>>, campaignId: string): ExtensionActual[] {
  const salida: ExtensionActual[] = [];
  for (const f of filas) {
    const camp = ((f.campaign ?? {}) as { id?: string | number }).id;
    if (String(camp ?? "") !== String(campaignId)) continue;
    const v = (f.campaignAsset ?? {}) as { resourceName?: string; fieldType?: string };
    const asset = (f.asset ?? {}) as { finalUrls?: string[]; sitelinkAsset?: { linkText?: string; description1?: string; description2?: string }; calloutAsset?: { calloutText?: string } };
    if (!v.resourceName) continue;
    if (v.fieldType === "SITELINK" && asset.sitelinkAsset?.linkText) {
      salida.push({ enlace: v.resourceName, tipo: "SITELINK", texto: asset.sitelinkAsset.linkText, url: asset.finalUrls?.[0] ?? "", descripcion1: asset.sitelinkAsset.description1 ?? "", descripcion2: asset.sitelinkAsset.description2 ?? "" });
    } else if (v.fieldType === "CALLOUT" && asset.calloutAsset?.calloutText) {
      salida.push({ enlace: v.resourceName, tipo: "CALLOUT", texto: asset.calloutAsset.calloutText, url: "", descripcion1: "", descripcion2: "" });
    }
  }
  return salida;
}

export async function actualizarExtensionesCampana(
  cred: CredencialesGoogle,
  customerId: string,
  campaignId: string,
  cambios: CambiosExtensiones,
  { validateOnly = false }: { validateOnly?: boolean } = {},
): Promise<ResultadoMutacion & { resumen: string[] }> {
  const problemas = validarCambiosExtensiones(cambios);
  if (problemas.length > 0) throw new GoogleAdsNativoError(problemas.join(" "), 400);
  const filas = await consultarGaql(cred, customerId, GAQL_EXTENSIONES);
  const actuales = extensionesActualesDeFilas(filas, campaignId);
  const { ruta, cuerpo, resumen } = armarMutacionExtensiones(customerId, campaignId, actuales, cambios, { validateOnly });
  if ((cuerpo.mutateOperations as unknown[]).length === 0) return { soloValidado: validateOnly, resourceName: null, resumen: ["sin cambios"] };
  if (!validateOnly) registrarEscritura();
  let respuesta: { mutateOperationResponses?: Array<Record<string, { resourceName?: string }>> };
  try {
    respuesta = await llamar<typeof respuesta>(cred, ruta, cuerpo, 60_000);
  } finally {
    if (!validateOnly) registrarEscritura();
  }
  const primero = Object.values(respuesta.mutateOperationResponses?.[0] ?? {})[0];
  return { soloValidado: validateOnly, resourceName: primero?.resourceName ?? null, resumen };
}

/* -------------------------------------------------------------------------- */
/* Facturas (solo cuentas con facturación mensual)                            */
/* -------------------------------------------------------------------------- */

const MESES_GOOGLE = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

export type FacturaGoogle = {
  id: string;
  /** INVOICE o CREDIT_MEMO. */
  tipo: string;
  numeroDeFactura: string | null;
  emitida: string | null;
  vence: string | null;
  totalMicros: number | null;
  moneda: string | null;
  pdfUrl: string | null;
  resourceName: string;
};

async function obtener<T>(cred: CredencialesGoogle, ruta: string, timeoutMs = 30_000): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`https://googleads.googleapis.com/${cred.apiVersion}/${ruta}`, {
      method: "GET",
      headers: cabeceras(cred),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new GoogleAdsNativoError("No se pudo contactar a Google Ads. Intenta de nuevo en un momento.", 504, false, error instanceof Error ? error.message : String(error));
  }
  const json = (await respuesta.json().catch(() => null)) as T | ErrorDeGoogle | null;
  const error = json ? (json as ErrorDeGoogle).error : undefined;
  if (!respuesta.ok || error) {
    const status = respuesta.ok ? 502 : respuesta.status;
    throw new GoogleAdsNativoError(mensajePublico(status, error?.status), status, status === 401 || error?.status === "UNAUTHENTICATED", error ?? json);
  }
  return json as T;
}

/** Facturas de un mes de una cuenta con facturación mensual. Una cuenta sin ella devuelve lista vacía. */
export async function listarFacturasGoogle(cred: CredencialesGoogle, customerId: string, anio: number, mes: number): Promise<FacturaGoogle[]> {
  if (!(mes >= 1 && mes <= 12) || !(anio >= 2015 && anio <= 2100)) throw new GoogleAdsNativoError("Mes o año no válido.", 400);
  const id = idNumerico(customerId);
  const setups = await consultarGaql(cred, id, "SELECT billing_setup.resource_name, billing_setup.status FROM billing_setup WHERE billing_setup.status = 'APPROVED'");
  const salida: FacturaGoogle[] = [];
  for (const fila of setups) {
    const nombre = (fila.billingSetup as { resourceName?: string } | undefined)?.resourceName;
    if (!nombre) continue;
    const params = new URLSearchParams({ billingSetup: nombre, issueYear: String(anio), issueMonth: MESES_GOOGLE[mes - 1] });
    const j = await obtener<{ invoices?: Array<Record<string, unknown>> }>(cred, `customers/${id}/invoices?${params}`);
    for (const f of j.invoices ?? []) {
      salida.push({
        id: String(f.id ?? ""),
        tipo: String(f.type ?? "INVOICE"),
        numeroDeFactura: f.id ? String(f.id) : null,
        emitida: (f.issueDate as string) ?? null,
        vence: (f.dueDate as string) ?? null,
        totalMicros: f.totalAmountMicros !== undefined ? Number(f.totalAmountMicros) : null,
        moneda: (f.currencyCode as string) ?? null,
        pdfUrl: (f.pdfUrl as string) ?? null,
        resourceName: String(f.resourceName ?? ""),
      });
    }
  }
  return salida;
}

/* -------------------------------------------------------------------------- */
/* Campaña de Búsqueda con la estructura propia de Google, en una sola mutación */
/* -------------------------------------------------------------------------- */

export type PujaDeBusqueda =
  | { tipo: "clics"; cpcMaximoMicros?: number | null }
  | { tipo: "conversiones"; cpaObjetivoMicros?: number | null }
  | { tipo: "valor_conversion"; roasObjetivo?: number | null }
  | { tipo: "cpc_manual"; mejorarCpc?: boolean }
  | { tipo: "cuota_impresiones"; ubicacion: "TOP_OF_PAGE" | "ABSOLUTE_TOP_OF_PAGE" | "ANYWHERE_ON_PAGE"; porcentaje: number; cpcMaximoMicros: number };

export type DiaDeSemana = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export type TipoDeCoincidencia = "BROAD" | "PHRASE" | "EXACT";

export type DatosBusqueda = {
  nombre: string;
  presupuestoDiarioMicros: number;
  puja: PujaDeBusqueda;
  redes: { socios: boolean; display: boolean };
  /** «presencia»: solo personas que están en la ubicación; «presencia_o_interes»: también quienes muestran interés. */
  presencia: "presencia" | "presencia_o_interes";
  ubicaciones: string[];
  excluidas: string[];
  /** Círculo en el mapa (centro y radio en km). */
  proximidad?: { lat: number; lng: number; radioKm: number } | null;
  /** Ids de constante de idioma de Google (`1003` español, `1000` inglés, `1014` portugués). */
  idiomas: string[];
  programacion: Array<{ dias: DiaDeSemana[]; desde: number; hasta: number; ajuste?: number | null }>;
  /** aaaa-mm-dd; vacío = hoy. */
  inicio: string | null;
  fin: string | null;
  rotacion: "optimizar" | "indefinida";
  plantillaSeguimiento: string;
  sufijoUrl: string;
  grupo: { nombre: string; cpcMicros: number | null };
  palabras: Array<{ texto: string; tipo: TipoDeCoincidencia }>;
  negativas: Array<{ texto: string; tipo: TipoDeCoincidencia }>;
  anuncio: { urlFinal: string; titulares: string[]; descripciones: string[]; path1: string; path2: string };
  enlaces: Array<{ texto: string; descripcion1: string; descripcion2: string; url: string }>;
  destacados: string[];
  fragmento: { encabezado: string; valores: string[] } | null;
  llamada: { pais: string; telefono: string } | null;
  /** Grupo y anuncio: activos (la campaña sigue pausada y no entrega) o pausados. */
  activarHijos: boolean;
};

export function validarBusqueda(d: DatosBusqueda): string[] {
  const p: string[] = [];
  const t = d.anuncio.titulares.map((x) => x.trim()).filter(Boolean);
  const ds = d.anuncio.descripciones.map((x) => x.trim()).filter(Boolean);
  if (!d.nombre.trim()) p.push("Falta el nombre de la campaña.");
  if (!(d.presupuestoDiarioMicros >= 1_000_000)) p.push("Falta el presupuesto diario.");
  if (d.palabras.length === 0) p.push("Una campaña de Búsqueda necesita al menos una palabra clave.");
  if (!/^https?:\/\//i.test(d.anuncio.urlFinal.trim())) p.push("La URL final debe empezar con http:// o https://.");
  if (t.length < 3 || t.length > 15) p.push("El anuncio de búsqueda pide entre 3 y 15 títulos.");
  if (t.some((x) => x.length > 30)) p.push("Cada título admite hasta 30 caracteres.");
  if (ds.length < 2 || ds.length > 4) p.push("El anuncio de búsqueda pide entre 2 y 4 descripciones.");
  if (ds.some((x) => x.length > 90)) p.push("Cada descripción admite hasta 90 caracteres.");
  for (const [n, v] of [["1", d.anuncio.path1], ["2", d.anuncio.path2]] as const) {
    if (v.trim().length > 15) p.push(`La ruta visible ${n} admite hasta 15 caracteres.`);
  }
  if (d.anuncio.path2.trim() && !d.anuncio.path1.trim()) p.push("La ruta visible 2 exige la ruta 1.");
  if (d.ubicaciones.length === 0) p.push("Falta al menos una ubicación (país).");
  if (d.inicio && !/^\d{4}-\d{2}-\d{2}$/.test(d.inicio)) p.push("La fecha de inicio no es válida (aaaa-mm-dd).");
  if (d.fin && !/^\d{4}-\d{2}-\d{2}$/.test(d.fin)) p.push("La fecha de fin no es válida (aaaa-mm-dd).");
  if (d.inicio && d.fin && d.fin < d.inicio) p.push("La fecha de fin es anterior a la de inicio.");
  const pj = d.puja;
  if (pj.tipo === "cuota_impresiones" && !(pj.porcentaje > 0 && pj.porcentaje <= 100)) p.push("El porcentaje de cuota de impresiones debe estar entre 1 y 100.");
  if (pj.tipo === "cuota_impresiones" && !(pj.cpcMaximoMicros >= 1)) p.push("La cuota de impresiones exige un CPC máximo.");
  if (pj.tipo === "valor_conversion" && pj.roasObjetivo != null && !(pj.roasObjetivo > 0)) p.push("El ROAS objetivo debe ser mayor que cero.");
  for (const e of d.enlaces) {
    if (!e.texto.trim() || e.texto.trim().length > 25) p.push("Cada enlace de sitio admite entre 1 y 25 caracteres de texto.");
    if (e.descripcion1.length > 35 || e.descripcion2.length > 35) p.push("Las descripciones de un enlace de sitio admiten hasta 35 caracteres.");
    if (Boolean(e.descripcion1.trim()) !== Boolean(e.descripcion2.trim())) p.push(`El enlace «${e.texto.trim()}» necesita las dos descripciones o ninguna: Google no admite solo una.`);
    if (!/^https?:\/\//i.test(e.url.trim())) p.push("Cada enlace de sitio necesita una URL que empiece con http:// o https://.");
  }
  if (d.destacados.some((x) => x.trim().length > 25)) p.push("Cada texto destacado admite hasta 25 caracteres.");
  if (d.fragmento && (!d.fragmento.encabezado.trim() || d.fragmento.valores.filter((v) => v.trim()).length < 3)) p.push("El fragmento estructurado necesita un encabezado y al menos 3 valores.");
  if (d.llamada && (!/^[A-Z]{2}$/.test(d.llamada.pais) || !d.llamada.telefono.trim())) p.push("La llamada necesita país (2 letras) y teléfono.");
  return [...new Set(p)];
}

const fechaHora = (iso: string, fin: boolean) => `${iso} ${fin ? "23:59:59" : "00:00:00"}`;

/** Cuerpo exacto de la mutación (ids temporales negativos entre sí). Sin red. */
export function armarMutacionBusqueda(
  customerId: string,
  d: DatosBusqueda,
  { validateOnly = false, sello = Date.now() }: { validateOnly?: boolean; sello?: number } = {},
): { ruta: string; cuerpo: Record<string, unknown> } {
  const cliente = idNumerico(customerId);
  const rc = (tipo: string, n: number) => `customers/${cliente}/${tipo}/${n}`;
  const ops: Array<Record<string, unknown>> = [];
  const camp = rc("campaigns", -2);
  const grupo = rc("adGroups", -3);

  ops.push({
    campaignBudgetOperation: {
      create: { resourceName: rc("campaignBudgets", -1), name: `${d.nombre.trim()} · presupuesto ${sello}`, amountMicros: String(d.presupuestoDiarioMicros), deliveryMethod: "STANDARD", explicitlyShared: false },
    },
  });

  const puja: Record<string, unknown> = {};
  const pj = d.puja;
  if (pj.tipo === "clics") puja.targetSpend = pj.cpcMaximoMicros ? { cpcBidCeilingMicros: String(pj.cpcMaximoMicros) } : {};
  else if (pj.tipo === "conversiones") puja.maximizeConversions = pj.cpaObjetivoMicros ? { targetCpaMicros: String(pj.cpaObjetivoMicros) } : {};
  else if (pj.tipo === "valor_conversion") puja.maximizeConversionValue = pj.roasObjetivo ? { targetRoas: pj.roasObjetivo } : {};
  else if (pj.tipo === "cpc_manual") puja.manualCpc = { enhancedCpcEnabled: pj.mejorarCpc === true };
  else puja.targetImpressionShare = { location: pj.ubicacion, locationFractionMicros: String(Math.round(pj.porcentaje * 10_000)), cpcBidCeilingMicros: String(pj.cpcMaximoMicros) };

  ops.push({
    campaignOperation: {
      create: {
        resourceName: camp,
        name: d.nombre.trim(),
        advertisingChannelType: "SEARCH",
        status: "ENABLED", // decisión del equipo: lo aprobado queda corriendo
        campaignBudget: rc("campaignBudgets", -1),
        ...puja,
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: d.redes.socios, targetContentNetwork: d.redes.display, targetPartnerSearchNetwork: false },
        geoTargetTypeSetting: {
          positiveGeoTargetType: d.presencia === "presencia" ? "PRESENCE" : "PRESENCE_OR_INTEREST",
          negativeGeoTargetType: "PRESENCE",
        },
        containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        ...(d.plantillaSeguimiento.trim() ? { trackingUrlTemplate: d.plantillaSeguimiento.trim() } : {}),
        ...(d.sufijoUrl.trim() ? { finalUrlSuffix: d.sufijoUrl.trim() } : {}),
        ...(d.inicio ? { startDateTime: fechaHora(d.inicio, false) } : {}),
        ...(d.fin ? { endDateTime: fechaHora(d.fin, true) } : {}),
      },
    },
  });

  for (const id of d.ubicaciones) ops.push({ campaignCriterionOperation: { create: { campaign: camp, location: { geoTargetConstant: `geoTargetConstants/${id}` } } } });
  for (const id of d.excluidas) ops.push({ campaignCriterionOperation: { create: { campaign: camp, negative: true, location: { geoTargetConstant: `geoTargetConstants/${id}` } } } });
  if (d.proximidad) {
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: camp,
          proximity: {
            geoPoint: { latitudeInMicroDegrees: Math.round(d.proximidad.lat * 1_000_000), longitudeInMicroDegrees: Math.round(d.proximidad.lng * 1_000_000) },
            radius: d.proximidad.radioKm,
            radiusUnits: "KILOMETERS",
          },
        },
      },
    });
  }
  for (const id of d.idiomas) ops.push({ campaignCriterionOperation: { create: { campaign: camp, language: { languageConstant: `languageConstants/${id}` } } } });
  for (const bloque of d.programacion) {
    for (const dia of bloque.dias) {
      ops.push({
        campaignCriterionOperation: {
          create: {
            campaign: camp,
            adSchedule: { dayOfWeek: dia, startHour: bloque.desde, startMinute: "ZERO", endHour: bloque.hasta, endMinute: "ZERO" },
            ...(bloque.ajuste ? { bidModifier: bloque.ajuste } : {}),
          },
        },
      });
    }
  }
  for (const n of d.negativas) ops.push({ campaignCriterionOperation: { create: { campaign: camp, negative: true, keyword: { text: n.texto.trim(), matchType: n.tipo } } } });

  ops.push({
    adGroupOperation: {
      create: {
        resourceName: grupo,
        campaign: camp,
        name: d.grupo.nombre.trim() || `${d.nombre.trim()} · grupo 1`,
        status: "ENABLED",
        type: "SEARCH_STANDARD",
        // La rotación de anuncios ya no se fija en la campaña (Google lo dejó obsoleto): va en el grupo de anuncios.
        adRotationMode: d.rotacion === "indefinida" ? "ROTATE_FOREVER" : "OPTIMIZE",
        ...(d.grupo.cpcMicros ? { cpcBidMicros: String(d.grupo.cpcMicros) } : {}),
      },
    },
  });
  for (const k of d.palabras) ops.push({ adGroupCriterionOperation: { create: { adGroup: grupo, status: "ENABLED", keyword: { text: k.texto.trim(), matchType: k.tipo } } } });
  ops.push({
    adGroupAdOperation: {
      create: {
        adGroup: grupo,
        status: "ENABLED",
        ad: {
          finalUrls: [d.anuncio.urlFinal.trim()],
          responsiveSearchAd: {
            headlines: d.anuncio.titulares.map((x) => x.trim()).filter(Boolean).map((text) => ({ text })),
            descriptions: d.anuncio.descripciones.map((x) => x.trim()).filter(Boolean).map((text) => ({ text })),
            ...(d.anuncio.path1.trim() ? { path1: d.anuncio.path1.trim() } : {}),
            ...(d.anuncio.path2.trim() ? { path2: d.anuncio.path2.trim() } : {}),
          },
        },
      },
    },
  });

  // Recursos de la campaña: cada uno es un asset con id temporal y se enlaza a la campaña con su función.
  let sig = -10;
  const recurso = (asset: Record<string, unknown>, campo: string) => {
    const nombre = rc("assets", sig);
    sig -= 1;
    ops.push({ assetOperation: { create: { resourceName: nombre, ...asset } } });
    ops.push({ campaignAssetOperation: { create: { campaign: camp, asset: nombre, fieldType: campo } } });
  };
  for (const e of d.enlaces) {
    recurso(
      {
        finalUrls: [e.url.trim()],
        sitelinkAsset: {
          linkText: e.texto.trim(),
          ...(e.descripcion1.trim() ? { description1: e.descripcion1.trim() } : {}),
          ...(e.descripcion2.trim() ? { description2: e.descripcion2.trim() } : {}),
        },
      },
      "SITELINK",
    );
  }
  for (const c of d.destacados.map((x) => x.trim()).filter(Boolean)) recurso({ calloutAsset: { calloutText: c } }, "CALLOUT");
  if (d.fragmento) recurso({ structuredSnippetAsset: { header: d.fragmento.encabezado.trim(), values: d.fragmento.valores.map((v) => v.trim()).filter(Boolean) } }, "STRUCTURED_SNIPPET");
  if (d.llamada) recurso({ callAsset: { countryCode: d.llamada.pais, phoneNumber: d.llamada.telefono.trim() } }, "CALL");

  return { ruta: `customers/${cliente}/googleAds:mutate`, cuerpo: { mutateOperations: ops, validateOnly, partialFailure: false } };
}

export type ResultadoBusqueda = { campanaId: string | null; grupoId: string | null; recursos: string[]; soloValidado: boolean };

/** Valida los datos y, salvo `soloValidar`, crea la campaña entera. Con `soloValidar` Google valida contra la cuenta sin crear nada. */
export async function crearCampanaBusqueda(
  cred: CredencialesGoogle,
  customerId: string,
  datos: DatosBusqueda,
  { soloValidar = false }: { soloValidar?: boolean } = {},
): Promise<ResultadoBusqueda> {
  const problemas = validarBusqueda(datos);
  if (problemas.length > 0) throw new GoogleAdsNativoError(problemas.join(" "), 400);
  const { ruta, cuerpo } = armarMutacionBusqueda(customerId, datos, { validateOnly: soloValidar });
  if (!soloValidar) registrarEscritura();
  let respuesta: { mutateOperationResponses?: Array<Record<string, { resourceName?: string }>> };
  try {
    respuesta = await llamar<typeof respuesta>(cred, ruta, cuerpo, 90_000);
  } finally {
    if (!soloValidar) registrarEscritura();
  }
  const recursos = (respuesta.mutateOperationResponses ?? []).flatMap((r) => Object.values(r).map((v) => v.resourceName ?? "")).filter(Boolean);
  const campana = recursos.find((r) => /\/campaigns\/\d+$/.test(r));
  const grupo = recursos.find((r) => /\/adGroups\/\d+$/.test(r));
  return { campanaId: campana?.split("/").pop() ?? null, grupoId: grupo?.split("/").pop() ?? null, recursos, soloValidado: soloValidar };
}

/** Prefijo de todo lo que se crea para probar: es lo único que esta función deja borrar. */
export const PREFIJO_DE_PRUEBA_GOOGLE = "PRUEBA-WIWOADS";

/** Elimina (estado REMOVED) una campaña de PRUEBA de Google. Nunca toca una campaña cuyo nombre no lleve el prefijo. */
export async function eliminarCampanaDePrueba(cred: CredencialesGoogle, customerId: string, campaignId: string): Promise<void> {
  if (!/^\d+$/.test(campaignId)) throw new GoogleAdsNativoError("Id de campaña no válido.", 400);
  const filas = await consultarGaql(cred, customerId, `SELECT campaign.id, campaign.name FROM campaign WHERE campaign.id = ${campaignId}`);
  const nombre = (filas[0]?.campaign as { name?: string } | undefined)?.name ?? "";
  if (!nombre.includes(PREFIJO_DE_PRUEBA_GOOGLE)) {
    throw new GoogleAdsNativoError(`No se borra: «${nombre || campaignId}» no es una campaña de prueba.`, 403);
  }
  registrarEscritura();
  await llamar(cred, `customers/${idNumerico(customerId)}/campaigns:mutate`, {
    operations: [{ remove: `customers/${idNumerico(customerId)}/campaigns/${campaignId}` }],
  });
}

/** Recursos que la API de Google Ads ofrece de verdad (catálogo oficial de la API). Solo lectura; no toca ninguna cuenta. */
export async function listarRecursosDeGoogle(cred: CredencialesGoogle): Promise<string[]> {
  const r = await llamar<{ results?: Array<{ name?: string }> }>(cred, "googleAdsFields:search", {
    query: "SELECT name, category WHERE category = 'RESOURCE'",
    pageSize: 1000,
  });
  return (r.results ?? []).map((x) => x.name ?? "").filter(Boolean).sort();
}

/**
 * Cuándo se creó el último anuncio de cada campaña de Google, a partir del historial de cambios (Google lo guarda 30 días).
 * Una campaña que no aparece no recibió anuncios nuevos en esos 30 días. Solo lectura.
 */
export async function ultimoAnuncioGooglePorCampana(cred: CredencialesGoogle, customerId: string, ahora = new Date()): Promise<Map<string, number>> {
  const formato = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  const desde = new Date(ahora.getTime() - 29 * 86_400_000);
  const filas = await consultarGaql(
    cred,
    customerId,
    `SELECT change_event.change_date_time, change_event.campaign, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields FROM change_event
     WHERE change_event.change_date_time >= '${formato(desde)}' AND change_event.change_date_time <= '${formato(ahora)}'
       AND change_event.change_resource_type IN ('AD_GROUP_AD', 'AD') AND change_event.resource_change_operation IN ('CREATE', 'UPDATE')
     ORDER BY change_event.change_date_time DESC LIMIT 10000`,
  );
  const salida = new Map<string, number>();
  for (const f of filas) {
    const ev = (f.changeEvent ?? {}) as { changeDateTime?: string; campaign?: string; changeResourceType?: string; resourceChangeOperation?: string; changedFields?: unknown };
    // Cuenta un anuncio nuevo o un cambio del contenido de uno existente (titulares, descripciones, URL, rutas); pausar o activar no.
    const campos = JSON.stringify(ev.changedFields ?? "");
    const esContenido = ev.resourceChangeOperation === "CREATE" || /responsive_search_ad|responsiveSearchAd|final_urls|finalUrls|responsive_display_ad|responsiveDisplayAd/i.test(campos);
    if (!esContenido) continue;
    const id = /campaigns\/(\d+)/.exec(ev.campaign ?? "")?.[1];
    const t = ev.changeDateTime ? Date.parse(ev.changeDateTime.replace(" ", "T") + "Z") : NaN;
    if (id && Number.isFinite(t) && t > (salida.get(id) ?? 0)) salida.set(id, t);
  }
  return salida;
}
