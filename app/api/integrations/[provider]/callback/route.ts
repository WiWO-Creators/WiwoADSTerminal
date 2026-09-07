import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  completeAuthorization,
  isIntegrationProvider,
} from "@/lib/integration-store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!isIntegrationProvider(provider)) {
    return backToIntegrations(request, "provider_not_supported");
  }
  const user = await getChatGPTUser();
  if (!user) return backToIntegrations(request, "signin_required", provider);

  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const providerError = url.searchParams.get("error");
  if (providerError) {
    return backToIntegrations(request, "authorization_cancelled", provider);
  }

  try {
    await completeAuthorization(user, provider, state, code);
    const destination = new URL("/", request.url);
    destination.searchParams.set("view", "integrations");
    destination.searchParams.set("connected", provider);
    return new Response(null, {
      status: 302,
      headers: {
        location: destination.toString(),
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    });
  } catch {
    return backToIntegrations(request, "callback_failed", provider);
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
    headers: {
      location: url.toString(),
      "cache-control": "no-store",
      pragma: "no-cache",
    },
  });
}
