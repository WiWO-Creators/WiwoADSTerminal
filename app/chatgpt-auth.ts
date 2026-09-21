import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

import {
  firmarSesion,
  SESION_SEGUNDOS,
  verificarSesion,
} from "@/lib/sesion-firmada";

export type ChatGPTUser = {
  id: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";
const DEV_SESSION_COOKIE = "wiwo-dev-user";
/**
 * Nombre de pila de quien entró, para saludarlo por su nombre y no por su
 * correo. Va aparte del cookie de sesión a propósito: es cosmético y puede
 * faltar (una cuenta de Google sin nombre, o una sesión abierta antes de
 * que esto existiera), y en ese caso se cae al correo sin romper nada.
 */
const DEV_NAME_COOKIE = "wiwo-dev-nombre";
const DEV_SIGN_IN_PATH = "/acceso";
const DEV_SIGN_OUT_PATH = "/api/acceso/salir";

/**
 * Marca que estamos corriendo en local, donde las rutas del dispatch de
 * ChatGPT Sites no existen.
 *
 * La variable se sigue llamando `DEV_LOGIN_ENABLED` por compatibilidad con
 * los `.dev.vars` que ya tiene el equipo, pero su viejo trabajo —abrir el
 * formulario de "escribe cualquier correo"— desapareció junto con esa
 * puerta: ahora solo se entra con Google. Lo único que sigue decidiendo es
 * a qué salida mandar (ver `chatGPTSignOutPath`).
 */
function enLocalSinDispatch(): boolean {
  return env.DEV_LOGIN_ENABLED === "true";
}

/**
 * Corriendo en un servidor propio (VPS), no dentro de ChatGPT Sites.
 *
 * Allí las cabeceras `oai-authenticated-user-*` las pone la plataforma; en un
 * servidor propio las puede mandar cualquiera, así que confiar en ellas
 * equivale a dejar entrar como admin a quien escriba un correo. El puente de
 * `servidor/cloudflare-workers.mjs` marca este modo y las cabeceras se ignoran.
 */
function enServidorPropio(): boolean {
  return env.WIWO_RUNTIME === "node";
}

/** Secreto con el que se firma la sesión. Sin él no se puede iniciar sesión. */
function secretoDeSesion(): string | null {
  return env.SESSION_SECRET || env.OAUTH_TOKEN_KEY || null;
}

/**
 * La cookie de sesión lista para `Set-Cookie`, o `null` si el servidor no
 * tiene secreto configurado (en ese caso no se abre ninguna sesión).
 */
export async function cookieDeSesion(
  correo: string,
  seguro: boolean,
): Promise<string | null> {
  const secreto = secretoDeSesion();
  if (!secreto) return null;
  const valor = await firmarSesion(correo, secreto);
  return `${DEV_SESSION_COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESION_SEGUNDOS}${seguro ? "; Secure" : ""}`;
}

async function getCookieSessionUser(): Promise<ChatGPTUser | null> {
  const store = await cookies();
  const secreto = secretoDeSesion();
  if (!secreto) return null;
  // Una cookie sin firma válida (incluida la vieja, que era solo el correo) no
  // es una sesión: se trata como si no hubiera ninguna.
  const email = await verificarSesion(store.get(DEV_SESSION_COOKIE)?.value, secreto);
  if (!email) return null;

  // Se guardó con encodeURIComponent y Next entrega el valor crudo: sin
  // decodificar, "José" se leería "Jos%C3%A9".
  const crudo = store.get(DEV_NAME_COOKIE)?.value;
  const fullName = crudo
    ? (safeDecodeURIComponent(crudo) ?? crudo).trim() || null
    : null;
  return {
    id: `email:${email}`,
    displayName: fullName ?? nombreDesdeCorreo(email),
    email,
    fullName,
  };
}

/**
 * Último recurso cuando no hay nombre: la parte del correo antes de la
 * arroba. "mdarras@empresa.com" queda en "mdarras" — impersonal, pero
 * saludar con la dirección entera se lee como un error del sistema.
 */
function nombreDesdeCorreo(email: string): string {
  return email.split("@")[0] || email;
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const email = enServidorPropio() ? null : requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) {
    // Sin cabecera de ChatGPT Sites puede haber una sesión de esta cookie
    // igual: la escribe el callback de Google en `/acceso`, que verifica el
    // dominio del correo antes de dejarla. Es la única forma de obtenerla.
    return await getCookieSessionUser();
  }
  const id =
    requestHeaders.get(USER_ID_HEADER) ?? `email:${email.trim().toLowerCase()}`;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    id,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

/**
 * A dónde mandar a alguien sin sesión.
 *
 * `SIGN_IN_PATH` (`/signin-with-chatgpt`) no es una ruta de esta app: solo
 * existe si el dispatch de ChatGPT Sites la intercepta por fuera, antes de
 * que la petición llegue acá. Pero si `getChatGPTUser` ya dijo que no hay
 * sesión, es porque esa cabecera nunca llegó — quien entra así nunca pasa
 * por ese dispatch, así que mandarlo ahí sería un enlace muerto. `/acceso`
 * (Google, con el dominio de la empresa) es la puerta que de verdad
 * funciona para ese caso, y desde que se quitó el formulario de correo, la
 * única.
 */
export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${DEV_SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

/**
 * A dónde mandar a alguien que cierra sesión — a diferencia de
 * `chatGPTSignInPath`, esto sí depende de cómo entró *esta* persona, no de
 * si hay una sesión o no: alguien con la cabecera real de ChatGPT Sites
 * necesita el `/signout-with-chatgpt` externo (lo único que de verdad borra
 * esa sesión); alguien que entró con Google solo necesita borrar la cookie
 * propia en `/api/acceso/salir`. Mandar al primero al segundo no cerraría
 * nada — la cabecera volvería a llegar en la siguiente carga.
 *
 * En local manda `enLocalSinDispatch`: la cabecera puede venir simulada (el
 * script que abre el navegador la inyecta para probar como si fuera ChatGPT
 * Sites), pero `/signout-with-chatgpt` no existe de verdad acá —lo
 * intercepta el dispatch real, que en local no corre— así que mandar ahí
 * daba 404. Con el interruptor prendido se usa siempre la salida propia,
 * sin mirar la cabecera.
 */
export async function chatGPTSignOutPath(returnTo = "/"): Promise<string> {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  const conCabeceraReal =
    !enLocalSinDispatch() &&
    !enServidorPropio() &&
    Boolean((await headers()).get(USER_EMAIL_HEADER));
  const base = conCabeceraReal ? SIGN_OUT_PATH : DEV_SIGN_OUT_PATH;
  return `${base}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export const DEV_SESSION_COOKIE_NAME = DEV_SESSION_COOKIE;
export const DEV_NAME_COOKIE_NAME = DEV_NAME_COOKIE;

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH ||
    pathname === DEV_SIGN_IN_PATH ||
    pathname === DEV_SIGN_OUT_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
