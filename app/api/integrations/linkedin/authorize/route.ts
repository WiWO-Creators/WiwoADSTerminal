import { getSession } from "@/app/sesion";
import { crearUrlDeConexionLinkedin } from "@/lib/linkedin-conexion";
import { ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";

/**
 * Empieza la conexión con LinkedIn. Es una ruta propia (y no el `[provider]` genérico) porque LinkedIn todavía no es un
 * proveedor de `CONECTABLES`: ver `lib/linkedin-conexion.ts`. Next da prioridad a esta carpeta sobre `[provider]`.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  const user = session?.actor ?? null;
  if (!user) return volver(request, "signin_required");
  try {
    const destino = await crearUrlDeConexionLinkedin(user, request);
    return new Response(null, {
      status: 302,
      headers: { location: destino, "cache-control": "no-store", pragma: "no-cache" },
    });
  } catch (error) {
    // Solo el mensaje (nunca un token ni un secreto).
    console.error("WiWO.ADS conexión linkedin (inicio)", error instanceof Error ? error.message : "error desconocido");
    const estado = error instanceof ErrorDeLinkedin ? error.status : 500;
    return volver(request, estado === 403 ? "not_allowed" : estado === 503 ? "not_configured" : "start_failed");
  }
}

function volver(request: Request, error: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("view", "integrations");
  url.searchParams.set("error", error);
  url.searchParams.set("provider", "linkedin");
  return new Response(null, { status: 302, headers: { location: url.toString(), "cache-control": "no-store", pragma: "no-cache" } });
}
