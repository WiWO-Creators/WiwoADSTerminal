import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

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
const DEV_SIGN_IN_PATH = "/acceso";
const DEV_SIGN_OUT_PATH = "/api/acceso/salir";

/**
 * Sesión local de desarrollo — y, con DEV_LOGIN_ENABLED apagado, el único
 * respaldo del formulario de correo sin verificar en `/api/acceso`.
 *
 * En producción la identidad normalmente la inyecta el dispatch de ChatGPT
 * Sites por cabeceras. `DEV_LOGIN_ENABLED` solo abre esa puerta insegura de
 * "escribe cualquier correo" para desarrollo local.
 */
export function devLoginEnabled(): boolean {
  return env.DEV_LOGIN_ENABLED === "true";
}

async function getCookieSessionUser(): Promise<ChatGPTUser | null> {
  const store = await cookies();
  const email = store.get(DEV_SESSION_COOKIE)?.value?.trim().toLowerCase();
  if (!email) return null;
  return { id: `email:${email}`, displayName: email, email, fullName: null };
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) {
    // Sin cabecera de ChatGPT Sites: puede haber una sesión de esta cookie
    // igual — no solo por el formulario de desarrollo (ese sigue exigiendo
    // DEV_LOGIN_ENABLED antes de poder escribirla), sino por haber entrado
    // con Google en `/acceso`, que sí funciona siempre y verifica el
    // dominio del correo antes de dejar escribir la cookie.
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
 * (Google, con el dominio de la empresa) es la puerta que de verdad funciona
 * para ese caso, esté o no `DEV_LOGIN_ENABLED` prendido.
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
 * `DEV_LOGIN_ENABLED` manda primero: en desarrollo local, la cabecera puede
 * venir simulada (el script que abre el navegador local la inyecta para
 * probar como si fuera ChatGPT Sites), pero `/signout-with-chatgpt` no
 * existe de verdad acá —lo intercepta el dispatch real, que en local no
 * corre— así que mandar ahí daba 404. Con el interruptor de desarrollo
 * prendido, siempre se usa la salida propia, sin mirar la cabecera.
 */
export async function chatGPTSignOutPath(returnTo = "/"): Promise<string> {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  const conCabeceraReal =
    !devLoginEnabled() && Boolean((await headers()).get(USER_EMAIL_HEADER));
  const base = conCabeceraReal ? SIGN_OUT_PATH : DEV_SIGN_OUT_PATH;
  return `${base}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export const DEV_SESSION_COOKIE_NAME = DEV_SESSION_COOKIE;

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
