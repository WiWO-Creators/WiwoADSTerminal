/**
 * LinkedIn directo (Advertising API y Lead Sync API) con el token de OAuth de una persona del equipo.
 *
 * CONVIVE con Windsor: LinkedIn se sigue leyendo por Windsor y esto solo se usa si hay credenciales. Si no las hay
 * (`linkedinNativoConfigurado()` es falso) o si LinkedIn rechaza la llamada, quien lo use debe caer a Windsor.
 *
 * Alcance: solo cuentas ya asociadas a un cliente de WiWO.ADS. Estas funciones NO lo verifican (el token ve más
 * cuentas que esas): lo comprueba la ruta que las llame, como con `meta-nativo.ts`. No hay reintentos. Lo único que escribe
 * es `crearEnLinkedin`, que solo usa la ruta de la cuenta de prueba y solo tras una confirmación explícita. Nunca se
 * registra ni se devuelve un token, un secreto ni el contenido de un lead.
 *
 * Los tokens se guardan cifrados en `lib/linkedin-conexion.ts`. SIN VERIFICAR contra la API real: ver la nota en
 * `linkedin-nativo-pura.ts`.
 */
import { env } from "cloudflare:workers";
import {
  ALCANCES,
  ErrorDeLinkedin,
  VERSION_API_POR_DEFECTO,
  cuerpoCanjeDeCodigo,
  cuerpoDeRenovacion,
  elementos,
  filaDeAnalytics,
  idDeCreacion,
  mensajeDeError,
  respuestaDeLead,
  rutaDeAnalytics,
  rutaDeCampanas,
  rutaDeCuentas,
  rutaDeGrupos,
  rutaDeLeads,
  tokensDeRespuesta,
  urlDeAutorizacion,
  type RespuestaDeLead,
  type TokensLinkedin,
} from "@/lib/linkedin-nativo-pura";
import type { FilaCruda } from "@/lib/linkedin";

const BASE = "https://api.linkedin.com";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const TIEMPO_MAXIMO_MS = 30_000;

/** Acepta los nombres «CLIENT» (los de LinkedIn) y «APP» (como en Meta: META_APP_ID / META_APP_SECRET). */
const idDeApp = (): string | undefined => env.LINKEDIN_CLIENT_ID || env.LINKEDIN_APP_ID;
const secretoDeApp = (): string | undefined => env.LINKEDIN_CLIENT_SECRET || env.LINKEDIN_APP_SECRET;

export const linkedinNativoConfigurado = (): boolean => Boolean(idDeApp() && secretoDeApp());

/** Qué le falta para conectarse, en lenguaje de la pantalla de Integraciones. */
export function faltaParaLinkedin(): string[] {
  const falta: string[] = [];
  if (!idDeApp() || !secretoDeApp()) falta.push("credenciales de la app de LinkedIn");
  if (!env.OAUTH_TOKEN_KEY) falta.push("llave de cifrado");
  return falta;
}

function credenciales(): { clientId: string; clientSecret: string } {
  const clientId = idDeApp();
  const clientSecret = secretoDeApp();
  if (!clientId || !clientSecret) {
    throw new ErrorDeLinkedin("Faltan LINKEDIN_CLIENT_ID y LINKEDIN_CLIENT_SECRET (o LINKEDIN_APP_ID y LINKEDIN_APP_SECRET).", 503);
  }
  return { clientId, clientSecret };
}

/** Alcances según los productos aprobados. Pedir uno no aprobado hace fallar toda la autorización. */
export function alcancesSolicitados(productos: { leads?: boolean; administrar?: boolean; anuncios?: boolean; perfil?: boolean } = {}): string[] {
  return [
    ...ALCANCES.lectura,
    ...(productos.perfil ? ALCANCES.perfil : []),
    ...(productos.administrar ? ALCANCES.administrar : []),
    ...(productos.anuncios ? ALCANCES.anuncios : []),
    ...(productos.leads ? ALCANCES.leads : []),
  ];
}

export function crearUrlDeAutorizacion(redirectUri: string, state: string, alcances: readonly string[]): string {
  return urlDeAutorizacion({ clientId: credenciales().clientId, redirectUri, state, alcances });
}

async function pedirToken(cuerpo: URLSearchParams): Promise<TokensLinkedin> {
  const respuesta = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: cuerpo,
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
  });
  const json = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!respuesta.ok) {
    // Solo la descripción pública del error: el cuerpo de la petición lleva el secreto y no se vuelca.
    const detalle = typeof json.error_description === "string" ? json.error_description : "";
    throw new ErrorDeLinkedin(`LinkedIn rechazó el intercambio de token (${respuesta.status}). ${detalle}`.trim(), respuesta.status === 400 ? 400 : 502);
  }
  return tokensDeRespuesta(json, Date.now());
}

