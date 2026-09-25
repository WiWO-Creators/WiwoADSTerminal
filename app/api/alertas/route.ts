import { getSession } from "@/app/sesion";
import { generarAlertas } from "@/lib/alertas";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { listPortfolios } from "@/lib/portafolios-store";
import { esRango } from "@/lib/rangos";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Alertas proactivas del periodo elegido, para el cliente activo o para toda
 * la cartera visible de quien pregunta.
 *
 * Solo lee: arma la lista a partir del mismo snapshot que ya usan el
 * dashboard y el asistente de IA (`getPerformanceSnapshot`, que filtra por
 * los clientes asignados al actor) y de `listPortfolios()`, que trae las
 * metas de CPA/ROAS. Ningún dato de un cliente fuera del alcance del actor
 * puede aparecer acá, porque nunca llega a `snap.campaigns` para empezar.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);

  const url = new URL(request.url);
  const clienteId = url.searchParams.get("cliente");
  const pedido = url.searchParams.get("rango") ?? "";
  const rango = esRango(pedido) ? pedido : undefined;

  try {
    const [snap, portfolios] = await Promise.all([
      getPerformanceSnapshot(session.actor, new Date(), {
        incluirCampanas: true,
        incluirAnuncios: false,
        rango,
      }),
      listPortfolios(),
    ]);

    const campanas = clienteId
      ? (() => {
          const cuentas = new Set(
            snap.portfolios.find((p) => p.id === clienteId)?.accounts.map((a) => a.id) ?? [],
          );
          return snap.campaigns.filter((c) => cuentas.has(c.accountKey));
        })()
      : snap.campaigns;

    const alertas = generarAlertas(portfolios, campanas);
    return Response.json({ alertas }, { headers: NO_STORE });
  } catch (error) {
    console.error("WiWO.ADS alertas", error);
    return fail("No se pudieron calcular las alertas", 500);
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
