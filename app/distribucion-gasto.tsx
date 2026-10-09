"use client";

import { useMemo } from "react";
import { PieChart } from "lucide-react";

import { concentracion, distribuirPorMoneda, plataformasSinGasto, type DistribucionDelGasto, type Segmento } from "@/lib/distribucion";
import { OBJETIVO_LABELS, type ObjectiveTotal, type Objetivo } from "@/lib/objetivos";
import type { CampaignSummary } from "@/lib/performance-store";
import { platformLabel } from "@/lib/plataformas";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

function dinero(micros: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(
      micros / 1_000_000,
    );
  } catch {
    return `${moneda} ${Math.round(micros / 1_000_000).toLocaleString("es-CL")}`;
  }
}

const pct = (f: number) => `${f >= 0.995 ? 100 : f < 0.01 && f > 0 ? "<1" : Math.round(f * 100)} %`;

/** Colores por plataforma y objetivo; siempre van acompañados de texto y porcentaje. */
const COLOR_PLATAFORMA: Record<string, string> = { google: "bg-sky-500", meta: "bg-indigo-500" };
const COLOR_OBJETIVO: Record<string, string> = {
  AE: "bg-violet-500",
  TRF: "bg-sky-500",
  LDS: "bg-emerald-500",
  VTA: "bg-amber-500",
  OCV: "bg-rose-500",
  sin_sigla: "bg-foreground/35",
};

