import { getSession } from "@/app/sesion";
import { completarConexionLinkedin } from "@/lib/linkedin-conexion";

/** A donde vuelve LinkedIn tras autorizar. La URL completa debe estar registrada en la pestaña Auth de la app. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  const user = session?.actor ?? null;
  if (!user) return volver(request, { error: "signin_required" });

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return volver(request, { error: "authorization_cancelled" });

  try {
    await completarConexionLinkedin(user, url.searchParams.get("state") ?? "", url.searchParams.get("code") ?? "");
    return volver(request, { connected: "linkedin" });
  } catch (error) {
    // Solo el mensaje: nunca el código de autorización ni los tokens.
    console.error("WiWO.ADS conexión linkedin", error instanceof Error ? error.message : "error desconocido");
    return volver(request, { error: "callback_failed" });
  }
}

function volver(request: Request, parametros: Record<string, string>) {
  const url = new URL("/", request.url);
  url.searchParams.set("view", "integrations");
  for (const [clave, valor] of Object.entries(parametros)) url.searchParams.set(clave, valor);
  url.searchParams.set("provider", "linkedin");
  return new Response(null, { status: 302, headers: { location: url.toString(), "cache-control": "no-store", pragma: "no-cache" } });
}
