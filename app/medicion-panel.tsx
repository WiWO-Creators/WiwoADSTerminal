"use client";

import { useState, type ReactNode } from "react";

import type { ResultadoMedicion } from "@/lib/medicion";
import { ETIQUETA_DE_TIPO, hallazgosPorSeveridad, resumenDePanel, tendenciaDeLeads, type TipoDeEvento } from "@/lib/medicion-panel-pura";
import { cn } from "@/lib/utils";

/**
 * Panel visual de Salud de medición: lo que GA4 está midiendo, de un vistazo (KPIs, gráficos de torta, barras y una tabla), con el
 * mismo tamaño de tarjetas que un tablero de reportes. Todo sale de los eventos reales de la propiedad; el selector de periodo
 * cambia entre los últimos 30 y 7 días.
 */

const COLOR_DE_TIPO: Record<TipoDeEvento, string> = {
  lead: "var(--brand)",
  clave: "var(--chart-1)",
  interaccion: "var(--warn)",
  otro: "#a78bfa",
  navegacion: "#64748b",
};

const COLOR_DE_SEVERIDAD = { alta: "var(--danger)", media: "var(--warn)", ok: "var(--ok-deep)" } as const;

const n = (v: number) => v.toLocaleString("es-CL");
const pct = (v: number) => `${v.toLocaleString("es-CL", { maximumFractionDigits: 1 })} %`;

export function Tarjeta({ titulo, children, className }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-foreground/10 bg-gradient-to-br from-brand/8 via-card/70 to-card/40 p-4", className)}>
      {titulo && <h4 className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-foreground/65">{titulo}</h4>}
      {children}
    </section>
  );
}

export function Kpi({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: ReactNode }) {
  return (
    <div className="text-center">
      <p className="text-[0.7rem] font-bold uppercase tracking-wide text-foreground/55">{etiqueta}</p>
      <p className="mt-1 text-4xl font-extrabold leading-none text-foreground tabular-nums">{valor}</p>
      {nota && <p className="mt-1.5 text-xs text-foreground/55">{nota}</p>}
    </div>
  );
}

type Parte = { etiqueta: string; valor: number; color: string };

