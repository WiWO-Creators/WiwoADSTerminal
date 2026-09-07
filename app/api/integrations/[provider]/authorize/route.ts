import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  createAuthorizationUrl,
  IntegrationError,
  isIntegrationProvider,
} from "@/lib/integration-store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return backToIntegrations(request, "signin_required");

  const { provider } = await context.params;
  if (!isIntegrationProvider(provider)) {
    return backToIntegrations(request, "provider_not_supported");
  }

  try {
    const authorizationUrl = await createAuthorizationUrl(
      user,
      provider,
      request,
    );
    return new Response(null, {
      status: 302,
      headers: {
        location: authorizationUrl,
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    });
  } catch (error) {
    return backToIntegrations(
      request,
      error instanceof IntegrationError && error.status === 403
        ? "not_allowed"
        : error instanceof IntegrationError && error.status === 503
          ? "not_configured"
          : "start_failed",
      provider,
    );
  }
}

function backToIntegrations(
  request: Request,
  error: string,
  provider?: string,
) {
  const url = new URL("/", request.url);
  url.searchParams.set("view", "integrations");
  url.searchParams.set("error", error);
  if (provider) url.searchParams.set("provider", provider);
  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), "cache-control": "no-store" },
  });
}
