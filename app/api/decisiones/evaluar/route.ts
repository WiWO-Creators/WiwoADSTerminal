import { getSession } from "@/app/sesion";
import { evaluarYGuardarDecisiones } from "@/lib/dashboard-store";
import { can } from "@/lib/permisos";

/**
 * Corre el motor de reglas manualmente.
 *
 * No cambia nada en Google ni en Meta — solo lee métricas ya obtenidas de
 * Windsor y, si algo cruza el umbral de la meta de un cliente, deja una
 * recomendación en la cola de Decisiones para que alguien la firme.
 *
 * Misma capacidad que aprobar cambios: quien puede decidir sobre la cola
 * también puede pedir que se vuelva a evaluar.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "aprobar_cambios")) {
    return fail("Tu rol no puede correr el motor de reglas", 403);
  }

  try {
    const resultado = await evaluarYGuardarDecisiones();
    return Response.json(resultado, { headers: NO_STORE });
  } catch (error) {
    console.error("WiWO.ADS evaluar reglas", error);
    return fail("No se pudo evaluar el motor de reglas", 500);
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
