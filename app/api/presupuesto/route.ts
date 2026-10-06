import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { getSession } from "@/app/sesion";
import { enAlcance } from "@/lib/permisos";
import { listPortfolios } from "@/lib/portafolios-store";
import { calcularPresupuesto } from "@/lib/presupuesto";
import { presupuestoDelCliente } from "@/lib/presupuesto-store";

/**
 * Presupuesto de un cliente, de tres maneras que se complementan. Solo lectura.
 *
 *  - `presupuesto`: el presupuesto MENSUAL de su ficha contra lo gastado en el mes en curso (completo, sin
 *    importar el periodo de la tabla: el presupuesto mensual no tiene sentido contra otro rango).
 *  - `campanas`: cuánto se invirtió y cuánto sobra de cada campaña y conjunto, y la suma. No depende de la
 *    ficha: sirve también para un cliente recién cargado que ya está corriendo.
 *  - `segmentos`: lo mismo por proyecto o mercado (Valor: Ébano, Corotú…), con su presupuesto mensual si lo
 *    tienen.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const cliente = new URL(request.url).searchParams.get("cliente") ?? "";
  if (!cliente) return fail("Falta el cliente", 400);
  if (!enAlcance(session.actor, cliente)) return fail("Ese cliente no está en tu alcance", 403);

  try {
    const portafolio = (await listPortfolios()).find((p) => p.id === cliente);
    if (!portafolio) return fail("Ese cliente no existe", 404);
    const ahora = new Date();

    const detalle = await presupuestoDelCliente(session.actor, cliente, portafolio.segmentos, ahora);

    const moneda = portafolio.monthlyBudgetCurrency;
    const gastado = moneda ? (detalle.gastadoMesPorMoneda[moneda] ?? 0) : 0;
    const otras = moneda ? Object.keys(detalle.gastadoMesPorMoneda).filter((m) => m !== moneda) : [];

    return Response.json(
      {
        presupuesto: portafolio.monthlyBudgetMicros && moneda ? calcularPresupuesto(portafolio.monthlyBudgetMicros, gastado, ahora) : null,
        moneda: moneda ?? undefined,
        // El gasto de otras monedas no se mezcla: se avisa para que no parezca que falta.
        otrasMonedas: otras,
        gastadoMesPorMoneda: detalle.gastadoMesPorMoneda,
        gastadoAnioPorMoneda: detalle.gastadoAnioPorMoneda,
        historico: detalle.historico,
        anio: ahora.getUTCFullYear(),
        campanas: { totales: detalle.totales, entidades: detalle.entidades, cuentasSinLeer: detalle.cuentasSinLeer },
        segmentos: detalle.segmentos.map((s) => {
          const propio = portafolio.segmentos.find((x) => x.id === s.id)?.presupuesto ?? null;
          return {
            id: s.id,
            nombre: s.nombre,
            moneda: propio?.moneda ?? null,
            presupuestoMensual: propio ? calcularPresupuesto(propio.micros, s.gastadoMesMicros, ahora) : null,
            totales: s.totales,
          };
        }),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("WiWO.ADS presupuesto", error);
    return fail("No se pudo calcular el presupuesto", 500);
  }
}
