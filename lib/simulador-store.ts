/**
 * Arma el historial de un cliente para el simulador: lo que rindió cada
 * plataforma y objetivo en los últimos 90 días. Solo lectura, acotado al
 * alcance de quien pregunta. La proyección en sí es pura (`lib/simulador.ts`).
 */
import { canalDeGoogle, canalDeMeta } from "@/lib/canales";
import { OBJETIVOS, objetivoDeNombre, summarizeObjectives } from "@/lib/objetivos";
import { enAlcance, type Actor } from "@/lib/permisos";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { ACTIVE_PLATFORMS } from "@/lib/plataformas";
import { resolverRango } from "@/lib/rangos";
import type { FilaHistorial, Historial } from "@/lib/simulador";
import { requestWindsorConnector } from "@/lib/windsor";

export class ErrorDeSimulador extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const DIA_MS = 86_400_000;

type Fila = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Qué métrica es el «resultado» de cada objetivo en Meta (las de desglose, sin «omni»). */
const RESULTADO_META: Record<string, string | null> = {
  AE: "actions_post_engagement",
  TRF: "actions_link_click",
  LDS: "actions_lead",
  VTA: "actions_purchase",
  OCV: null,
};

const ETIQUETA_RESULTADO: Record<string, string> = {
  AE: "Interacciones",
  TRF: "Clics al enlace",
  LDS: "Leads",
  VTA: "Compras",
  OCV: "Conversiones",
};

type Acumulado = {
  provider: string;
  canal: string;
  objetivo: string;
  gastoMicros: number;
  impresiones: number;
  clics: number;
  resultados: number | null;
  campanas: Map<string, { gastoMicros: number; resultados: number | null }>;
};

/**
 * Rendimiento por CANAL (Instagram, Facebook, Threads… en Meta; Búsqueda,
 * Display, YouTube en Google) a partir del desglose de Windsor por campaña. El
 * objetivo sale de la sigla del nombre de la campaña, como en el resto de la app.
 * Si la lectura falla, el simulador sigue con el promedio de cada plataforma.
 */
async function filasPorCanal(
  provider: "meta" | "google",
  accountId: string,
  desde: string,
  hasta: string,
): Promise<Acumulado[]> {
  const meta = provider === "meta";
  const filas = (await requestWindsorConnector(
    meta ? "facebook" : "google_ads",
    meta
      ? ["account_id", "campaign_name", "publisher_platform", "spend", "impressions", "clicks", "actions_link_click", "actions_post_engagement", "actions_lead", "actions_purchase"]
      : ["account_id", "campaign_name", "ad_network_type", "cost", "impressions", "clicks"],
    desde,
    hasta,
    { selectAccounts: accountId, timeoutMs: 90_000 },
  )) as Fila[];

  const acumulados = new Map<string, Acumulado>();
  for (const f of filas) {
    const campana = typeof f.campaign_name === "string" ? f.campaign_name : "";
    const objetivo = objetivoDeNombre(campana);
    const canal = meta ? canalDeMeta(f.publisher_platform) : canalDeGoogle(f.ad_network_type);
    if (!objetivo || !canal) continue;
    const gasto = Math.round(num(meta ? f.spend : f.cost) * 1_000_000);
    if (gasto <= 0) continue;
    // Google no entrega aquí conversiones limpias por red: sin resultado, solo impresiones y clics.
    const campoResultado = meta ? RESULTADO_META[objetivo] : null;
    const resultado = campoResultado ? num(f[campoResultado]) : null;

    const clave = `${canal}|${objetivo}`;
    const a = acumulados.get(clave) ?? {
      provider, canal, objetivo, gastoMicros: 0, impresiones: 0, clics: 0, resultados: null, campanas: new Map(),
    };
    a.gastoMicros += gasto;
    a.impresiones += num(f.impressions);
    a.clics += num(f.clicks);
    if (resultado !== null) a.resultados = (a.resultados ?? 0) + resultado;
    const c = a.campanas.get(campana) ?? { gastoMicros: 0, resultados: null };
    c.gastoMicros += gasto;
    if (resultado !== null) c.resultados = (c.resultados ?? 0) + resultado;
    a.campanas.set(campana, c);
    acumulados.set(clave, a);
  }
  return [...acumulados.values()];
}

