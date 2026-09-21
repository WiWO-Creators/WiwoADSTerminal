import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

import { cookieDeSesion, DEV_NAME_COOKIE_NAME } from "@/app/chatgpt-auth";
import { respuestaCierrePopup } from "@/lib/acceso-popup";
import {
  backToLogin,
  clearCookie,
  GOOGLE_POPUP_COOKIE,
  GOOGLE_RETURN_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  googleLoginConfigured,
  safePath,
} from "../route";

export const dynamic = "force-dynamic";

const SESSION_SECONDS = 60 * 60 * 12;

/**
 * Dominio de correo de la empresa. Probar identidad con Google no es lo
 * mismo que tener permiso: esto es solo el primer filtro (¿esta persona
 * podría ser del equipo?), antes de que `resolveActor` decida si de verdad
 * tiene un rol vigente.
 */
const DOMINIO_PERMITIDO = "@mgcglobalgroup.com";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = await cookies();
  const returnTo = safePath(store.get(GOOGLE_RETURN_COOKIE)?.value ?? null);
  const expectedState = store.get(GOOGLE_STATE_COOKIE)?.value;
  const verifier = store.get(GOOGLE_VERIFIER_COOKIE)?.value;
  // La cookie la puso /api/acceso/google al arrancar: dice cómo entregar el
  // resultado, no si el acceso es válido.
  const enPopup = store.get(GOOGLE_POPUP_COOKIE)?.value === "1";

  const fail = (reason: string) =>
    withCleanup(
      enPopup
        ? respuestaCierrePopup({ ok: false, error: reason })
        : backToLogin(request, reason, returnTo),
    );

  if (url.searchParams.get("error")) return fail("google_cancelado");
  if (!googleLoginConfigured()) return fail("google_no_configurado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // El state va en cookie propia: si no coincide, la vuelta no es nuestra.
  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    return fail("google_estado_invalido");
  }

  let email: string;
  let nombre: string | null = null;
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

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      id_token?: string;
    };
    if (!tokens.access_token) return fail("google_token_rechazado");

    // El id_token suele traer el nombre aunque `userinfo` no lo devuelva
    // (pasa cuando la cuenta es de Workspace y el consentimiento se otorgó
    // antes de que la app pidiera el scope `profile`).
    nombre = nombreDeIdToken(tokens.id_token);

    const profileResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!profileResponse.ok) return fail("google_perfil_rechazado");

    const profile = (await profileResponse.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
    };
    if (!profile.email || profile.email_verified === false) {
      return fail("google_sin_correo");
    }
    // Se guarda el nombre completo, no el de pila: la ficha del usuario en
    // la barra lateral lo muestra entero, y el saludo de Inicio se queda
    // con la primera palabra. Al revés no se puede — del nombre de pila no
    // se recupera el apellido.
    // Si `userinfo` no lo trae, queda el que haya dado el id_token.
    nombre = (profile.name ?? profile.given_name ?? "").trim() || nombre;
    email = profile.email.trim().toLowerCase();
    if (!email.endsWith(DOMINIO_PERMITIDO)) {
      return fail("google_dominio_no_permitido");
    }
  } catch {
    return fail("google_falla_red");
  }

  // `Secure` solo si el sitio se sirve por HTTPS (detrás de un proxy, la URL
  // interna puede ser http aunque el visitante entre por https).
  const seguro = (env.APP_ORIGIN ?? request.url).startsWith("https://");
  const cookieDeIdentidad = await cookieDeSesion(email, seguro);
  // Sin secreto de sesión no se abre ninguna: mejor negar que dejar una
  // cookie que cualquiera pueda falsificar.
  if (!cookieDeIdentidad) return fail("google_no_configurado");

  // Quién puede entrar lo sigue decidiendo OAUTH_ADMIN_EMAILS/el equipo: el
  // dominio de arriba y Google prueban identidad, no permiso.
  return withCleanup(
    enPopup
      ? respuestaCierrePopup({ ok: true, destino: returnTo })
      : new Response(null, {
          status: 302,
          headers: {
            location: new URL(returnTo, request.url).toString(),
            "cache-control": "no-store",
          },
        }),
    cookieDeIdentidad,
    nombre
      ? `${DEV_NAME_COOKIE_NAME}=${encodeURIComponent(nombre)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${seguro ? "; Secure" : ""}`
      : undefined,
  );
}

/**
 * Lee el nombre del payload del id_token.
 *
 * No verifica la firma a propósito: el token no viene del navegador, lo
 * acabamos de pedir nosotros al endpoint de Google sobre TLS. Verificarlo
 * solo protegería contra un Google suplantado, que es justo lo que TLS ya
 * garantiza. El valor además es puramente cosmético — quién entra lo decide
 * el correo, no esto.
 */
function nombreDeIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const binario = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    // atob entrega bytes, no texto: sin este paso un nombre con tilde
    // llegaría como "JosÃ©".
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const datos = JSON.parse(new TextDecoder().decode(bytes)) as {
      given_name?: string;
      name?: string;
    };
    return (datos.name ?? datos.given_name ?? "").trim() || null;
  } catch {
    return null;
  }
}

function withCleanup(
  response: Response,
  sessionCookie?: string,
  nameCookie?: string,
): Response {
  const headers = new Headers(response.headers);
  if (sessionCookie) headers.append("set-cookie", sessionCookie);
  if (nameCookie) headers.append("set-cookie", nameCookie);
  headers.append("set-cookie", clearCookie(GOOGLE_STATE_COOKIE));
  headers.append("set-cookie", clearCookie(GOOGLE_VERIFIER_COOKIE));
  headers.append("set-cookie", clearCookie(GOOGLE_RETURN_COOKIE));
  headers.append("set-cookie", clearCookie(GOOGLE_POPUP_COOKIE));
  return new Response(response.body, { status: response.status, headers });
}
