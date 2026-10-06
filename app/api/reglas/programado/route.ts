import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { evaluarReglas } from "@/lib/reglas-automaticas";
import type { Actor } from "@/lib/permisos";

/**
 * Evaluación de reglas sin una persona delante: la llama una tarea programada del servidor (`servidor/evaluar-reglas.mjs`)
 * con la clave `CRON_SECRET`. Sin esa clave configurada o con una incorrecta, no hace nada. Solo ejecuta lo que una regla
 * ya creada por un supervisor pide (pausar o avisar); no recibe parámetros.
 */
export const dynamic = "force-dynamic";

const ACTOR_DE_REGLAS: Actor = { id: "reglas-automaticas", email: "reglas-automaticas@wiwo.ads", role: "admin", portfolioIds: [], isActive: true };

export async function POST(request: Request) {
  const esperada = env.CRON_SECRET ?? "";
  const recibida = request.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(esperada);
  const b = Buffer.from(recibida);
  if (esperada.length < 16 || a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    const r = await evaluarReglas(ACTOR_DE_REGLAS);
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("WiWO.ADS reglas programadas", error);
    return new Response("Error al evaluar", { status: 500 });
  }
}