export async function historialDelCliente(actor: Actor, portfolioId: string): Promise<Historial | null> {
  if (!enAlcance(actor, portfolioId)) throw new ErrorDeSimulador("Ese cliente no está en tu alcance", 403);
  const ahora = new Date();
  const snap = await getPerformanceSnapshot(actor, ahora, {
    incluirCampanas: true,
    incluirAnuncios: false,
    rango: "ultimos_90",
  });
  const cliente = snap.portfolios.find((p) => p.id === portfolioId);
  if (!cliente) return null;
  const cuentas = new Set(cliente.accounts.map((a) => a.id));
  const delCliente = snap.campaigns.filter((c) => cuentas.has(c.accountKey) && c.conActividad && c.spendMicros > 0);
  if (delCliente.length === 0) return null;

  // Una sola moneda: sumar pesos con dólares no significa nada.
  const porMoneda = new Map<string, number>();
  for (const c of delCliente) porMoneda.set(c.currency ?? "N/D", (porMoneda.get(c.currency ?? "N/D") ?? 0) + c.spendMicros);
  const moneda = [...porMoneda.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const enMoneda = delCliente.filter((c) => (c.currency ?? "N/D") === moneda);

  const rango = resolverRango("ultimos_90", ahora);
  const dias = Math.max(
    1,
    Math.round((new Date(`${rango.hasta}T00:00:00Z`).getTime() - new Date(`${rango.desde}T00:00:00Z`).getTime()) / DIA_MS) + 1,
  );

  const filas: FilaHistorial[] = [];
  for (const provider of ACTIVE_PLATFORMS) {
    const deLaPlataforma = enMoneda.filter((c) => c.provider === provider);
    if (deLaPlataforma.length === 0) continue;
    for (const objetivo of OBJETIVOS) {
      const campanas = deLaPlataforma.filter((c) => c.objetivo === objetivo);
      const total = summarizeObjectives(campanas).find((o) => o.objetivo === objetivo);
      if (!total) continue;
      filas.push({
        provider,
        objetivo,
        gastoMicros: total.currencyTotals.find((t) => t.currency === moneda)?.spendMicros ?? 0,
        impresiones: total.impressions,
        clics: total.clicks,
        resultados: total.result,
        etiquetaResultado: total.resultLabel,
        // Cada campaña por separado: de ahí sale cuánto varía el costo por resultado.
        campanas: campanas.map((c) => ({
          gastoMicros: c.spendMicros,
          resultados: summarizeObjectives([c]).find((o) => o.objetivo === objetivo)?.result ?? null,
        })),
      });
    }
  }
  // Por canal: una lectura por cuenta (solo las de la moneda elegida), en paralelo.
  const cuentasPorCanal = new Map<string, "meta" | "google">();
  for (const c of enMoneda) {
    if (c.provider === "meta" || c.provider === "google") cuentasPorCanal.set(`${c.provider}|${c.accountId}`, c.provider);
  }
  const lecturas = await Promise.all(
    [...cuentasPorCanal.entries()].map(([clave, provider]) =>
      filasPorCanal(provider, clave.split("|")[1], rango.desde, rango.hasta).catch((error) => {
        console.error("WiWO.ADS simulador: lectura por canal", provider, error);
        return [] as Acumulado[];
      }),
    ),
  );
  // Misma plataforma, canal y objetivo en varias cuentas: se suman.
  const unidos = new Map<string, Acumulado>();
  for (const a of lecturas.flat()) {
    const clave = `${a.provider}|${a.canal}|${a.objetivo}`;
    const u = unidos.get(clave);
    if (!u) {
      unidos.set(clave, { ...a, campanas: new Map(a.campanas) });
      continue;
    }
    u.gastoMicros += a.gastoMicros;
    u.impresiones += a.impresiones;
    u.clics += a.clics;
    if (a.resultados !== null) u.resultados = (u.resultados ?? 0) + a.resultados;
    for (const [nombre, c] of a.campanas) u.campanas.set(`${nombre}#${u.campanas.size}`, c);
  }
  // Los resultados por canal solo valen si, sumados, se parecen al total de la plataforma. En Meta
  // las interacciones por red se repiten entre sí (Colbún: 4,4 veces el total): ahí se descartan.
  const totalPlataforma = new Map<string, number | null>(
    filas.filter((f) => !f.canal).map((f) => [`${f.provider}|${f.objetivo}`, f.resultados]),
  );
  const sumaCanales = new Map<string, number>();
  for (const a of unidos.values()) {
    const k = `${a.provider}|${a.objetivo}`;
    sumaCanales.set(k, (sumaCanales.get(k) ?? 0) + (a.resultados ?? 0));
  }
  const resultadosConfiables = (a: Acumulado): boolean => {
    const k = `${a.provider}|${a.objetivo}`;
    const total = totalPlataforma.get(k);
    const suma = sumaCanales.get(k) ?? 0;
    return a.resultados !== null && total !== null && total !== undefined && total > 0 && Math.abs(suma / total - 1) <= 0.25;
  };

  for (const a of unidos.values()) {
    const confiable = resultadosConfiables(a);
    filas.push({
      provider: a.provider,
      canal: a.canal,
      objetivo: a.objetivo,
      gastoMicros: a.gastoMicros,
      impresiones: a.impresiones,
      clics: a.clics,
      resultados: confiable ? a.resultados : null,
      etiquetaResultado: ETIQUETA_RESULTADO[a.objetivo] ?? "Resultados",
      campanas: [...a.campanas.values()].map((c) => (confiable ? c : { ...c, resultados: null })),
    });
  }

  return { moneda, dias, filas };
}