/** Gráfico de torta (dona) en SVG, con su leyenda: cada parte con su cantidad y su porcentaje. */
export function Dona({ partes, centro }: { partes: Parte[]; centro?: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const radio = 42;
  const largo = 2 * Math.PI * radio;
  let acumulado = 0;
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 120 120" className="size-32 -rotate-90" role="img" aria-label={partes.map((p) => `${p.etiqueta}: ${n(p.valor)}`).join(", ")}>
        <circle cx="60" cy="60" r={radio} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="18" />
        {total > 0 &&
          partes.map((p) => {
            const trozo = (p.valor / total) * largo;
            const desfase = -acumulado;
            acumulado += trozo;
            return (
              <circle
                key={p.etiqueta}
                cx="60"
                cy="60"
                r={radio}
                fill="none"
                stroke={p.color}
                strokeWidth="18"
                strokeDasharray={`${Math.max(trozo - (partes.length > 1 ? 1.5 : 0), 0)} ${largo}`}
                strokeDashoffset={desfase}
              />
            );
          })}
        {centro && (
          <text x="60" y="60" textAnchor="middle" dominantBaseline="central" transform="rotate(90 60 60)" className="fill-foreground text-[15px] font-bold">
            {centro}
          </text>
        )}
      </svg>
      <ul className="w-full space-y-1 text-xs">
        {partes.map((p) => (
          <li key={p.etiqueta} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate text-foreground/75">{p.etiqueta}</span>
            <span className="tabular-nums text-foreground/55">
              {n(p.valor)}
              {total > 0 && partes.length > 1 ? ` · ${pct((p.valor / total) * 100)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Barras({ filas }: { filas: Array<{ nombre: string; valor: number; color: string }> }) {
  const maximo = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ul className="space-y-2">
      {filas.map((f) => (
        <li key={f.nombre} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-xs">
          <span className="truncate text-foreground/70" title={f.nombre}>
            {f.nombre}
          </span>
          <span className="relative block h-5 overflow-hidden rounded-md bg-foreground/8">
            <span className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.max((f.valor / maximo) * 100, 2)}%`, background: f.color }} />
            <span className="absolute inset-y-0 right-2 flex items-center font-semibold tabular-nums text-foreground">{n(f.valor)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PanelDeMedicion({ r, gtm, propiedades }: { r: ResultadoMedicion; gtm: "tiene" | "no_tiene" | null; propiedades: number }) {
  const [periodo, setPeriodo] = useState<30 | 7>(30);
  if (!r.eventos || r.eventos.length === 0) return null;
  const hay7 = Boolean(r.eventos7 && r.eventos7.length > 0);
  const usado = periodo === 7 && hay7 ? (r.eventos7 ?? []) : r.eventos;
  const dias = periodo === 7 && hay7 ? 7 : 30;
  const s = resumenDePanel(usado);
  const tendencia = tendenciaDeLeads(r.eventos, r.eventos7);
  const severidad = hallazgosPorSeveridad(r.hallazgos);
  const problemas = r.hallazgos.length;

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-foreground/55">Lo que Google Analytics está midiendo hoy en este cliente.</p>
        {hay7 && (
          <div role="group" aria-label="Periodo" className="flex gap-1 rounded-full border border-foreground/10 p-1 text-xs font-semibold">
            {([30, 7] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPeriodo(d)}
                className={cn("rounded-full px-3 py-1", periodo === d ? "bg-brand text-primary-foreground" : "text-foreground/60 hover:bg-foreground/6")}
              >
                Últimos {d} días
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Tarjeta titulo="Eventos por tipo">
          <Dona partes={s.porTipo.map((t) => ({ etiqueta: t.etiqueta, valor: t.eventos, color: COLOR_DE_TIPO[t.tipo] }))} />
        </Tarjeta>

        <div className="grid gap-3">
          <Tarjeta className="flex items-center justify-center">
            <Kpi etiqueta={`Eventos · ${dias} días`} valor={n(s.total)} nota={`${n(s.distintos)} tipos de evento`} />
          </Tarjeta>
          <Tarjeta className="flex items-center justify-center">
            <Kpi etiqueta="Conversiones" valor={n(s.conversiones)} nota="eventos marcados como clave" />
          </Tarjeta>
        </div>

        <Tarjeta titulo="Estado de la medición">
          <Dona partes={severidad.map((x) => ({ etiqueta: x.etiqueta, valor: x.cantidad, color: COLOR_DE_SEVERIDAD[x.clave] }))} centro={problemas === 0 ? "OK" : String(problemas)} />
        </Tarjeta>

        <Tarjeta titulo="Eventos principales" className="overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-foreground/50">
                <th className="pb-1.5 font-semibold">Evento</th>
                <th className="pb-1.5 text-right font-semibold">Eventos</th>
              </tr>
            </thead>
            <tbody>
              {s.principales.map((e) => (
                <tr key={e.nombre} className="border-t border-foreground/8">
                  <td className="max-w-0 truncate py-1.5 pr-2 text-foreground/80" title={`${e.nombre} · ${ETIQUETA_DE_TIPO[e.tipo]}`}>
                    <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: COLOR_DE_TIPO[e.tipo] }} />
                    {e.nombre}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">{n(e.eventos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Tarjeta className="flex items-center justify-center">
          <Kpi
            etiqueta="Leads por día"
            valor={tendencia ? tendencia.porDia7.toLocaleString("es-CL", { maximumFractionDigits: 1 }) : "—"}
            nota={
              tendencia ? (
                <>
                  última semana
                  {tendencia.cambio !== null && (
                    <>
                      {" · "}
                      <strong className={tendencia.cambio < -25 ? "text-danger" : tendencia.cambio > 0 ? "text-ok" : "text-foreground/70"}>
                        {tendencia.cambio > 0 ? "+" : ""}
                        {pct(tendencia.cambio)}
                      </strong>{" "}
                      vs el promedio de 30 días
                    </>
                  )}
                </>
              ) : (
                "sin la última semana para comparar"
              )
            }
          />
        </Tarjeta>

        <Tarjeta titulo={`Leads y conversiones por evento · ${dias} días`} className="md:col-span-2">
          {s.leads.length === 0 ? (
            <p className="py-6 text-center text-sm text-foreground/55">No hay eventos de lead ni conversiones con datos en este periodo.</p>
          ) : (
            <Barras filas={s.leads.map((e) => ({ nombre: e.nombre, valor: e.eventos, color: COLOR_DE_TIPO[e.tipo] }))} />
          )}
        </Tarjeta>

        <Tarjeta titulo="Base de la medición" className="flex flex-col justify-center gap-4">
          <Kpi
            etiqueta="Tag Manager"
            valor={gtm === "tiene" ? "Sí" : gtm === "no_tiene" ? "No" : "—"}
            nota={gtm === "no_tiene" ? "los leads pueden medirse mal" : gtm === "tiene" ? "contenedor registrado" : "sin dato en la ficha"}
          />
          <Kpi etiqueta="Propiedades de GA4" valor={n(propiedades)} />
        </Tarjeta>
      </div>
    </div>
  );
}
