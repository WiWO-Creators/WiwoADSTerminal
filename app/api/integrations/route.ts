import {
  getChatGPTUser,
  isAuthorizedChatGPTUser,
} from "@/app/chatgpt-auth";
import {
  IntegrationError,
  listIntegrations,
  userCanManageIntegrations,
} from "@/lib/integration-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      { error: "Inicia sesión para continuar" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (!isAuthorizedChatGPTUser(user)) {
    return Response.json(
      { error: "Tu cuenta no tiene acceso a WiWO.ADS" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    return Response.json(
      {
        integrations: await listIntegrations(user),
        canManage: userCanManageIntegrations(user),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: safeMessage(error) },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

function safeMessage(error: unknown) {
  return error instanceof IntegrationError
    ? error.message
    : "No pudimos cargar las conexiones";
}
