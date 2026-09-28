import { env } from "cloudflare:workers";

/**
 * Origen público real del sitio, no el de la conexión interna. Detrás de un
 * proxy que no reenvíe `X-Forwarded-Proto` correctamente, `url.origin` puede
 * llegar como `http://` aunque el visitante entre por HTTPS. De esto dependen
 * dos cosas que Google y los navegadores comparan byte a byte:
 * - el `redirect_uri` del login (si no calza con el registrado, Google
 *   rechaza con `redirect_uri_mismatch`);
 * - el chequeo de mismo-origen contra el header `Origin` de las mutaciones
 *   (si no calza, se rechaza con "Origen no permitido" aunque la petición
 *   venga del propio sitio).
 */
export function origenPublico(url: URL): string {
  return (env.APP_ORIGIN ?? url.origin).replace(/\/$/, "");
}

/**
 * true si el header `Origin` de la petición coincide con el origen público
 * esperado. Sin header `Origin` se deja pasar: no todas las peticiones
 * same-origin lo mandan, y el chequeo existe para bloquear otros sitios, no
 * para exigir el header.
 */
export function mismoOrigen(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === origenPublico(new URL(request.url));
}
