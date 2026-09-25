import { getSession } from "@/app/sesion";
import { mismoOrigen } from "@/lib/origen-publico";
import { detalleClientes } from "@/lib/clientes-detalle";
import {
  buildPlan,
  normalizeDraft,
  type CampaignDraft,
  type CuentaCliente,
} from "@/lib/constructor";
import { nombresDeCampanasRecientes } from "@/lib/constructor-ejecutar";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { can, enAlcance } from "@/lib/permisos";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Chequea que la landing de verdad responda — un caso real (campaña de
 * Colbún de prueba) llegó al Constructor con la landing en 404 y nadie lo
 * notó hasta publicar. No bloquea: una landing caída ahora mismo puede
 * volver antes de publicar, y quien revisa el plan decide si espera o
 * corrige la URL. `null` cuando no hay nada que avisar.
 */
async function avisoDeLandingCaida(url: string): Promise<string | null> {
  const controller = new AbortController();
  const corte = setTimeout(() => controller.abort(), 6000);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    // Algunos sitios no responden HEAD (405/501): un GET real confirma.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    if (response.status === 404) {
      return `La landing (${url}) responde 404 — revisa que la URL sea la correcta`;
    }
    if (response.status >= 400) {
      return `La landing (${url}) responde error ${response.status} — revisa que esté publicada`;
    }
    return null;
  } catch {
    return `No se pudo comprobar que la landing (${url}) responda — revisa que esté publicada y accesible`;
  } finally {
    clearTimeout(corte);
  }
}

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

  if (!mismoOrigen(request)) {
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

    // Campañas de prueba creadas por este mismo sistema en las últimas
    // horas no cuentan como "historia" del cliente al sugerir presupuesto —
    // ver `recommendBudget`.
    const excluirCampanasDePresupuesto = draft.portfolioId
      ? await nombresDeCampanasRecientes(draft.portfolioId)
      : new Set<string>();

    const plan = buildPlan(draft, portfolio, cuentas, snapshot, excluirCampanasDePresupuesto);
    const landing = draft.landingUrl.trim();
    if (landing) {
      const aviso = await avisoDeLandingCaida(landing);
      if (aviso) plan.issues.push({ field: "landingUrl", message: aviso, blocking: false });
    }

    return Response.json(plan, {
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
