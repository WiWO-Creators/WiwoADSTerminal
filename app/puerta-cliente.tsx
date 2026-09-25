"use client";

import { useState } from "react";
import { Building2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { PortfolioSummary } from "@/lib/portafolios";
import { cn } from "@/lib/utils";

/**
 * Puerta de entrada: elegir un cliente antes de ver nada más, como el
 * selector de cuenta de Google Ads Manager. Es de una sola vez por sesión
 * (`wiwo-ads-puerta-cliente-resuelta` en `sessionStorage`, ver
 * `dashboard.tsx`) — después de elegir acá, el resto de la app sigue igual
 * que siempre, incluido el selector de cliente de la barra superior (que sí
 * ofrece "Todos los clientes") para cambiar cuantas veces haga falta.
 */
export function PuertaDeCliente({
  clientes,
  onElegir,
}: {
  clientes: PortfolioSummary[];
  onElegir: (portfolioId: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const filtrados = clientes.filter((c) =>
    c.name.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elige un cliente"
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/95 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-[var(--shadow-2)]">
        <div className="border-b border-border px-5 py-4">
          <p className="font-micro text-[0.6rem] text-muted-foreground">
            WIWO.ADS
          </p>
          <h1 className="mt-1 text-lg font-bold text-foreground">
            Elige un cliente para empezar
          </h1>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Después puedes cambiarlo cuando quieras desde el selector de la
            barra superior.
          </p>
        </div>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente…"
              className="h-9 border-border bg-field pl-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtrados.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Ningún cliente coincide con la búsqueda.
            </p>
          ) : (
            filtrados.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                onClick={() => onElegir(cliente.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                  <Building2 className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {cliente.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {cliente.accountCount} cuenta{cliente.accountCount === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
