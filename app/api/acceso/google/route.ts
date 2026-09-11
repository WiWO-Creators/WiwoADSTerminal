import { env } from "cloudflare:workers";

import { devLoginEnabled } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export const GOOGLE_STATE_COOKIE = "wiwo-acceso-state";
export const GOOGLE_VERIFIER_COOKIE = "wiwo-acceso-verifier";
export const GOOGLE_RETURN_COOKIE = "wiwo-acceso-return";

export function googleLoginConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export async function GET(request: Request) {
  if (!devLoginEnabled()) return new Response("No disponible", { status: 404 });

  const url = new URL(request.url);
  const returnTo = safePath(url.searchParams.get("return_to"));

  if (!googleLoginConfigured()) {
    return backToLogin(request, "google_no_configurado", returnTo);
  }

  const state = randomToken(32);
  const verifier = randomToken(64);
  const redirectUri = `${url.origin}/api/acceso/google/callback`;

  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid email profile");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("code_challenge", await sha256Base64Url(verifier));
  // Deja elegir cuenta en vez de reusar la sesión activa del navegador.
  authorize.searchParams.set("prompt", "select_account");

  const headers = new Headers({
    location: authorize.toString(),
    "cache-control": "no-store",
  });
  headers.append("set-cookie", shortCookie(GOOGLE_STATE_COOKIE, state));
  headers.append("set-cookie", shortCookie(GOOGLE_VERIFIER_COOKIE, verifier));
  headers.append("set-cookie", shortCookie(GOOGLE_RETURN_COOKIE, returnTo));
  return new Response(null, { status: 302, headers });
}

export function shortCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function safePath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function backToLogin(
  request: Request,
  error: string,
  returnTo: string,
) {
  const url = new URL("/acceso", request.url);
  url.searchParams.set("error", error);
  url.searchParams.set("return_to", returnTo);
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), "cache-control": "no-store" },
  });
}

export function randomToken(bytes: number): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return toBase64Url(raw);
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
