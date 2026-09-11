import { getSession } from "@/app/sesion";
import {
  applyDecisionAction,
  approveDecisionBatch,
  DashboardStoreError,
  getDashboardSnapshot,
  type DecisionAction,
} from "@/lib/dashboard-store";
import { esRango } from "@/lib/rangos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Tu cuenta no tiene acceso a WiWO.ADS" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  const user = session.actor;

  try {
    // Un periodo desconocido no es un error: se cae al mes en curso, que es lo
    // que se venía mostrando siempre.
    const pedido = new URL(request.url).searchParams.get("rango") ?? "";
    const rango = esRango(pedido) ? pedido : undefined;
    return Response.json(await getDashboardSnapshot(user, rango));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Tu cuenta no tiene acceso a WiWO.ADS" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  const user = session.actor;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json(
      { error: "Formato de solicitud no válido" },
      { status: 415 },
    );
  }

  try {
    const payload = (await request.json()) as
      | ({ kind: "decision" } & DecisionAction)
      | {
          kind: "batch-approve";
          items: Array<{ id: string; expectedVersion: number }>;
          idempotencyKey: string;
        };

    if (payload.kind === "batch-approve") {
      if (!Array.isArray(payload.items) || !payload.idempotencyKey?.trim()) {
        throw new DashboardStoreError("Solicitud de lote incompleta", 400);
      }
      return Response.json(
        await approveDecisionBatch(
          user,
          payload.items,
          payload.idempotencyKey,
        ),
      );
    }

    if (payload.kind !== "decision") {
      throw new DashboardStoreError("Acción no reconocida", 400);
    }

    return Response.json(await applyDecisionAction(user, payload));
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const status =
    error instanceof DashboardStoreError
      ? error.status
      : error instanceof SyntaxError
        ? 400
        : 500;
  const message =
    error instanceof DashboardStoreError
      ? error.message
      : error instanceof SyntaxError
        ? "La solicitud contiene JSON no válido"
        : "No pudimos completar la acción";
  console.error("WiWO.ADS dashboard error", error);
  return Response.json({ error: message }, { status });
}
