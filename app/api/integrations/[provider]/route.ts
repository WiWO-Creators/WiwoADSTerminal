import { getSession } from "@/app/sesion";
import { mismoOrigen } from "@/lib/origen-publico";
import {
  disconnectIntegration,
  IntegrationError,
  isIntegrationProvider,
  listIntegrations,
  selectIntegrationAccounts,
  syncIntegration,
} from "@/lib/integration-store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  return mutate(request, context, "sync");
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  return mutate(request, context, "select");
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  return mutate(request, context, "disconnect");
}

async function mutate(
  request: Request,
  context: { params: Promise<{ provider: string }> },
  action: "sync" | "select" | "disconnect",
) {
  const session = await getSession();
  const user = session?.actor ?? null;
  if (!user) return responseError("Inicia sesión para continuar", 401);
  if (!mismoOrigen(request)) {
    return responseError("Origen no permitido", 403);
  }
  const { provider } = await context.params;
  if (!isIntegrationProvider(provider)) {
    return responseError("Plataforma no disponible", 404);
  }

  try {
    if (action === "sync") {
      return Response.json(
        { integrations: await syncIntegration(user, provider) },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (action === "disconnect") {
      return Response.json(
        { integrations: await disconnectIntegration(user, provider) },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new IntegrationError("Formato de solicitud no válido", 415);
    }
    const body = (await request.json()) as { selectedIds?: unknown };
    if (
      !Array.isArray(body.selectedIds) ||
      !body.selectedIds.every((value) => typeof value === "string")
    ) {
      throw new IntegrationError("Selección de cuentas no válida", 400);
    }
    return Response.json(
      {
        integrations: await selectIntegrationAccounts(
          user,
          provider,
          body.selectedIds,
        ),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof IntegrationError
        ? error.status
        : error instanceof SyntaxError
          ? 400
          : 500;
    const message =
      error instanceof IntegrationError
        ? error.message
        : error instanceof SyntaxError
          ? "La solicitud contiene JSON no válido"
        : "No pudimos completar la acción";
    const integrations =
      action !== "disconnect"
        ? await listIntegrations(user).catch(() => undefined)
        : undefined;
    return Response.json(
      { error: message, ...(integrations ? { integrations } : {}) },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}

function responseError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}
