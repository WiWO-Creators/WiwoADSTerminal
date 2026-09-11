import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

import {
  DEV_SESSION_COOKIE_NAME,
  devLoginEnabled,
} from "@/app/chatgpt-auth";
import {
  backToLogin,
  clearCookie,
  GOOGLE_RETURN_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  googleLoginConfigured,
  safePath,
} from "../route";

export const dynamic = "force-dynamic";

const SESSION_SECONDS = 60 * 60 * 12;

export async function GET(request: Request) {
  if (!devLoginEnabled()) return new Response("No disponible", { status: 404 });

  const url = new URL(request.url);
  const store = await cookies();
  const returnTo = safePath(store.get(GOOGLE_RETURN_COOKIE)?.value ?? null);
  const expectedState = store.get(GOOGLE_STATE_COOKIE)?.value;
  const verifier = store.get(GOOGLE_VERIFIER_COOKIE)?.value;

  const fail = (reason: string) => withCleanup(backToLogin(request, reason, returnTo));

  if (url.searchParams.get("error")) return fail("google_cancelado");
  if (!googleLoginConfigured()) return fail("google_no_configurado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // El state va en cookie propia: si no coincide, la vuelta no es nuestra.
  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    return fail("google_estado_invalido");
  }

  let email: string;
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${url.origin}/api/acceso/google/callback`,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    if (!tokenResponse.ok) return fail("google_token_rechazado");

    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) return fail("google_token_rechazado");

    const profileResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!profileResponse.ok) return fail("google_perfil_rechazado");

    const profile = (await profileResponse.json()) as {
      email?: string;
      email_verified?: boolean;
    };
    if (!profile.email || profile.email_verified === false) {
      return fail("google_sin_correo");
    }
    email = profile.email.trim().toLowerCase();
  } catch {
    return fail("google_falla_red");
  }

  // Quién puede entrar lo sigue decidiendo OAUTH_ADMIN_EMAILS: iniciar sesión
  // con Google prueba identidad, no permiso.
  return withCleanup(
    new Response(null, {
      status: 302,
      headers: {
        location: new URL(returnTo, request.url).toString(),
        "cache-control": "no-store",
      },
    }),
    `${DEV_SESSION_COOKIE_NAME}=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
  );
}

function withCleanup(response: Response, sessionCookie?: string): Response {
  const headers = new Headers(response.headers);
  if (sessionCookie) headers.append("set-cookie", sessionCookie);
  headers.append("set-cookie", clearCookie(GOOGLE_STATE_COOKIE));
  headers.append("set-cookie", clearCookie(GOOGLE_VERIFIER_COOKIE));
  headers.append("set-cookie", clearCookie(GOOGLE_RETURN_COOKIE));
  return new Response(response.body, { status: response.status, headers });
}
