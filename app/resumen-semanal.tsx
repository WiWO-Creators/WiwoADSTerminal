"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";

import { haceTiempo } from "@/lib/tiempo";
import type { ResumenSemanal } from "@/lib/resumen-semanal";
import { Surface, ThinkingOrb } from "./ui";

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

/**
 * Resumen de la semana: lo que conviene saber al entrar un lunes, sin abrir
 * cliente por cliente. Se calcula solo, junto con la actualización de datos
 * (ver `app/api/actualizar/route.ts`) — esta tarjeta solo lo lee y lo
 * muestra. Solo para quien ve toda la cartera (admin/lead); para el resto no
 * se monta nada.
 */
export function TarjetaResumenSemanal({ puedeVer }: { puedeVer: boolean }) {
  const [resumen, setResumen] = useState<ResumenSemanal | null>(null);
  const [cargando, setCargando] = useState(puedeVer);

  useEffect(() => {
    if (!puedeVer) return;
    let cancelado = false;
    void (async () => {
      try {
        const response = await fetch("/api/resumen-semanal", { cache: "no-store" });
        const body = (await response.json()) as { resumen?: ResumenSemanal };
        if (!cancelado && response.ok) setResumen(body.resumen ?? null);
      } catch {
        // Sin resumen la tarjeta simplemente no aparece — no es un dato crítico.
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [puedeVer]);

  if (!puedeVer) return null;
  if (cargando) {
    return (
      <Surface className="mb-6 flex items-center gap-3 p-5">
        <ThinkingOrb size="sm" state="thinking" label="" />
        <span className="text-sm text-muted-foreground">Cargando el resumen de la semana…</span>
      </Surface>
    );
  }
  // Nunca se corrió una actualización todavía: nada que resumir.
  if (!resumen) return null;

  const totalAlertas = resumen.alertas.critica + resumen.alertas.alta + resumen.alertas.media;

  return (
    <Surface className="mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-brand" />
          <h3 className="text-sm font-bold text-foreground">Resumen de la semana</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {resumen.periodo.desde} a {resumen.periodo.hasta}
          {resumen.periodo.enCurso ? " · en curso" : ""} · actualizado {haceTiempo(resumen.generadoEn)}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">Inversión del periodo</p>
          <p className="mt-1 space-y-0.5">
            {resumen.totalesPorMoneda.length === 0 ? (
              <span className="metric-number text-lg font-extrabold text-foreground">—</span>
            ) : (
              resumen.totalesPorMoneda.map((t) => (
                <span key={t.currency} className="metric-number block text-lg font-extrabold text-foreground">
                  {moneda(t.spendMicros, t.currency)}
                </span>
              ))
            )}
          </p>
        </div>

        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">Clientes con más gasto</p>
          <ul className="mt-1 space-y-1">
            {resumen.clientesConMasGasto.length === 0 ? (
              <li className="text-sm text-muted-foreground">Sin gasto en el periodo</li>
            ) : (
              resumen.clientesConMasGasto.slice(0, 3).map((c) => (
                <li key={c.clienteId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-foreground">{c.nombre}</span>
                  <span className="metric-number shrink-0 text-muted-foreground">
                    {moneda(c.gastoMicros, c.moneda)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">Alertas activas</p>
          {totalAlertas === 0 && resumen.cuentasQueNecesitanAtencion === 0 ? (
            <p className="mt-1 text-sm text-foreground">Todo en orden.</p>
          ) : (
            <div className="mt-1 space-y-1">
              {totalAlertas > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <AlertTriangle className="size-3.5 text-warn" />
                  {resumen.alertas.critica > 0 && `${resumen.alertas.critica} crítica${resumen.alertas.critica === 1 ? "" : "s"}`}
                  {resumen.alertas.critica > 0 && (resumen.alertas.alta > 0 || resumen.alertas.media > 0) && " · "}
                  {resumen.alertas.alta > 0 && `${resumen.alertas.alta} alta${resumen.alertas.alta === 1 ? "" : "s"}`}
                  {resumen.alertas.alta > 0 && resumen.alertas.media > 0 && " · "}
                  {resumen.alertas.media > 0 && `${resumen.alertas.media} por revisar`}
                </p>
              )}
              {resumen.cuentasQueNecesitanAtencion > 0 && (
                <p className="text-xs text-muted-foreground">
                  {resumen.cuentasQueNecesitanAtencion} cuenta
                  {resumen.cuentasQueNecesitanAtencion === 1 ? "" : "s"} con problemas de conexión o de datos
                </p>
              )}
              <p className="text-xs text-muted-foreground">Ábrelas desde &ldquo;Alertas&rdquo; en el menú.</p>
            </div>
          )}
        </div>
      </div>
    </Surface>
  );
}
