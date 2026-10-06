"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Wallet } from "lucide-react";

import { fetchConReintento } from "@/lib/fetch-reintento";
import { ETIQUETA_RITMO, type EstadoRitmo, type ResumenPresupuesto } from "@/lib/presupuesto";
import { platformLabel } from "@/lib/plataformas";
import { totalDeEntidades } from "@/lib/presupuesto-entidades";
import type { PresupuestoDeEntidad, TotalDePresupuesto } from "@/lib/presupuesto-entidades";
import { cn } from "@/lib/utils";
import { Surface } from "./ui";

type SegmentoDePresupuesto = {
  id: string;
  nombre: string;
  moneda: string | null;
  presupuestoMensual: ResumenPresupuesto | null;
  totales: TotalDePresupuesto[];
};

export type RespuestaDePresupuesto = {
  /** El presupuesto MENSUAL de la ficha contra lo gastado en el mes. */
  presupuesto: ResumenPresupuesto | null;
  moneda?: string;
  otrasMonedas?: string[];
  /** Gasto por moneda del mes y del año en curso, de todo el cliente. */
  gastadoMesPorMoneda?: Record<string, number>;
  gastadoAnioPorMoneda?: Record<string, number>;
  anio?: number;
  /** Importe gastado mes a mes del año en curso, por plataforma y por moneda. */
  historico?: Array<{ moneda: string; meses: Array<{ mes: string; totalMicros: number; plataformas: Record<string, number> }> }>;
  /** Lo asignado a cada campaña y conjunto, y su suma: cuánto se invirtió y cuánto sobra. */
  campanas?: { totales: TotalDePresupuesto[]; entidades: PresupuestoDeEntidad[]; cuentasSinLeer: string[] };
  segmentos?: SegmentoDePresupuesto[];
};

function dinero(micros: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(
      micros / 1_000_000,
    );
  } catch {
    return `${moneda} ${Math.round(micros / 1_000_000).toLocaleString("es-CL")}`;
  }
}

const ESTILO: Record<EstadoRitmo, { chip: string; barra: string }> = {
  en_ritmo: { chip: "border-ok/40 bg-ok/10 text-ok", barra: "bg-ok" },
  adelantado: { chip: "border-warn/40 bg-warn/10 text-warn", barra: "bg-warn" },
  atrasado: { chip: "border-foreground/25 bg-foreground/6 text-foreground/70", barra: "bg-foreground/40" },
  agotado: { chip: "border-warn/40 bg-warn/10 text-warn", barra: "bg-warn" },
  excedido: { chip: "border-danger/40 bg-danger/10 text-danger", barra: "bg-danger" },
};

/* -------------------------------------------------------------------------- */
/* Lectura compartida: varias pantallas piden lo mismo, se pide una vez.      */
/* -------------------------------------------------------------------------- */

const MEMORIA = new Map<string, { at: number; datos: RespuestaDePresupuesto }>();
const EN_VUELO = new Map<string, Promise<RespuestaDePresupuesto | null>>();
const FALLOS = new Set<string>();
const VIGENCIA_MS = 90_000;

function pedir(portfolioId: string): Promise<RespuestaDePresupuesto | null> {
  const enVuelo = EN_VUELO.get(portfolioId);
  if (enVuelo) return enVuelo;
  const promesa = fetchConReintento(`/api/presupuesto?cliente=${encodeURIComponent(portfolioId)}`, { cache: "no-store" }, 3, 60_000)
    .then(async (r) => (r.ok ? ((await r.json()) as RespuestaDePresupuesto) : null))
    .then((d) => {
      if (d) MEMORIA.set(portfolioId, { at: Date.now(), datos: d });
      return d;
    })
    .catch(() => null)
    .finally(() => EN_VUELO.delete(portfolioId));
  EN_VUELO.set(portfolioId, promesa);
  return promesa;
}

