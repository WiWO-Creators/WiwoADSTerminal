import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { generarAlertas } from "@/lib/alertas";
import { alertasDeLimiteDeGasto } from "@/lib/alertas-gasto";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { can, enAlcance } from "@/lib/permisos";
import { enlacesDeAlerta } from "@/lib/enlaces";
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
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);

  // Las alertas son del trabajo de quien aprueba cambios (administrador y supervisor).
  if (!can(session.actor, "aprobar_cambios")) {
    return fail("Las alertas las ven administradores y supervisores", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);
  }

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

    // Solo clientes que la persona puede ver (y el pedido, si viene): las
    // alertas de medición no dependen de campañas, así que no las filtra el snapshot.
    const visibles = portfolios.filter((p) => !p.archivado && enAlcance(session.actor, p.id) && (!clienteId || p.id === clienteId));
    const porId = new Map(visibles.map((p) => [p.id, p]));
    // Límite de gasto: el mes en curso contra el presupuesto mensual de cada cliente (solo si alguno lo tiene cargado).
    let deGasto: ReturnType<typeof alertasDeLimiteDeGasto> = [];
    if (visibles.some((p) => p.monthlyBudgetMicros)) {
      const mes = await getPerformanceSnapshot(session.actor, new Date(), { incluirCampanas: true, incluirAnuncios: false, rango: "mes_actual" });
      const gastado = new Map<string, Record<string, number>>();
      for (const p of mes.portfolios) {
        const cuentas = new Set(p.accounts.map((a) => a.id));
        const porMoneda: Record<string, number> = {};
        for (const c of mes.campaigns) if (cuentas.has(c.accountKey)) porMoneda[c.currency ?? "—"] = (porMoneda[c.currency ?? "—"] ?? 0) + c.spendMicros;
        gastado.set(p.id, porMoneda);
      }
      deGasto = alertasDeLimiteDeGasto(visibles, gastado, new Date());
    }
    const alertas = [...deGasto, ...generarAlertas(visibles, campanas)].map((a) => ({
      ...a,
      enlaces: enlacesDeAlerta(a.id, porId.get(a.clienteId)),
    }));
    return Response.json({ alertas }, { headers: NO_STORE });
  } catch (error) {
    console.error("WiWO.ADS alertas", error);
    return fail("No se pudieron calcular las alertas", 500);
  }
}

