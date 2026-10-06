/**
 * LinkedIn directo (Advertising API y Lead Sync API) con el token de OAuth de una persona del equipo.
 *
 * CONVIVE con Windsor: LinkedIn se sigue leyendo por Windsor y esto solo se usa si hay credenciales. Si no las hay
 * (`linkedinNativoConfigurado()` es falso) o si LinkedIn rechaza la llamada, quien lo use debe caer a Windsor.
 *
 * Alcance: solo cuentas ya asociadas a un cliente de WiWO.ADS. Estas funciones NO lo verifican (el token ve más
 * cuentas que esas): lo comprueba la ruta que las llame, como con `meta-nativo.ts`. No hay reintentos y no se escribe nada en
 * LinkedIn desde aquí. Nunca se registra ni se devuelve un token, un secreto ni el contenido de un lead.
 *
 * Pendiente: guardar los tokens (cifrados, como `integration-store.ts`) y la ruta de autorización/callback. SIN VERIFICAR
 * contra la API real: ver la nota en `linkedin-nativo-pura.ts`.
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
export function alcancesSolicitados(productos: { leads?: boolean; administrar?: boolean } = {}): string[] {
  return [...ALCANCES.lectura, ...(productos.leads ? ALCANCES.leads : []), ...(productos.administrar ? ALCANCES.administrar : [])];
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

export type CuentaDeLinkedin = { id: string; nombre: string; moneda: string | null; estado: string | null };

export async function cuentasDeLinkedin(accessToken: string): Promise<CuentaDeLinkedin[]> {
  const cuerpo = await leerDeLinkedin(rutaDeCuentas(), accessToken);
  return elementos(cuerpo).map((c) => ({
    id: String(c.id ?? ""),
    nombre: typeof c.name === "string" ? c.name : String(c.id ?? ""),
    moneda: typeof c.currency === "string" ? c.currency : null,
    estado: typeof c.status === "string" ? c.status : null,
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