/** `undefined` mientras carga; `null` si no se pudo leer. Lo reciente en memoria se muestra al instante. */
export function usePresupuesto(portfolioId: string): RespuestaDePresupuesto | null | undefined {
  // Solo sirve para volver a pintar cuando llega la respuesta: lo leído vive en MEMORIA (fuera de React).
  const [, repintar] = useState(0);
  useEffect(() => {
    let cancelado = false;
    if (!portfolioId) return;
    const reciente = MEMORIA.get(portfolioId);
    if (reciente && Date.now() - reciente.at < VIGENCIA_MS) return;
    FALLOS.delete(portfolioId);
    void pedir(portfolioId).then((d) => {
      if (d === null) FALLOS.add(portfolioId);
      if (!cancelado) repintar((n) => n + 1);
    });
    return () => {
      cancelado = true;
    };
  }, [portfolioId]);
  const guardado = MEMORIA.get(portfolioId);
  if (guardado) return guardado.datos;
  return FALLOS.has(portfolioId) ? null : undefined;
}

/* -------------------------------------------------------------------------- */
/* Tarjeta completa                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Presupuesto del cliente en tres capas: el del mes (el de la ficha), lo asignado a sus campañas —cuánto se
 * invirtió y cuánto sobra, con la suma y cada una— y lo mismo por segmento (proyecto o mercado). Sirve
 * también para un cliente recién cargado que ya corre: no necesita presupuesto mensual en la ficha.
 */