export async function canjearCodigoDeLinkedin(code: string, redirectUri: string): Promise<TokensLinkedin> {
  return pedirToken(cuerpoCanjeDeCodigo({ code, redirectUri, ...credenciales() }));
}

export async function renovarTokenDeLinkedin(refreshToken: string): Promise<TokensLinkedin> {
  return pedirToken(cuerpoDeRenovacion({ refreshToken, ...credenciales() }));
}

/** GET a la API REST de LinkedIn. `ruta` ya viene armada por `linkedin-nativo-pura.ts` (Rest.li no admite re-codificarla). */
/**
 * El nombre de quien autorizó (necesita `r_basicprofile`). Es solo informativo: si LinkedIn no lo entrega, devuelve `null` y la
 * conexión sigue igual. Usa la ruta clásica `/v2/me`, que no lleva la cabecera de versión de las rutas nuevas.
 */
export async function nombreDeQuienAutorizo(accessToken: string): Promise<string | null> {
  try {
    const respuesta = await fetch(`${BASE}/v2/me`, { cache: "no-store", signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS), headers: { authorization: `Bearer ${accessToken}` } });
    if (!respuesta.ok) return null;
    const j = (await respuesta.json().catch(() => null)) as { localizedFirstName?: string; localizedLastName?: string } | null;
    const nombre = [j?.localizedFirstName, j?.localizedLastName].filter((x): x is string => typeof x === "string" && x.trim() !== "").join(" ").trim();
    return nombre || null;
  } catch {
    return null;
  }
}

export async function leerDeLinkedin(ruta: string, accessToken: string): Promise<unknown> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "Linkedin-Version": env.LINKEDIN_API_VERSION?.trim() || VERSION_API_POR_DEFECTO,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new ErrorDeLinkedin(mensajeDeError(cuerpo, respuesta.status), respuesta.status);
  return cuerpo;
}

// ------------------------------------------------------------ Advertising API (lectura)

export type CuentaDeLinkedin = { id: string; nombre: string; moneda: string | null; estado: string | null; prueba: boolean };

export async function cuentasDeLinkedin(accessToken: string): Promise<CuentaDeLinkedin[]> {
  const cuerpo = await leerDeLinkedin(rutaDeCuentas(), accessToken);
  return elementos(cuerpo).map((c) => ({
    id: String(c.id ?? ""),
    nombre: typeof c.name === "string" ? c.name : String(c.id ?? ""),
    moneda: typeof c.currency === "string" ? c.currency : null,
    estado: typeof c.status === "string" ? c.status : null,
    prueba: c.test === true,
  }));
}

/** Grupos de campañas (la «campaña» de WiWO.ADS) y campañas (su «conjunto»), tal como vienen. */
export async function gruposDeLinkedin(cuentaId: string, accessToken: string) {
  return elementos(await leerDeLinkedin(rutaDeGrupos(cuentaId), accessToken));
}
export async function campanasDeLinkedin(cuentaId: string, accessToken: string) {
  return elementos(await leerDeLinkedin(rutaDeCampanas(cuentaId), accessToken));
}

/** Métricas diarias por campaña en el vocabulario de Windsor, para pasarlas por `adaptarFilaLinkedin`. */
export async function metricasDiariasDeLinkedin(
  cuenta: { id: string; nombre?: string; moneda?: string },
  rango: { desde: string; hasta: string },
  accessToken: string,
): Promise<FilaCruda[]> {
  const cuerpo = await leerDeLinkedin(rutaDeAnalytics({ cuentaId: cuenta.id, ...rango }), accessToken);
  return elementos(cuerpo).map((el) => filaDeAnalytics(el, cuenta));
}

// ------------------------------------------------------------ Lead Sync API (lectura)

/** Respuestas de formularios de una cuenta. Devuelve datos personales: no guardarlos en logs ni en la bitácora. */
export async function leadsDeLinkedin(cuentaId: string, accessToken: string): Promise<RespuestaDeLead[]> {
  return elementos(await leerDeLinkedin(rutaDeLeads(cuentaId), accessToken)).map(respuestaDeLead);
}

// ------------------------------------------------------------ Escritura (solo la cuenta de prueba, por ahora)

/**
 * `POST` a la API REST de LinkedIn para CREAR algo. NUNCA reintenta: un timeout es ambiguo (LinkedIn pudo crearlo) y
 * reintentar duplicaría. Devuelve el id creado (cabecera `x-restli-id`) y, si LinkedIn no lo entrega, `null`: quien llame
 * debe verificarlo contra LinkedIn antes de dar la operación por hecha.
 */
export async function crearEnLinkedin(ruta: string, cuerpo: object, accessToken: string): Promise<{ id: string | null; status: number }> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "Linkedin-Version": env.LINKEDIN_API_VERSION?.trim() || VERSION_API_POR_DEFECTO,
      // Sin la cabecera X-Restli-Protocol-Version: crear una cuenta de prueba con ella responde «Syntax exception in path variables» (doc de LinkedIn).
      "content-type": "application/json",
    },
    body: JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new ErrorDeLinkedin(mensajeDeError(error, respuesta.status), respuesta.status);
  }
  return { id: idDeCreacion(respuesta.headers), status: respuesta.status };
}

