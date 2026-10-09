"use client";

import type { HealthCheck } from "./data";
import { platformLabel } from "@/lib/plataformas";
import { OBJETIVO_LABELS, type Objetivo } from "@/lib/objetivos";
import { ETIQUETA_DE_ESTADO, resumenDeTablero, type CampanaDeTablero } from "@/lib/tablero-salud-pura";
import { Dona, Kpi, Tarjeta } from "./medicion-panel";

/**
 * Tablero de Salud de medición de un cliente: las campañas del periodo y el estado de las lecturas de un vistazo, con tarjetas de
 * KPIs, gráficos de torta, barras y una tabla. Todo sale de las campañas y verificaciones reales de ese cliente.
 */

const COLORES_DE_PLATAFORMA: Record<string, string> = {
  meta: "var(--chart-1)",
  google: "var(--warn)",
  linkedin: "#38bdf8",
  tiktok: "#f472b6",
};
const COLOR_POR_DEFECTO = "#94a3b8";

const COLOR_DE_ESTADO = { activa: "var(--brand)", pausada: "#64748b", otra: "var(--warn)" } as const;
const COLOR_DE_LECTURA = { healthy: "var(--brand)", warning: "var(--warn)", critical: "var(--danger)", inactive: "#64748b" } as const;
const ETIQUETA_DE_LECTURA = { healthy: "En verde", warning: "Advertencia", critical: "Crítica", inactive: "Inactiva" } as const;

function dinero(valor: number, moneda: string | null): string {
  try {
    return valor.toLocaleString("es-CL", { style: "currency", currency: moneda ?? "USD", maximumFractionDigits: 0 });
  } catch {
    return `${Math.round(valor).toLocaleString("es-CL")} ${moneda ?? ""}`.trim();
  }
}

export function TableroDeSalud({
  campanas,
  checks,
  periodo,
}: {
  campanas: CampanaDeTablero[];
  checks: HealthCheck[];
  periodo: string;
}) {
  const r = resumenDeTablero(campanas);
  const lecturas = (["healthy", "warning", "critical", "inactive"] as const)
    .map((estado) => ({ estado, cantidad: checks.filter((c) => c.state === estado).length }))
    .filter((l) => l.cantidad > 0);
  if (r.total === 0 && checks.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Tarjeta titulo="Campañas por plataforma">
          <Dona partes={r.porPlataforma.map((p) => ({ etiqueta: platformLabel(p.provider), valor: p.cantidad, color: COLORES_DE_PLATAFORMA[p.provider] ?? COLOR_POR_DEFECTO }))} centro={String(r.total)} />
        </Tarjeta>

        <div className="grid gap-3">
          <Tarjeta className="flex items-center justify-center">
            <Kpi etiqueta="Campañas del cliente" valor={r.total.toLocaleString("es-CL")} nota={periodo} />
          </Tarjeta>
          <Tarjeta className="flex items-center justify-center">
            <Kpi etiqueta="Sin objetivo claro" valor={r.sinObjetivo.toLocaleString("es-CL")} nota={r.sinObjetivo > 0 ? "su nombre no sigue la convención" : "todas siguen la convención"} />
          </Tarjeta>
        </div>

        <Tarjeta titulo="Campañas por estado">
          <Dona partes={r.porEstado.map((e) => ({ etiqueta: ETIQUETA_DE_ESTADO[e.estado], valor: e.cantidad, color: COLOR_DE_ESTADO[e.estado] }))} />
        </Tarjeta>

        <Tarjeta titulo="Inversión por cuenta" className="overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-foreground/50">
                <th className="pb-1.5 font-semibold">Cuenta</th>
                <th className="pb-1.5 text-right font-semibold">Invertido</th>
              </tr>
            </thead>
            <tbody>
              {r.porCuenta.slice(0, 7).map((c) => (
                <tr key={c.id} className="border-t border-foreground/8">
                  <td className="max-w-0 truncate py-1.5 pr-2 text-foreground/80" title={`${c.nombre} · ${platformLabel(c.provider)}`}>
                    <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: COLORES_DE_PLATAFORMA[c.provider] ?? COLOR_POR_DEFECTO }} />
                    {c.nombre}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{dinero(c.invertido, c.moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Tarjeta titulo="Estado de las lecturas">
          <Dona
            partes={lecturas.map((l) => ({ etiqueta: ETIQUETA_DE_LECTURA[l.estado], valor: l.cantidad, color: COLOR_DE_LECTURA[l.estado] }))}
            centro={checks.length > 0 ? `${Math.round((checks.filter((c) => c.state === "healthy").length / checks.length) * 100)}%` : undefined}
          />
        </Tarjeta>
        <Tarjeta titulo="Campañas por objetivo" className="md:col-span-3">
          {r.porObjetivo.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground/55">Este cliente no tuvo campañas con actividad en el periodo.</p>
          ) : (
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {r.porObjetivo.map((g) => (
                <div key={g.objetivo ?? "sin"} className="min-w-0">
                  <p className="mb-1.5 flex items-center justify-between text-xs font-bold text-foreground/80">
                    <span>{g.objetivo ? OBJETIVO_LABELS[g.objetivo as Objetivo] ?? g.objetivo : "Sin objetivo claro"}</span>
                    <span className="font-normal text-foreground/45">{g.campanas.length}</span>
                  </p>
                  <ul className="space-y-1">
                    {g.campanas.slice(0, 4).map((c, i) => (
                      <li key={`${i}-${c.nombre}`} className="flex items-center gap-2 text-xs text-foreground/70" title={c.nombre}>
                        <span className="size-2 shrink-0 rounded-full" style={{ background: COLOR_DE_ESTADO[c.estado] }} />
                        <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                        <span className="shrink-0 text-[0.65rem] text-foreground/40">{platformLabel(c.provider).replace(" Ads", "")}</span>
                      </li>
                    ))}
                    {g.campanas.length > 4 && <li className="text-[0.65rem] text-foreground/40">y {g.campanas.length - 4} más</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
