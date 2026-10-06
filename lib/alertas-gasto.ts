import type { Alerta } from "@/lib/alertas";
import { calcularPresupuesto } from "@/lib/presupuesto";

type ClientePresupuesto = {
  id: string;
  name: string;
  monthlyBudgetMicros: number | null;
  monthlyBudgetCurrency: string | null;
};

const fmt = (micros: number, moneda: string) => `${moneda} ${Math.round(micros / 1_000_000).toLocaleString("es")}`;

/**
 * Alertas del límite de gasto: el presupuesto mensual del cliente contra lo gastado en el mes (misma moneda).
 * Solo avisa; nunca pausa nada. Sin presupuesto cargado, no hay límite que vigilar.
 */
export function alertasDeLimiteDeGasto(
  clientes: ClientePresupuesto[],
  gastadoMesPorCliente: Map<string, Record<string, number>>,
  hoy: Date,
): Alerta[] {
  const alertas: Alerta[] = [];
  for (const c of clientes) {
    if (!c.monthlyBudgetMicros || !c.monthlyBudgetCurrency) continue;
    const gastado = gastadoMesPorCliente.get(c.id)?.[c.monthlyBudgetCurrency] ?? 0;
    const r = calcularPresupuesto(c.monthlyBudgetMicros, gastado, hoy);
    if (!r) continue;
    const moneda = c.monthlyBudgetCurrency;
    const base = { clienteId: c.id, clienteNombre: c.name, plataforma: null, cuenta: "Todas", campana: "Límite de gasto del mes", accion: null };
    const detalle = `Gastado ${fmt(r.gastadoMicros, moneda)} de ${fmt(r.presupuestoMicros, moneda)} (${Math.round(r.fraccionGastada * 100)} %).`;
    if (r.estado === "excedido") {
      alertas.push({ ...base, id: `limite-${c.id}`, severidad: "critica", diagnostico: `Se pasó del presupuesto del mes. ${detalle} Revisa qué campañas pausar o redistribuir.` });
    } else if (r.estado === "agotado") {
      alertas.push({ ...base, id: `limite-${c.id}`, severidad: "alta", diagnostico: `El presupuesto del mes está casi agotado y quedan ${r.diasRestantes} días. ${detalle}` });
    } else if (r.estado === "adelantado") {
      alertas.push({ ...base, id: `limite-${c.id}`, severidad: "media", diagnostico: `Al ritmo actual (${fmt(r.ritmoDiarioMicros, moneda)} al día) cerraría el mes en ${fmt(r.proyeccionMicros, moneda)}, por encima del presupuesto. ${detalle}` });
    }
  }
  return alertas;
}