function Barras({
  filas,
}: {
  filas: Array<{ clave: string; etiqueta: string; detalle?: string; valor: string; fraccion: number; color: string }>;
}) {
  return (
    <ul className="mt-3 space-y-3">
      {filas.map((f) => (
        <li key={f.clave}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-foreground" title={f.etiqueta}>
              {f.etiqueta}
            </span>
            <span className="metric-number shrink-0 text-foreground/70">
              {f.valor} · {pct(f.fraccion)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div className={cn("h-full rounded-full", f.color)} style={{ width: `${Math.max(2, f.fraccion * 100)}%` }} />
          </div>
          {f.detalle && <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{f.detalle}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * ¿Adónde se fue el presupuesto y qué dio a cambio? Reparte el gasto del periodo
 * por plataforma, por objetivo (con el resultado propio de cada uno, que no se
 * puede sumar entre objetivos) y por campaña. Sin gasto no muestra nada.
 */
export function DistribucionDelGasto({
  campanas,
  objetivos,
  periodo,
}: {
  campanas: CampaignSummary[];
  objetivos: ObjectiveTotal[];
  periodo: string;
}) {
  const porMoneda = useMemo(() => distribuirPorMoneda(campanas), [campanas]);
  const sinGasto = useMemo(() => plataformasSinGasto(campanas), [campanas]);
  if (porMoneda.length === 0) return null;

  const resultadoPorObjetivo = new Map(objetivos.map((o) => [o.objetivo as string, o]));
  const etiquetaObjetivo = (s: Segmento) =>
    s.clave === "sin_sigla" ? "Sin sigla de objetivo" : (OBJETIVO_LABELS[s.clave as Objetivo] ?? s.clave);
  const varias = porMoneda.length > 1;

  return (
    <Surface className="mb-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PieChart className="size-4 text-brand" />
          <h3 className="text-sm font-bold text-foreground">¿Adónde se fue el presupuesto?</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {periodo}
          {!varias && ` · ${dinero(porMoneda[0].totalMicros, porMoneda[0].moneda)} en total`}
        </span>
      </div>

      {porMoneda.map((d) => (
        <BloqueDeMoneda key={d.moneda} d={d} varias={varias} resultadoPorObjetivo={resultadoPorObjetivo} etiquetaObjetivo={etiquetaObjetivo} />
      ))}
      {sinGasto.length > 0 && (
        <p className="mt-3 rounded-lg bg-foreground/5 px-3 py-2 text-xs leading-5 text-foreground/65">
          Sin gasto en este periodo: {sinGasto.map((s) => `${platformLabel(s.provider)} (${s.campanas} ${s.campanas === 1 ? "campaña" : "campañas"})`).join(", ")}. Tienen campañas, pero no invirtieron nada.
        </p>
      )}
    </Surface>
  );
}

function BloqueDeMoneda({
  d,
  varias,
  resultadoPorObjetivo,
  etiquetaObjetivo,
}: {
  d: DistribucionDelGasto;
  varias: boolean;
  resultadoPorObjetivo: Map<string, ObjectiveTotal>;
  etiquetaObjetivo: (s: Segmento) => string;
}) {
  const concentrada = concentracion(d);
  return (
    <div className={cn(varias && "mt-4 border-t border-foreground/10 pt-4")}>
      {varias && (
        <p className="text-xs font-bold text-foreground/80">
          Gasto en {d.moneda} · {dinero(d.totalMicros, d.moneda)} en total
        </p>
      )}
      <div className="mt-2 grid gap-6 lg:grid-cols-3">
        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">POR PLATAFORMA</p>
          <Barras
            filas={d.porPlataforma.map((s) => ({
              clave: s.clave,
              etiqueta: platformLabel(s.clave),
              valor: dinero(s.gastoMicros, d.moneda),
              fraccion: s.fraccion,
              color: COLOR_PLATAFORMA[s.clave] ?? "bg-foreground/40",
              detalle: `${s.campanas} ${s.campanas === 1 ? "campaña" : "campañas"} · ${s.clics.toLocaleString("es-CL")} clics`,
            }))}
          />
        </div>

        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">POR OBJETIVO Y LO QUE DIO</p>
          <Barras
            filas={d.porObjetivo.map((s) => {
              const o = resultadoPorObjetivo.get(s.clave);
              // El resultado se compara con el gasto del objetivo en la MISMA moneda que se muestra.
              const gastoObjetivo = o?.currencyTotals.find((t) => t.currency === d.moneda)?.spendMicros ?? null;
              const resultado = o?.result ?? null;
              const detalle =
                s.clave === "sin_sigla"
                  ? "No siguen la convención de nombres: su resultado no se puede asignar a un objetivo."
                  : resultado !== null && resultado > 0
                    ? `${resultado.toLocaleString("es-CL", { maximumFractionDigits: 1 })} ${o?.resultLabel.toLowerCase() ?? "resultados"}${
                        gastoObjetivo ? ` · ${dinero(gastoObjetivo / resultado, d.moneda)} por cada uno` : ""
                      }`
                    : undefined;
              return {
                clave: s.clave,
                etiqueta: etiquetaObjetivo(s),
                valor: dinero(s.gastoMicros, d.moneda),
                fraccion: s.fraccion,
                color: COLOR_OBJETIVO[s.clave] ?? "bg-foreground/40",
                detalle,
              };
            })}
          />
        </div>

        <div>
          <p className="font-micro text-[0.6rem] text-muted-foreground">CAMPAÑAS QUE MÁS GASTAN</p>
          <Barras
            filas={d.topCampanas.map((c, i) => ({
              clave: `${i}-${c.nombre}`,
              etiqueta: c.nombre,
              valor: dinero(c.gastoMicros, d.moneda),
              fraccion: c.fraccion,
              color: COLOR_PLATAFORMA[c.provider] ?? "bg-foreground/40",
              detalle: platformLabel(c.provider),
            }))}
          />
        </div>
      </div>

      {concentrada >= 0.6 && d.porObjetivo.length > 0 && (
        <p className="mt-4 rounded-lg bg-warn/8 px-3 py-2 text-xs leading-5 text-foreground/75">
          El {Math.round(concentrada * 100)} % del gasto está en una sola campaña: si esa falla, casi todo el presupuesto
          queda sin resultados.
        </p>
      )}
    </div>
  );
}
