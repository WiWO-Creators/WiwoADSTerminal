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
 * Sesión local de desarrollo.
 *
 * En producción la identidad la inyecta el dispatch de ChatGPT Sites por
 * cabeceras. Local eso no existe, así que se habilita un login propio con
 * DEV_LOGIN_ENABLED en .dev.vars. Fuera de ese caso el interruptor está
 * apagado y nada de esto se activa: la cabecera sigue mandando siempre.
 */
export function devLoginEnabled(): boolean {
  return env.DEV_LOGIN_ENABLED === "true";
}

async function getDevSessionUser(): Promise<ChatGPTUser | null> {
  const store = await cookies();
  const email = store.get(DEV_SESSION_COOKIE)?.value?.trim().toLowerCase();
  if (!email) return null;
  return { id: `email:${email}`, displayName: email, email, fullName: null };
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) {
    return devLoginEnabled() ? await getDevSessionUser() : null;
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

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  const base = devLoginEnabled() ? DEV_SIGN_IN_PATH : SIGN_IN_PATH;
  return `${base}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  const base = devLoginEnabled() ? DEV_SIGN_OUT_PATH : SIGN_OUT_PATH;
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