/**
 * Envía a LinkedIn un plan ya armado por `linkedin-escritura-pura.ts` (crear o actualizar grupos y campañas). NUNCA reintenta
 * (un timeout es ambiguo y reintentar duplicaría). Estas rutas sí llevan `X-Restli-Protocol-Version: 2.0.0` (la creación de
 * cuentas de prueba es la excepción). Una actualización responde 204 sin cuerpo; una creación entrega el id en `x-linkedin-id`.
 */
export async function enviarPlanALinkedin(
  plan: { ruta: string; cuerpo: object; cabeceras: Record<string, string> },
  accessToken: string,
): Promise<{ id: string | null; status: number }> {
  const respuesta = await fetch(`${BASE}${plan.ruta}`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "Linkedin-Version": env.LINKEDIN_API_VERSION?.trim() || VERSION_API_POR_DEFECTO,
      "X-Restli-Protocol-Version": "2.0.0",
      "content-type": "application/json",
      ...plan.cabeceras,
    },
    body: JSON.stringify(plan.cuerpo),
  });
  if (!respuesta.ok) {
    const error = (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;
    // Los errores de validación de LinkedIn dicen qué campo falló: sin eso no se puede corregir un plan.
    const detalle = typeof error?.message === "string" ? ` ${error.message}` : "";
    throw new ErrorDeLinkedin(`${mensajeDeError(error, respuesta.status)}${respuesta.status === 400 ? detalle : ""}`.trim(), respuesta.status);
  }
  return { id: idDeCreacion(respuesta.headers), status: respuesta.status };
}

// ------------------------------------------------------------ Páginas de empresa (lectura)

export type PaginaDeLinkedin = { id: string; urn: string; rol: string; estado: string | null; nombre: string | null };

/**
 * Las páginas de empresa sobre las que la persona conectada tiene algún rol (`organizationAcls`, necesita
 * `r_organization_admin`). Sirve para saber en nombre de qué páginas puede crear anuncios o publicaciones. Los nombres son
 * un extra: si LinkedIn no los entrega, se devuelve solo el id.
 */
export async function paginasDeLinkedin(accessToken: string): Promise<PaginaDeLinkedin[]> {
  const cuerpo = await leerDeLinkedin("/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100", accessToken);
  const paginas: PaginaDeLinkedin[] = elementos(cuerpo)
    .map((a) => {
      const urn = String(a.organization ?? "");
      return { id: urn.split(":").pop() ?? "", urn, rol: String(a.role ?? ""), estado: typeof a.state === "string" ? a.state : null, nombre: null };
    })
    .filter((p) => /^\d+$/.test(p.id));
  if (paginas.length === 0) return paginas;
  try {
    const ids = [...new Set(paginas.map((p) => p.id))].join(",");
    const lote = (await leerDeLinkedin(`/rest/organizationsLookup?ids=List(${ids})`, accessToken)) as { results?: Record<string, { localizedName?: string }> } | null;
    for (const p of paginas) p.nombre = lote?.results?.[p.id]?.localizedName ?? null;
  } catch {
    // Los nombres son opcionales: sin ellos igual sirve el id.
  }
  return paginas;
}

// ------------------------------------------------------------ Ubicaciones (lectura)

export type UbicacionDeLinkedin = { id: string; nombre: string | null };

/**
 * Los nombres de ubicaciones de LinkedIn por id (`urn:li:geo:ID`). Sirve para comprobar que un id apunta de verdad al país que
 * se cree: un id equivocado segmentaría (y gastaría) en otro lugar. Prueba la ruta versionada y, si no existe, la clásica.
 */
export async function ubicacionesDeLinkedin(ids: string[], accessToken: string): Promise<UbicacionDeLinkedin[]> {
  const limpios = ids.filter((id) => /^\d{1,15}$/.test(id));
  if (limpios.length === 0) return [];
  const lista = limpios.join(",");
  let cuerpo: unknown = null;
  try {
    cuerpo = await leerDeLinkedin(`/rest/geo?ids=List(${lista})`, accessToken);
  } catch {
    cuerpo = await leerDeLinkedin(`/v2/geo?ids=List(${lista})`, accessToken);
  }
  const resultados = (cuerpo as { results?: Record<string, Record<string, unknown>> } | null)?.results ?? {};
  return limpios.map((id) => {
    const geo = resultados[id] ?? {};
    const local = geo.defaultLocalizedName as { value?: unknown } | undefined;
    return { id, nombre: typeof local?.value === 'string' ? local.value : typeof geo.name === 'string' ? geo.name : null };
  });
}
