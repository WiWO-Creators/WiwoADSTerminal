/**
 * TikTok directo (Marketing API v1.3): las llamadas de red. La parte pura (rutas, traducciones, validaciones) está en
 * `tiktok-nativo-pura.ts` y `tiktok-estado-pura.ts`. Hoy: canjear el código de autorización y leer los anunciantes autorizados.
 * Lo demás (campañas, grupos, anuncios, informes) se suma con la conexión ya hecha.
 */
import { env } from "cloudflare:workers";

import { anunciantesDeRespuesta, idsDeAnunciantes, type AnuncianteDeTiktok } from "@/lib/tiktok-estado-pura";
import { cabecerasDeApi, cuerpoCanjeDeCodigo, datosDeRespuesta, ErrorDeTiktok, urlDeApi } from "@/lib/tiktok-nativo-pura";

const TIEMPO_MAXIMO_MS = 25_000;

export function credencialesDeTiktok(): { appId: string; secret: string } | null {
  const appId = env.TIKTOK_APP_ID?.trim();
  const secret = env.TIKTOK_APP_SECRET?.trim();
  return appId && secret ? { appId, secret } : null;
}

async function llamar(url: string, init: RequestInit): Promise<unknown> {
  const respuesta = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok && cuerpo === null) throw new ErrorDeTiktok(`TikTok respondió HTTP ${respuesta.status}`);
  return cuerpo;
}

/** Canjea el `auth_code` (1 hora, un solo uso) por el token del anunciante. Ese token no vence ni se renueva. */
export async function canjearCodigoDeTiktok(authCode: string): Promise<{ accessToken: string; idsDeAnunciantes: string[]; alcances: string }> {
  const cred = credencialesDeTiktok();
  if (!cred) throw new ErrorDeTiktok("TikTok no está habilitado: faltan TIKTOK_APP_ID y TIKTOK_APP_SECRET en el servidor.");
  const datos = datosDeRespuesta<{ access_token?: string; advertiser_ids?: unknown; scope?: unknown }>(
    await llamar(urlDeApi("oauth2/access_token"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoCanjeDeCodigo({ appId: cred.appId, secret: cred.secret, authCode })),
    }),
  );
  if (!datos.access_token) throw new ErrorDeTiktok("TikTok no devolvió el token de acceso.");
  const alcances = Array.isArray(datos.scope) ? datos.scope.map(String).join(" ") : typeof datos.scope === "string" ? datos.scope : "";
  return { accessToken: datos.access_token, idsDeAnunciantes: idsDeAnunciantes(datos), alcances };
}

/** Los anunciantes que la persona autorizó para la app (id de cada uno). */
export async function idsAutorizadosDeTiktok(token: string): Promise<string[]> {
  const cred = credencialesDeTiktok();
  if (!cred) return [];
  const datos = datosDeRespuesta(await llamar(urlDeApi("oauth2/advertiser/get", { query: { app_id: cred.appId, secret: cred.secret } }), { headers: cabecerasDeApi(token) }));
  return idsDeAnunciantes(datos);
}

/** Nombre, moneda y estado de cada anunciante. */
export async function anunciantesDeTiktok(token: string, ids: string[]): Promise<AnuncianteDeTiktok[]> {
  if (ids.length === 0) return [];
  const datos = datosDeRespuesta(
    await llamar(urlDeApi("advertiser/info", { query: { advertiser_ids: JSON.stringify(ids.slice(0, 100)), fields: JSON.stringify(["advertiser_id", "name", "currency", "status"]) } }), {
      headers: cabecerasDeApi(token),
    }),
  );
  return anunciantesDeRespuesta(datos);
}
