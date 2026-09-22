import type { Alerta, Severidad } from "@/lib/alertas";
import type { CurrencyTotal, PerformanceSnapshot } from "@/lib/performance-store";

/**
 * Resumen semanal — lo que conviene saber al entrar un lunes, sin tener que
 * abrir cada cliente uno por uno.
 *
 * Se calcula en código, no con IA: son sumas y rankings, y un modelo de
 * lenguaje sumando cifras se equivoca en silencio (mismo principio que
 * `lib/asistente-csv.ts`). Se construye una vez, justo después de que se
 * reconstruye el catálogo de campañas (manual o semanal, ver
 * `app/api/actualizar/route.ts`), y se guarda para no tener que rehacerlo
 * cada vez que alguien lo mira.
 *
 * Cada cliente aquí es uno declarado (`portfolios[].declared`): una cuenta
 * suelta sin cliente asignado no cuenta como cliente para este resumen.
 */

export type ResumenSemanal = {
  generadoEn: number;
  periodo: { desde: string; hasta: string; enCurso: boolean };
  totalesPorMoneda: CurrencyTotal[];
  clientesConMasGasto: Array<{
    clienteId: string;
    nombre: string;
    moneda: string;
    gastoMicros: number;
  }>;
  alertas: Record<Severidad, number>;
  masUrgentes: Alerta[];
  cuentasQueNecesitanAtencion: number;
};

const MAX_CLIENTES = 5;
const MAX_ALERTAS_DESTACADAS = 3;

export function construirResumenSemanal(
  snap: PerformanceSnapshot,
  alertas: Alerta[],
  ahora = Date.now(),
): ResumenSemanal {
  const clientesConMasGasto = snap.portfolios
    .filter((p) => p.declared && p.currencyTotals.length > 0)
    .map((p) => {
      // La mayoría de los clientes factura en una sola moneda; con más de
      // una, se muestra la de mayor gasto — no tiene sentido sumarlas.
      const mayor = [...p.currencyTotals].sort((a, b) => b.spendMicros - a.spendMicros)[0];
      return { clienteId: p.id, nombre: p.name, moneda: mayor.currency, gastoMicros: mayor.spendMicros };
    })
    .filter((c) => c.gastoMicros > 0)
    .sort((a, b) => b.gastoMicros - a.gastoMicros)
    .slice(0, MAX_CLIENTES);

  const conteoAlertas: Record<Severidad, number> = { critica: 0, alta: 0, media: 0 };
  for (const a of alertas) conteoAlertas[a.severidad]++;

  return {
    generadoEn: ahora,
    periodo: { desde: snap.rangeStart, hasta: snap.rangeEnd, enCurso: snap.rango.enCurso },
    totalesPorMoneda: snap.currencyTotals,
    clientesConMasGasto,
    alertas: conteoAlertas,
    masUrgentes: alertas.slice(0, MAX_ALERTAS_DESTACADAS),
    cuentasQueNecesitanAtencion: snap.accounts.filter(
      (a) => a.connectionStatus === "needs_attention" || a.metricsStatus === "error",
    ).length,
  };
}
