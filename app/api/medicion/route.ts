import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { can } from "@/lib/permisos";
import { ErrorDeMedicion, medicionDelCliente } from "@/lib/medicion-store";

/**
 * Salud de medición de un cliente: eventos de GA4 de los últimos 30 días,
 * evaluados contra las reglas de `lib/medicion.ts`. Solo lectura.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  if (!can(session.actor, "aprobar_presupuesto")) return fail("La salud de medición es de los Directores.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  const cliente = new URL(request.url).searchParams.get("cliente") ?? "";
  if (!cliente) return fail("Falta el cliente", 400);
  try {
    return Response.json(await medicionDelCliente(session.actor, cliente), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ErrorDeMedicion) return Response.json({ error: error.message }, { status: error.status });
    console.error("WiWO.ADS medición", error);
    return fail("No se pudo evaluar la medición", 500);
  }
}
