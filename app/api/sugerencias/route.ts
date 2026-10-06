import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { DashboardStoreError } from "@/lib/dashboard-store";
import { mismoOrigen } from "@/lib/origen-publico";
import { listPortfolios } from "@/lib/portafolios-store";
import {
  ErrorDeSugerencias,
  evaluarSugerencias,
  listarPendientesDeAlcance,
  listarSugerencias,
  resolverSugerencia,
} from "@/lib/sugerencias-store";

/**
 * Sugerencias automáticas de un cliente.
 *
 * - GET  ?cliente=ID   → las pendientes y las últimas resueltas.
 * - POST {kind:"evaluar", cliente}  → lee el rendimiento y guarda las nuevas
 *   (se salta si el cliente se evaluó hace poco).
 * - POST {kind:"resolver", ...}     → aprobar, descartar o posponer. Solo con
 *   `aprobar_cambios` (administrador o supervisor); ver `resolverSugerencia`.
 *
 * Nada de esto escribe en Google ni en Meta.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function errorDe(error: unknown) {
  if (error instanceof ErrorDeSugerencias || error instanceof DashboardStoreError) {
    return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE });
  }
  console.error("WiWO.ADS sugerencias", error);
  return fail("No se pudo procesar la solicitud de sugerencias", 500);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const cliente = new URL(request.url).searchParams.get("cliente") ?? "";
  try {
    // Sin cliente: las pendientes de todos los que la persona puede ver.
    if (!cliente) return Response.json(await listarPendientesDeAlcance(session.actor), { headers: NO_STORE });
    const portafolio = (await listPortfolios()).find((p) => p.id === cliente);
    if (!portafolio) return fail("Ese cliente no existe", 404);
    return Response.json(await listarSugerencias(session.actor, cliente, portafolio.name), { headers: NO_STORE });
  } catch (error) {
    return errorDe(error);
  }
}

type Cuerpo =
  | { kind: "evaluar"; cliente?: string; forzar?: boolean }
  | {
      kind: "resolver";
      tipo: "approve" | "discard" | "postpone";
      id: string;
      expectedVersion: number;
      idempotencyKey: string;
      reason?: string;
    };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415, CODIGOS_ERROR.CONTENT_TYPE_INVALIDO);
  }
  const body = (await request.json().catch(() => null)) as Cuerpo | null;
  if (!body) return fail("Solicitud no válida", 400);

  try {
    if (body.kind === "evaluar") {
      const resultado = await evaluarSugerencias(session.actor, {
        portfolioId: body.cliente,
        soloSiVencio: !body.forzar,
      });
      return Response.json(resultado, { headers: NO_STORE });
    }
    if (body.kind === "resolver") {
      if (!body.id || !Number.isInteger(body.expectedVersion) || !body.idempotencyKey?.trim()) {
        return fail("Solicitud incompleta", 400);
      }
      await resolverSugerencia(session.actor, {
        type: body.tipo,
        id: body.id,
        expectedVersion: body.expectedVersion,
        idempotencyKey: body.idempotencyKey,
        reason: body.reason,
      });
      return Response.json({ ok: true }, { headers: NO_STORE });
    }
    return fail("Acción no reconocida", 400);
  } catch (error) {
    return errorDe(error);
  }
}
