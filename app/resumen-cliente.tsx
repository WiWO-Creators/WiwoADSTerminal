"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";

import type { Alerta, Severidad } from "@/lib/alertas";
import type { PortfolioSummary } from "@/lib/portafolios";
import { Surface } from "./ui";

function moneda(micros: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(micros / 1_000_000);
  } catch {
    return `${currency} ${Math.round(micros / 1_000_000).toLocaleString("es-CL")}`;
  }
}

function entero(valor: number): string {
  return new Intl.NumberFormat("es-CL").format(valor);
}

/**
 * Igual que `TarjetaResumenSemanal` (Dashboard C-Level), pero recortada a un
 * solo cliente: acá sí tiene sentido, porque no es un total de cartera sino
 * la campaña de una sola cuenta. Vive en la vista Clientes, arriba de la
 * tabla de campañas, en vez de en Inicio o en el dashboard agregado.
 *
 * Inversión/clics/resultados salen directo de `performance.portfolios`, ya
 * cargado por quien monta esto — sin fetch propio. Las alertas sí se piden
 * aparte (`/api/alertas?cliente=`), porque `generarAlertas` no viaja en el
 * snapshot base.
 */
export function TarjetaResumenCliente({
  portfolio,
  periodo,
}: {
  portfolio: PortfolioSummary;
  periodo: { desde: string; hasta: string; enCurso: boolean };
}) {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga por cliente, ver nota de arriba
    setAlertas(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/alertas?cliente=${encodeURIComponent(portfolio.id)}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as { alertas?: Alerta[] };
        if (!cancelado && response.ok) setAlertas(body.alertas ?? []);
      } catch {
        // Sin alertas la tarjeta igual muestra inversión y resultados.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [portfolio.id]);

  const conteo: Record<Severidad, number> = { critica: 0, alta: 0, media: 0 };
  for (const a of alertas ?? []) conteo[a.severidad]++;
  const totalAlertas = conteo.critica + conteo.alta + conteo.media;

  return (
    <Surface className="mb-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-brand" />
          <h3 className="text-sm font-bold text-foreground">
            Resumen de la semana
          </h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {periodo.desde} a {periodo.hasta}
          {periodo.enCurso ? " · en curso" : ""}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">
            Inversión del periodo
          </p>
          <p className="mt-1 space-y-0.5">
            {portfolio.currencyTotals.length === 0 ? (
              <span className="metric-number text-lg font-extrabold text-foreground">
                —
              </span>
            ) : (
              portfolio.currencyTotals.map((t) => (
                <span
                  key={t.currency}
                  className="metric-number block text-lg font-extrabold text-foreground"
                >
                  {moneda(t.spendMicros, t.currency)}
                </span>
              ))
            )}
          </p>
        </div>

        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">
            Clics y resultados
          </p>
          <p className="metric-number mt-1 text-lg font-extrabold text-foreground">
            {portfolio.clicks === null ? "—" : entero(portfolio.clicks)}{" "}
            <span className="text-sm font-normal text-muted-foreground">clics</span>
          </p>
          <p className="metric-number text-sm text-muted-foreground">
            {portfolio.conversions === null
              ? "Sin resultados en el rango"
              : `${entero(portfolio.conversions)} resultados`}
          </p>
        </div>

        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">
            Alertas activas
          </p>
          {alertas === null ? (
            <p className="mt-1 text-sm text-muted-foreground">Cargando…</p>
          ) : totalAlertas === 0 ? (
            <p className="mt-1 text-sm text-foreground">Todo en orden.</p>
          ) : (
            <div className="mt-1 space-y-1">
              <p className="flex items-center gap-1.5 text-sm text-foreground">
                <AlertTriangle className="size-3.5 text-warn" />
                {conteo.critica > 0 &&
                  `${conteo.critica} crítica${conteo.critica === 1 ? "" : "s"}`}
                {conteo.critica > 0 && (conteo.alta > 0 || conteo.media > 0) && " · "}
                {conteo.alta > 0 && `${conteo.alta} alta${conteo.alta === 1 ? "" : "s"}`}
                {conteo.alta > 0 && conteo.media > 0 && " · "}
                {conteo.media > 0 && `${conteo.media} por revisar`}
              </p>
              <p className="text-xs text-muted-foreground">
                Ábrelas desde &ldquo;Alertas&rdquo; en el menú.
              </p>
            </div>
          )}
        </div>
      </div>
    </Surface>
  );
}
