import { getSession } from "@/app/sesion";
import { detalleClientes } from "@/lib/clientes-detalle";
import {
  buildPlan,
  normalizeDraft,
  type CampaignDraft,
  type CuentaCliente,
} from "@/lib/constructor";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { can, type Actor } from "@/lib/permisos";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Simula la creación de una campaña.
 *
 * Esta ruta NO escribe en Google ni en Meta. Devuelve el plan: los pasos
 * exactos que se ejecutarían, con sus parámetros. La ejecución será otra ruta,
 * con aprobación explícita y registro en la bitácora.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "crear_campanas")) {
    return fail("Tu rol no puede construir campañas", 403);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fail("Origen no permitido", 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415);
  }

  try {
    const body = (await request.json()) as Partial<CampaignDraft>;
    const draft = normalizeDraft(body);

    const [snapshot, { clientes }] = await Promise.all([
      getPerformanceSnapshot(session.actor),
      detalleClientes(session.actor, new Date()),
    ]);
    const cliente = clientes.find((item) => item.id === draft.portfolioId);
    const cuentas: CuentaCliente[] = cliente?.accounts ?? [];

    // El alcance sale de los permisos, no del gasto.
    //
    // Antes se exigía que el cliente apareciera en el snapshot de
    // rendimiento, y ahí solo están los que facturaron en el periodo. Eso
    // bloqueaba justo el caso normal de esta pantalla: armarle una campaña a
    // un cliente que hoy no tiene nada al aire.
    if (draft.portfolioId && !enAlcance(session.actor, draft.portfolioId)) {
      return fail("Ese cliente no está en tu alcance", 403);
    }

    // Solo para sugerir presupuesto a partir de su historia; que no esté no
    // impide planificar.
    const portfolio =
      snapshot.portfolios.find((item) => item.id === draft.portfolioId) ?? null;

    return Response.json(buildPlan(draft, portfolio, cuentas, snapshot), {
      headers: NO_STORE,
    });
  } catch (error) {
    console.error("WiWO.ADS constructor", error);
    return fail("No pudimos armar el plan", 500);
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

/**
 * Si esta persona puede trabajar sobre ese cliente.
 *
 * Es una pregunta de permisos —quién tiene asignado a quién— y no de si el
 * cliente gastó dinero este mes.
 */
function enAlcance(actor: Actor, portfolioId: string): boolean {
  if (can(actor, "ver_todos_los_clientes")) return true;
  return actor.portfolioIds.includes(portfolioId);
}