export function PresupuestoDelMes({ portfolioId }: { portfolioId: string }) {
  const datos = usePresupuesto(portfolioId);
  const [monedaElegida, setMonedaElegida] = useState<string | null>(null);
  if (datos === undefined || datos === null) return null;

  const p = datos.presupuesto;
  const entidades = datos.campanas?.entidades ?? [];
  const totales = datos.campanas?.totales ?? [];
  const segmentos = datos.segmentos ?? [];
  const historico = datos.historico ?? [];

  // Monedas con algo que mostrar; casi siempre es una sola. Con varias se elige cuál ver (nunca se mezclan).
  const monedas = [
    ...new Set([
      ...(datos.moneda ? [datos.moneda] : []),
      ...historico.map((h) => h.moneda),
      ...totales.map((t) => t.moneda),
      ...Object.keys(datos.gastadoAnioPorMoneda ?? {}),
    ]),
  ].filter((m) => m !== "—");
  const moneda = monedaElegida && monedas.includes(monedaElegida) ? monedaElegida : monedas[0];

  if (!moneda || (!p && totales.length === 0 && historico.length === 0)) {
    return (
      <Surface className="flex items-center gap-3 p-4">
        <Wallet className="size-4 shrink-0 text-foreground/40" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Presupuesto</p>
          <p className="text-xs leading-5 text-foreground/55">
            Todavía no hay presupuesto que mostrar: ninguna campaña activa tiene uno asignado y el cliente no tiene presupuesto mensual.
            Defínelo en Cliente → Ficha del cliente, o ponle presupuesto a sus campañas.
          </p>
        </div>
      </Surface>
    );
  }

  const meses = historico.find((h) => h.moneda === moneda)?.meses ?? [];
  const entidadesEnMoneda = entidades.filter((e) => (e.moneda ?? moneda) === moneda);
  const proveedores = [...new Set([...entidadesEnMoneda.map((e) => e.provider), ...meses.flatMap((m) => Object.keys(m.plataformas))])];

  return (
    <Surface className="mb-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-brand" />
          <h3 className="text-sm font-bold text-foreground">Presupuesto e inversión</h3>
        </div>
        {monedas.length > 1 && (
          <span className="flex overflow-hidden rounded-full border border-foreground/15 text-[0.68rem] font-bold" role="group" aria-label="Moneda">
            {monedas.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonedaElegida(m)}
                aria-pressed={m === moneda}
                className={cn("px-2.5 py-1", m === moneda ? "bg-brand text-white" : "text-foreground/60 hover:text-foreground")}
              >
                {m}
              </button>
            ))}
          </span>
        )}
      </div>

      <ResumenEnTresCifras datos={datos} moneda={moneda} />

      {p && datos.moneda === moneda && <BloqueMensual p={p} moneda={moneda} otras={datos.otrasMonedas ?? []} />}

      {meses.length > 0 && <GraficoDeInversion meses={meses} moneda={moneda} presupuestoMensualMicros={p && datos.moneda === moneda ? p.presupuestoMicros : null} />}

      {proveedores.length > 0 && (
        <div className="mt-5 border-t border-foreground/8 pt-4">
          <h4 className="font-micro text-[0.62rem] text-muted-foreground">POR PLATAFORMA</h4>
          <div className="mt-2 space-y-2">
            {proveedores.map((proveedor) => (
              <TarjetaDePlataforma
                key={proveedor}
                proveedor={proveedor}
                moneda={moneda}
                entidades={entidadesEnMoneda.filter((e) => e.provider === proveedor)}
                meses={meses}
              />
            ))}
          </div>
        </div>
      )}

      {segmentos.length > 0 && (
        <div className="mt-5 border-t border-foreground/8 pt-4">
          <h4 className="font-micro text-[0.62rem] text-muted-foreground">POR PROYECTO O MERCADO</h4>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {segmentos.map((s) => (
              <li key={s.id} className="rounded-lg border border-foreground/8 p-3">
                <p className="text-sm font-bold text-foreground">{s.nombre}</p>
                {s.presupuestoMensual && s.moneda === moneda && (
                  <div className="mt-1.5">
                    <p className="text-[0.68rem] text-muted-foreground">Presupuesto mensual</p>
                    <BarraSimple p={s.presupuestoMensual} moneda={moneda} />
                  </div>
                )}
                {s.totales.filter((t) => t.moneda === moneda).map((t) => (
                  <div key={t.moneda} className="mt-2">
                    <FilaDeTotal t={t} compacta />
                  </div>
                ))}
                {!s.presupuestoMensual && s.totales.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Sin campañas con presupuesto asignado.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[0.68rem] leading-4 text-muted-foreground">
        «Invertido» es el importe gastado según las plataformas (el historial). «Asignado» es el presupuesto cargado en cada campaña o conjunto; una
        campaña con presupuesto total cuenta lo gastado desde que empezó, y una diaria, lo del mes.
      </p>

      {(datos.campanas?.cuentasSinLeer ?? []).length > 0 && (
        <p className="mt-3 text-[0.68rem] text-warn">
          No se pudo leer la configuración de {datos.campanas?.cuentasSinLeer.join(", ")}: sus campañas no entran en la suma.
        </p>
      )}
    </Surface>
  );
}

const COLOR_DE_PLATAFORMA: Record<string, string> = {
  google: "#f4b400",
  meta: "#4f7cff",
  linkedin: "#25c2a0",
  tiktok: "#ff2d55",
};
const colorDe = (proveedor: string) => COLOR_DE_PLATAFORMA[proveedor] ?? "#8a8f98";
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** 1.250.000 → «$1,25 M»; 83.000 → «$83 mil». Para etiquetas chicas del gráfico. */
function compacto(micros: number, moneda: string): string {
  const v = micros / 1_000_000;
  const simbolo = moneda === "CLP" ? "$" : `${moneda} `;
  if (Math.abs(v) >= 1_000_000) return `${simbolo}${(v / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1_000) return `${simbolo}${Math.round(v / 1_000).toLocaleString("es-CL")} mil`;
  return `${simbolo}${Math.round(v).toLocaleString("es-CL")}`;
}

/**
 * Lo invertido mes a mes en el año, apilado por plataforma, con la línea del presupuesto mensual si el cliente la
 * tiene. Es lo que permite ver la fluctuación: si un mes se disparó o cayó y en qué plataforma.
 */
function GraficoDeInversion({
  meses,
  moneda,
  presupuestoMensualMicros,
}: {
  meses: Array<{ mes: string; totalMicros: number; plataformas: Record<string, number> }>;
  moneda: string;
  presupuestoMensualMicros: number | null;
}) {
  // Todos los meses del año hasta el último con dato, aunque alguno no tenga gasto: así se ve cuándo empezó y dónde cayó.
  const ultimo = meses[meses.length - 1].mes;
  const anioDelGrafico = ultimo.slice(0, 4);
  const porMes = new Map(meses.map((m) => [m.mes, m]));
  const completos = Array.from({ length: Number(ultimo.slice(5, 7)) }, (_, i) => {
    const mes = `${anioDelGrafico}-${String(i + 1).padStart(2, "0")}`;
    return porMes.get(mes) ?? { mes, totalMicros: 0, plataformas: {} as Record<string, number> };
  });
  const maximo = Math.max(...completos.map((m) => m.totalMicros), presupuestoMensualMicros ?? 0, 1);
  const proveedores = [...new Set(meses.flatMap((m) => Object.keys(m.plataformas)))];
  const ALTO = 120;
  return (
    <div className="mt-5 border-t border-foreground/8 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-micro text-[0.62rem] text-muted-foreground">INVERSIÓN MES A MES (IMPORTE GASTADO)</h4>
        <span className="flex flex-wrap gap-3 text-[0.65rem] text-muted-foreground">
          {proveedores.map((p) => (
            <span key={p} className="flex items-center gap-1">
              <span className="size-2 rounded-sm" style={{ background: colorDe(p) }} /> {platformLabel(p)}
            </span>
          ))}
          {presupuestoMensualMicros !== null && (
            <span className="flex items-center gap-1">
              <span className="h-0 w-3 border-t border-dashed border-foreground/70" /> Presupuesto mensual
            </span>
          )}
        </span>
      </div>
      <div className="relative mt-3" style={{ height: ALTO + 34 }}>
        {presupuestoMensualMicros !== null && (
          <div
            className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-foreground/60"
            style={{ bottom: 34 + (presupuestoMensualMicros / maximo) * ALTO }}
            title={`Presupuesto mensual: ${dinero(presupuestoMensualMicros, moneda)}`}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-2" style={{ height: ALTO + 34 }}>
          {completos.map((m) => {
            const [anio, mes] = m.mes.split("-");
            const alto = (m.totalMicros / maximo) * ALTO;
            return (
              <div key={m.mes} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${m.mes}: ${dinero(m.totalMicros, moneda)}`}>
                <span className="metric-number mb-1 text-[0.58rem] text-muted-foreground">{m.totalMicros > 0 ? compacto(m.totalMicros, moneda) : ""}</span>
                <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: Math.max(alto, 2) }}>
                  {proveedores.map((p) => {
                    const v = m.plataformas[p] ?? 0;
                    if (!v) return null;
                    return <div key={p} style={{ height: `${(v / m.totalMicros) * 100}%`, background: colorDe(p) }} title={`${platformLabel(p)}: ${dinero(v, moneda)}`} />;
                  })}
                </div>
                <span className="mt-1 h-5 text-[0.62rem] text-muted-foreground">
                  {MES_CORTO[Number(mes) - 1]}
                  {mes === "01" ? ` ${anio.slice(2)}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Una plataforma: lo invertido en el año y en el mes (historial real), lo asignado a sus campañas y lo que sobra, y su
 * detalle de campañas y conjuntos plegado.
 */
function TarjetaDePlataforma({
  proveedor,
  moneda,
  entidades,
  meses,
}: {
  proveedor: string;
  moneda: string;
  entidades: PresupuestoDeEntidad[];
  meses: Array<{ mes: string; totalMicros: number; plataformas: Record<string, number> }>;
}) {
  const anio = meses.reduce((s, m) => s + (m.plataformas[proveedor] ?? 0), 0);
  const mesActual = meses.length > 0 ? (meses[meses.length - 1].plataformas[proveedor] ?? 0) : 0;
  const t = totalDeEntidades(entidades).find((x) => x.moneda === moneda) ?? null;
  const pct = t && t.presupuestoMicros > 0 ? Math.min(100, (t.gastadoMicros / t.presupuestoMicros) * 100) : 0;
  const pasado = t !== null && t.restanteMicros < 0;
  const campanas = entidades.filter((e) => e.nivel === "campana");
  const conjuntos = entidades.filter((e) => e.nivel === "conjunto");
  const conPresupuesto = entidades.filter((e) => e.presupuestoMicros !== null || e.gastadoMicros > 0);

  return (
    <details className="group rounded-xl border border-foreground/10">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <span className="flex min-w-32 items-center gap-2 text-sm font-bold text-foreground">
          <span className="size-2.5 rounded-sm" style={{ background: colorDe(proveedor) }} />
          {platformLabel(proveedor)}
        </span>
        <span className="text-xs text-muted-foreground">
          Año <b className="metric-number text-foreground">{dinero(anio, moneda)}</b>
        </span>
        <span className="text-xs text-muted-foreground">
          Este mes <b className="metric-number text-foreground">{dinero(mesActual, moneda)}</b>
        </span>
        {t && (
          <>
            <span className="text-xs text-muted-foreground">
              Asignado <b className="metric-number text-foreground">{dinero(t.presupuestoMicros, moneda)}</b>
            </span>
            <span className="text-xs text-muted-foreground">
              {pasado ? "Excedido" : "Sobra"}{" "}
              <b className={cn("metric-number", pasado ? "text-danger" : "text-foreground")}>{dinero(Math.abs(t.restanteMicros), moneda)}</b>
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-2 text-[0.68rem] text-muted-foreground">
          {campanas.length} {campanas.length === 1 ? "campaña" : "campañas"}
          <ChevronDown className="size-4 text-foreground/45 transition-transform group-open:rotate-180" />
        </span>
        {t && (
          <div className="basis-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div className={cn("h-full rounded-full", pasado ? "bg-danger" : "bg-brand")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </summary>
      <div className="border-t border-foreground/8 px-3 pb-3">
        {conPresupuesto.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">Ninguna campaña de {platformLabel(proveedor)} tiene presupuesto asignado ni gasto este mes.</p>
        ) : (
          <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-foreground/8 px-2">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead>
                <tr className="font-micro sticky top-0 bg-card text-[0.58rem] text-muted-foreground">
                  <th className="py-1.5 pr-3 font-semibold">CAMPAÑA / CONJUNTO</th>
                  <th className="px-2 font-semibold">PRESUPUESTO</th>
                  <th className="px-2 text-right font-semibold">ASIGNADO</th>
                  <th className="px-2 text-right font-semibold">INVERTIDO</th>
                  <th className="pl-2 text-right font-semibold">SOBRA</th>
                </tr>
              </thead>
              <tbody>
                {[...campanas]
                  .sort((a, b) => (b.presupuestoMicros ?? -1) - (a.presupuestoMicros ?? -1))
                  .filter((c) => c.presupuestoMicros !== null || c.gastadoMicros > 0 || conjuntos.some((j) => j.campaignId === c.id))
                  .flatMap((c) => [
                    <FilaDeEntidad key={`c-${c.id}`} e={c} />,
                    ...conjuntos
                      .filter((j) => j.campaignId === c.id && (j.presupuestoMicros !== null || j.gastadoMicros > 0))
                      .map((j) => <FilaDeEntidad key={`j-${j.id}`} e={j} sangria />),
                  ])}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Lo primero que se quiere saber, sin tablas: cuánto se invirtió en el año, cuánto en este mes y cuánto va sobrando del
 * mes. «Sobra» sale del presupuesto mensual de la ficha si lo hay; si no, de lo que quedó asignado en las campañas.
 */
function ResumenEnTresCifras({ datos, moneda }: { datos: RespuestaDePresupuesto; moneda: string }) {
  const anio = datos.gastadoAnioPorMoneda?.[moneda] ?? null;
  const mes = datos.gastadoMesPorMoneda?.[moneda] ?? 0;
  const delaFicha = datos.presupuesto && datos.moneda === moneda ? datos.presupuesto.restanteMicros : null;
  const deCampanas = datos.campanas?.totales.find((t) => t.moneda === moneda)?.restanteMicros ?? null;
  const sobra = delaFicha ?? deCampanas;
  const origen = delaFicha !== null ? "de tu presupuesto mensual" : deCampanas !== null ? "de lo asignado a las campañas" : "";
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <CifraResumen etiqueta={`Invertido en ${datos.anio ?? "el año"}`} nota="Del 1 de enero a hoy" valor={anio === null ? "—" : dinero(anio, moneda)} />
      <CifraResumen etiqueta="Invertido este mes" nota="Desde el día 1" valor={dinero(mes, moneda)} />
      <CifraResumen
        etiqueta="Sobra para este mes"
        nota={sobra === null ? "Sin presupuesto cargado para calcularlo" : origen}
        valor={sobra === null ? "—" : dinero(Math.max(0, sobra), moneda)}
        destacada
      />
    </div>
  );
}

function CifraResumen({ etiqueta, nota, valor, destacada }: { etiqueta: string; nota: string; valor: string; destacada?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", destacada ? "border-brand/30 bg-brand/5" : "border-foreground/10 bg-foreground/[0.03]")}>
      <p className="text-[0.68rem] font-semibold text-muted-foreground">{etiqueta}</p>
      <p className="metric-number mt-1 text-xl font-extrabold text-foreground">{valor}</p>
      <p className="mt-0.5 text-[0.65rem] leading-4 text-muted-foreground">{nota}</p>
    </div>
  );
}

function BloqueMensual({ p, moneda, otras }: { p: ResumenPresupuesto; moneda: string; otras: string[] }) {
  const estilo = ESTILO[p.estado];
  const gastadoPct = Math.min(100, p.fraccionGastada * 100);
  const esperadoPct = Math.min(100, p.fraccionDelMes * 100);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="font-micro text-[0.62rem] text-muted-foreground">PRESUPUESTO MENSUAL DEL CLIENTE</h4>
          <span className={cn("rounded-full border px-2 py-0.5 text-[0.65rem] font-bold", estilo.chip)}>{ETIQUETA_RITMO[p.estado]}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          Día {p.diasTranscurridos} de {p.diasDelMes}
        </span>
      </div>

      {/* Lo gastado contra lo acordado; la marca es dónde debería ir a estas alturas del mes. */}
      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-foreground/10">
        <div className={cn("h-full rounded-full", estilo.barra)} style={{ width: `${gastadoPct}%` }} />
        <div
          className="absolute inset-y-0 w-0.5 bg-foreground/70"
          style={{ left: `${esperadoPct}%` }}
          title={`Donde debería ir hoy: ${Math.round(esperadoPct)} % del mes`}
        />
      </div>
      <p className="mt-1 text-[0.68rem] text-muted-foreground">
        {Math.round(p.fraccionGastada * 100)} % gastado · la marca indica dónde debería ir hoy ({Math.round(esperadoPct)} %)
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-4">
        <Cifra titulo="Presupuesto" valor={dinero(p.presupuestoMicros, moneda)} />
        <Cifra titulo="Invertido" valor={dinero(p.gastadoMicros, moneda)} />
        <Cifra
          titulo={p.restanteMicros >= 0 ? "Sobra" : "Excedido en"}
          valor={dinero(Math.abs(p.restanteMicros), moneda)}
          alerta={p.restanteMicros < 0}
          nota={p.restanteMicros > 0 ? `${dinero(p.disponibleDiarioMicros, moneda)} por día hasta fin de mes` : undefined}
        />
        <Cifra
          titulo="Proyección a fin de mes"
          valor={dinero(p.proyeccionMicros, moneda)}
          nota={`al ritmo de ${dinero(p.ritmoDiarioMicros, moneda)} por día`}
        />
      </div>
      {otras.length > 0 && (
        <p className="mt-2 text-[0.68rem] text-muted-foreground">
          Solo cuenta el gasto en {moneda}; este cliente también invirtió en {otras.join(", ")}, que no se suma.
        </p>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, nota, alerta }: { titulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="font-micro text-[0.6rem] text-muted-foreground">{titulo}</p>
      <p className={cn("metric-number mt-1 truncate text-lg font-extrabold", alerta ? "text-danger" : "text-foreground")} title={valor}>
        {valor}
      </p>
      {nota && <p className="text-[0.68rem] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Asignado, invertido y lo que sobra, con una barra de cuánto va gastado. */
function FilaDeTotal({ t, compacta = false }: { t: TotalDePresupuesto; compacta?: boolean }) {
  const pct = t.presupuestoMicros > 0 ? Math.min(100, (t.gastadoMicros / t.presupuestoMicros) * 100) : 0;
  const pasado = t.restanteMicros < 0;
  return (
    <div>
      <div className="relative h-2 overflow-hidden rounded-full bg-foreground/10">
        <div className={cn("h-full rounded-full", pasado ? "bg-danger" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
      <div className={cn("mt-1.5 grid gap-x-4 gap-y-1 text-xs", compacta ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-5")}>
        <span className="text-muted-foreground">
          Asignado <b className="metric-number text-foreground">{dinero(t.presupuestoMicros, t.moneda)}</b>
        </span>
        <span className="text-muted-foreground" title="Desde que empezó cada campaña con presupuesto total; en las de presupuesto diario, el del mes.">
          Invertido hasta hoy <b className="metric-number text-foreground">{dinero(t.gastadoMicros, t.moneda)}</b>
        </span>
        <span className="text-muted-foreground" title="Lo gastado solo en el mes en curso, por estas campañas.">
          Este mes <b className="metric-number text-foreground">{dinero(t.gastadoMesMicros, t.moneda)}</b>
        </span>
        <span className="text-muted-foreground">
          {pasado ? "Excedido" : "Sobra"}{" "}
          <b className={cn("metric-number", pasado ? "text-danger" : "text-foreground")}>{dinero(Math.abs(t.restanteMicros), t.moneda)}</b>
        </span>
        {!compacta && (
          <span className="text-muted-foreground">
            {t.entidades} {t.entidades === 1 ? "campaña" : "campañas"} · {t.moneda}
          </span>
        )}
      </div>
    </div>
  );
}

function BarraSimple({ p, moneda }: { p: ResumenPresupuesto; moneda: string }) {
  const estilo = ESTILO[p.estado];
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
        <div className={cn("h-full rounded-full", estilo.barra)} style={{ width: `${Math.min(100, p.fraccionGastada * 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        <b className="metric-number text-foreground">{dinero(p.gastadoMicros, moneda)}</b> de {dinero(p.presupuestoMicros, moneda)} ·{" "}
        {p.restanteMicros >= 0 ? "sobran " : "excedido en "}
        <b className={cn("metric-number", p.restanteMicros < 0 ? "text-danger" : "text-foreground")}>
          {dinero(Math.abs(p.restanteMicros), moneda)}
        </b>
      </p>
    </div>
  );
}

function FilaDeEntidad({ e, sangria = false }: { e: PresupuestoDeEntidad; sangria?: boolean }) {
  const moneda = e.moneda ?? "CLP";
  const tipo = e.tipo === "total" ? "Total" : e.tipo === "diario" ? `Diario ${dinero(e.diarioMicros ?? 0, moneda)}` : "—";
  return (
    <tr className="border-t border-foreground/6" title={e.nota ?? undefined}>
      <td className={cn("max-w-[22rem] truncate py-1.5 pr-3", sangria ? "pl-5 text-foreground/70" : "font-semibold text-foreground")}>
        {sangria && "↳ "}
        {e.nombre ?? e.id}
        {!e.activa && <span className="ml-1.5 text-[0.6rem] font-normal text-foreground/40">{e.estado ?? "inactiva"}</span>}
      </td>
      <td className="px-2 text-muted-foreground">{tipo}</td>
      <td className="metric-number px-2 text-right">{e.presupuestoMicros === null ? "—" : dinero(e.presupuestoMicros, moneda)}</td>
      <td className="metric-number px-2 text-right">{dinero(e.gastadoMicros, moneda)}</td>
      <td className={cn("metric-number pl-2 text-right", e.restanteMicros !== null && e.restanteMicros < 0 && "text-danger")}>
        {e.restanteMicros === null ? "—" : dinero(e.restanteMicros, moneda)}
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Línea corta para otras pantallas                                            */
/* -------------------------------------------------------------------------- */

/**
 * Una línea con lo esencial: cuánto sobra en general (mensual y/o campañas) y por segmento. Para tenerlo a la
 * vista en el Creador, el Simulador y la tabla de Cliente sin ocupar una pantalla entera.
 */
export function PresupuestoEnLinea({ portfolioId, className }: { portfolioId: string; className?: string }) {
  const datos = usePresupuesto(portfolioId);
  if (!datos) return null;
  const partes: string[] = [];
  if (datos.presupuesto && datos.moneda) {
    partes.push(
      `Mes: ${dinero(Math.max(0, datos.presupuesto.restanteMicros), datos.moneda)} de ${dinero(datos.presupuesto.presupuestoMicros, datos.moneda)}${
        datos.presupuesto.restanteMicros < 0 ? " (excedido)" : ""
      }`,
    );
  }
  for (const t of datos.campanas?.totales ?? []) {
    partes.push(`Campañas: sobran ${dinero(Math.max(0, t.restanteMicros), t.moneda)} de ${dinero(t.presupuestoMicros, t.moneda)}`);
  }
  const porSegmento = (datos.segmentos ?? [])
    .map((s) => {
      if (s.presupuestoMensual && s.moneda) return `${s.nombre}: sobran ${dinero(Math.max(0, s.presupuestoMensual.restanteMicros), s.moneda)}`;
      const t = s.totales[0];
      return t ? `${s.nombre}: sobran ${dinero(Math.max(0, t.restanteMicros), t.moneda)}` : null;
    })
    .filter((x): x is string => x !== null);
  if (partes.length === 0 && porSegmento.length === 0) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-foreground/10 bg-foreground/4 px-3 py-2 text-xs text-muted-foreground", className)}>
      <Wallet className="size-3.5 text-brand" />
      <span className="font-semibold text-foreground">Presupuesto restante</span>
      {[...partes, ...porSegmento].map((t) => (
        <span key={t}>{t}</span>
      ))}
    </p>
  );
}
