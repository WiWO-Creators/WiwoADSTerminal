import { env } from "cloudflare:workers";

import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { origenPublico } from "@/lib/origen-publico";
import { estadoDeTiktok, RUTA_DE_RETORNO_TIKTOK } from "@/lib/tiktok-estado-pura";

/** En qué punto está TikTok (configuración del servidor y URL de retorno). Sin tokens ni valores: solo nombres de lo que falta. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const estado = estadoDeTiktok(env as unknown as { TIKTOK_APP_ID?: string; TIKTOK_APP_SECRET?: string });
  return Response.json(
    { estado, urlDeRetorno: `${origenPublico(new URL(request.url))}${RUTA_DE_RETORNO_TIKTOK}` },
    { headers: { "cache-control": "no-store" } },
  );
}
