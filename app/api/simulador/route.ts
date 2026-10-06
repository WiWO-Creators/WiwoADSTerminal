import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { listPortfolios } from "@/lib/portafolios-store";
import { ErrorDeSimulador, historialDelCliente } from "@/lib/simulador-store";

/**
 * Historial de rendimiento de un cliente para el simulador (últimos 90 días,
 * por plataforma y objetivo). Solo lectura: la proyección se calcula en el
 * navegador con `lib/simulador.ts`, así cambia al instante al mover el formulario.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const cliente = new URL(request.url).searchParams.get("cliente") ?? "";
  if (!cliente) return fail("Falta el cliente", 400);
  try {
    const portafolio = (await listPortfolios()).find((p) => p.id === cliente);
    if (!portafolio) return fail("Ese cliente no existe", 404);
    const historial = await historialDelCliente(session.actor, cliente);
    return Response.json(
      {
        cliente: { id: portafolio.id, nombre: portafolio.name, kpiPrincipal: portafolio.kpiPrincipal },
        historial,
        presupuestoMensual:
          portafolio.monthlyBudgetMicros && portafolio.monthlyBudgetCurrency
            ? { micros: portafolio.monthlyBudgetMicros, moneda: portafolio.monthlyBudgetCurrency }
            : null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ErrorDeSimulador) return Response.json({ error: error.message }, { status: error.status });
    console.error("WiWO.ADS simulador", error);
    return fail("No se pudo leer el historial del cliente", 500);
  }
}
