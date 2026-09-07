import {
  getChatGPTUser,
  isAuthorizedChatGPTUser,
} from "@/app/chatgpt-auth";
import {
  applyDecisionAction,
  approveDecisionBatch,
  DashboardStoreError,
  getDashboardSnapshot,
  type DecisionAction,
} from "@/lib/dashboard-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Inicia sesión para continuar" }, { status: 401 });
  }
  if (!isAuthorizedChatGPTUser(user)) {
    return Response.json({ error: "Tu cuenta no tiene acceso a WiWO.ADS" }, { status: 403 });
  }

  try {
    return Response.json(await getDashboardSnapshot(user));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Inicia sesión para continuar" }, { status: 401 });
  }
  if (!isAuthorizedChatGPTUser(user)) {
    return Response.json({ error: "Tu cuenta no tiene acceso a WiWO.ADS" }, { status: 403 });
  }
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
