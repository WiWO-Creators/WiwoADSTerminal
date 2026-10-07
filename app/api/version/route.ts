import { BUILD_ID } from "@/lib/version";

export const dynamic = "force-dynamic";

/** La versión que corre ahora. Sin datos sensibles; la pantalla la compara con la que cargó para avisar de una actualización. */
export async function GET() {
  return Response.json({ build: BUILD_ID }, { headers: { "cache-control": "no-store" } });
}
