"use client";

import { summarizeObjectives } from "@/lib/objetivos";
import type { PerformanceSnapshot } from "@/lib/performance-store";
import { DistribucionDelGasto } from "./distribucion-gasto";
import { PresupuestoDelMes } from "./presupuesto-mes";
import { Surface } from "./ui";

const dinero = (micros: number, moneda: string): string => {
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(micros / 1_000_000);
  } catch {
    return `${Math.round(micros / 1_000_000).toLocaleString("es-CL")} ${moneda}`;
  }
};

/**
 * Inversión: cuánto se gastó, contra qué presupuesto y adónde se fue. Es lo que antes estaba repartido entre la ficha
 * del cliente y el Dashboard, ahora en una ventana propia. Sin cliente elegido muestra el gasto de cada cliente
 * (por moneda, sin mezclarlas); con uno, su presupuesto del mes y la distribución del gasto.
 */
export function InversionView({
  clienteId,
  performance,
  periodo,
  onElegirCliente,
}: {
  clienteId: string | null;
  performance: PerformanceSnapshot;
  periodo: string;
  onElegirCliente: (id: string) => void;
}) {
  const cliente = performance.portfolios.find((p) => p.id === clienteId) ?? null;

  if (!cliente) {
    const filas = performance.portfolios
      .filter((p) => p.declared && !p.archivado && p.currencyTotals.some((t) => t.spendMicros > 0))
      .sort((a, b) => Math.max(...b.currencyTotals.map((t) => t.spendMicros)) - Math.max(...a.currencyTotals.map((t) => t.spendMicros)));
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <div>
          <h2 className="neo-section-title">Inversión</h2>
          <p className="mt-1 text-sm text-muted-foreground">Gasto de {periodo} por cliente, agrupado por moneda: las monedas no se suman entre sí. Elige uno para ver su presupuesto y adónde se fue.</p>
        </div>
        {filas.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay gasto en este periodo.</p>}
        {filas.map((p) => (
          <button key={p.id} type="button" onClick={() => onElegirCliente(p.id)} className="block w-full text-left">
            <Surface className="p-4 transition-colors hover:border-brand/40">
              <p className="text-sm font-semibold text-foreground">{p.name}</p>
              <p className="mt-1 text-xs text-foreground/70">
                {p.currencyTotals.filter((t) => t.spendMicros > 0).map((t) => dinero(t.spendMicros, t.currency)).join(" · ")}
              </p>
            </Surface>
          </button>
        ))}
      </div>
    );
  }

  const cuentas = new Set(cliente.accounts.map((a) => a.id));
  const campanas = performance.campaigns.filter((c) => cuentas.has(c.accountKey));
  const objetivos = summarizeObjectives(campanas).filter((o) => o.result !== null && o.result > 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <div>
        <h2 className="neo-section-title">Inversión · {cliente.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Presupuesto del mes y adónde se fue el gasto de {periodo}.</p>
      </div>
      <PresupuestoDelMes key={`presupuesto-${cliente.id}`} portfolioId={cliente.id} />
      <DistribucionDelGasto campanas={campanas} objetivos={objetivos} periodo={periodo} />
    </div>
  );
}
