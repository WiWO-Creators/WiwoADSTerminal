"use client";

import type { PerformanceSnapshot } from "@/lib/performance-store";
import { SaludDeMedicion } from "./salud-medicion";
import { Surface } from "./ui";

/**
 * Salud de medición: ¿se está midiendo bien lo que se paga? GA4, Tag Manager, eventos clave y conversiones de cada cliente.
 * Es la única ventana donde vive esto (antes estaba pegado a la ficha del cliente). Sin cliente elegido se pide elegir uno.
 */
export function MedicionView({
  clienteId,
  performance,
  puedeEditar,
  onElegirCliente,
}: {
  clienteId: string | null;
  performance: PerformanceSnapshot;
  puedeEditar: boolean;
  onElegirCliente: (id: string) => void;
}) {
  const cliente = performance.portfolios.find((p) => p.id === clienteId) ?? null;
  if (!cliente) {
    const clientes = performance.portfolios.filter((p) => p.declared && !p.archivado).sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <div>
          <p className="font-micro text-[0.65rem] text-muted-foreground">CALIDAD DE DATOS</p>
          <h2 className="neo-section-title">Salud de medición</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mide bien antes de optimizar: revisa que cada cliente esté midiendo sus conversiones. Elige un cliente.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {clientes.map((p) => (
            <button key={p.id} type="button" onClick={() => onElegirCliente(p.id)} className="text-left">
              <Surface className="p-3 text-sm font-semibold text-foreground transition-colors hover:border-brand/40">{p.name}</Surface>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <div>
        <p className="font-micro text-[0.65rem] text-muted-foreground">CALIDAD DE DATOS</p>
        <h2 className="neo-section-title">Salud de medición · {cliente.name}</h2>
      </div>
      <SaludDeMedicion key={`medicion-${cliente.id}`} portfolioId={cliente.id} puedeEditar={puedeEditar} />
    </div>
  );
}
