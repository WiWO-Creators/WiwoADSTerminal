import { getSession } from "@/app/sesion";
import { can } from "@/lib/permisos";
import { leerResumenSemanal } from "@/lib/resumen-semanal-store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * El último resumen semanal calculado (ver `app/api/actualizar/route.ts`).
 *
 * Solo para quien ve toda la cartera: los totales y el ranking de clientes
 * son agregados de la agencia completa, no algo que tenga sentido recortar
 * por cliente para un rol con acceso limitado.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "ver_todos_los_clientes")) {
    return fail("Tu rol no ve el resumen de la cartera completa", 403);
  }

  const resumen = await leerResumenSemanal();
  return Response.json({ resumen }, { headers: NO_STORE });
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
