import {
  DEV_SESSION_COOKIE_NAME,
  devLoginEnabled,
} from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_SECONDS = 60 * 60 * 12;

export async function POST(request: Request) {
  if (!devLoginEnabled()) return new Response("No disponible", { status: 404 });

  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const returnTo = safeReturnTo(String(form.get("return_to") ?? "/"));

  if (!email) return backToLogin(request, "vacio", returnTo);
  if (!EMAIL_PATTERN.test(email)) {
    return backToLogin(request, "invalido", returnTo);
  }

  // El cookie solo declara quién dice ser. Que ese correo tenga permiso lo
  // sigue decidiendo OAUTH_ADMIN_EMAILS, igual que en producción.
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(returnTo, request.url).toString(),
      "set-cookie": `${DEV_SESSION_COOKIE_NAME}=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
      "cache-control": "no-store",
    },
  });
}

function backToLogin(request: Request, error: string, returnTo: string) {
  const url = new URL("/acceso", request.url);
  url.searchParams.set("error", error);
  url.searchParams.set("return_to", returnTo);
  return new Response(null, {
    status: 303,
    headers: { location: url.toString(), "cache-control": "no-store" },
  });
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
