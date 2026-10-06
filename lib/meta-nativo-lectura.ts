/**
 * Lectura de Meta por la API directa para las cuentas que Windsor NO entrega (Agencia Palta, SQM Perú, SQM Ecuador…).
 * Devuelve las mismas formas que Windsor (`WindsorAccountDaily`, `WindsorCampaign`, `WindsorAd`) para que el resto de la
 * app no note la diferencia. Solo cuentas asociadas a un cliente; las que Windsor ya lee no se tocan (sin duplicados).
 * Falla sin romper: si Meta no responde, esas cuentas quedan sin datos, igual que antes.
 */
import { getRawDb } from "@/db";
import { graphJson, metaNativoConfigurado } from "@/lib/meta-nativo";
import type { WindsorAccountDaily, WindsorAd, WindsorCampaign } from "@/lib/windsor";

const TTL_MS = 10 * 60 * 1000;
const SIN_DECIMALES = new Set(["CLP", "COP", "CRC", "HUF", "IDR", "ISK", "JPY", "KRW", "PYG", "TWD", "VND"]);

type Fila = Record<string, unknown>;
type Accion = { action_type: string; value: string };

/** Todas las páginas de una lista de Meta (con el token que vea la cuenta). */
async function graphGet(ruta: string, params: Record<string, string>): Promise<Fila[]> {
  const salida: Fila[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < 20; pagina++) {
    const j: { data?: Fila[]; paging?: { cursors?: { after?: string }; next?: string } } = await graphJson(ruta, "GET", cursor ? { ...params, after: cursor } : params);
    salida.push(...(j.data ?? []));
    cursor = j.paging?.next ? (j.paging.cursors?.after ?? null) : null;
    if (!cursor) break;
  }
  return salida;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const micros = (v: unknown): number => Math.round(num(v) * 1_000_000);
const accion = (filas: unknown, ...tipos: string[]): number | null => {
  if (!Array.isArray(filas)) return null;
  for (const t of tipos) {
    const f = (filas as Accion[]).find((a) => a.action_type === t);
    if (f) return num(f.value);
  }
  return null;
};
/** Presupuesto de Meta (unidad menor de la moneda) → micros. */
const presupuestoMicros = (v: unknown, moneda: string | null): number | null => {
  if (v === undefined || v === null || v === "" || Number(v) === 0) return null;
  return Math.round((num(v) / (moneda && SIN_DECIMALES.has(moneda) ? 1 : 100)) * 1_000_000);
};

const CAMPOS_INSIGHT = "spend,impressions,clicks,reach,inline_link_clicks,actions,action_values";

export type ParteDeLectura = "diarias" | "campanas" | "anuncios";
type Resultado = { diarias: WindsorAccountDaily[]; campanas: WindsorCampaign[]; anuncios: WindsorAd[] };

async function cuentasNativasPendientes(conocidas: Set<string>): Promise<string[]> {
  if (!metaNativoConfigurado()) return [];
  const { results } = await getRawDb().prepare("SELECT external_id FROM portfolio_accounts WHERE provider = 'meta'").all<{ external_id: string }>();
  return (results ?? []).map((r) => r.external_id).filter((id) => !conocidas.has(id));
}

async function leerCuenta(id: string, desde: string, hasta: string, parte: ParteDeLectura): Promise<Resultado> {
  const act = `act_${id}`;
  const rango = JSON.stringify({ since: desde, until: hasta });
  // Un nodo (la cuenta) devuelve el objeto y no `data`: se pide aparte.
  const nodo = await graphJson<{ name?: string; currency?: string }>(act, "GET", { fields: "name,currency" });
  const nombre = nodo.name ?? id;
  const moneda = nodo.currency ?? null;

  // Solo la parte pedida: Meta limita las peticiones y el histórico mensual no necesita campañas ni anuncios.
  const vacia: Fila[] = [];
  const [dias, campanasIns, anunciosIns, campanasInfo, anunciosInfo] = await Promise.all([
    parte === "diarias" ? graphGet(`${act}/insights`, { fields: CAMPOS_INSIGHT, time_increment: "1", time_range: rango, level: "account", limit: "100" }) : vacia,
    parte === "campanas" ? graphGet(`${act}/insights`, { fields: `campaign_id,campaign_name,${CAMPOS_INSIGHT}`, time_range: rango, level: "campaign", limit: "200" }) : vacia,
    parte === "anuncios" ? graphGet(`${act}/insights`, { fields: `campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,${CAMPOS_INSIGHT}`, time_range: rango, level: "ad", limit: "300" }) : vacia,
    parte === "campanas" ? graphGet(`${act}/campaigns`, { fields: "id,name,effective_status,objective,daily_budget", limit: "300" }) : vacia,
    parte === "anuncios" ? graphGet(`${act}/ads`, { fields: "id,name,effective_status,adset_id,campaign_id", limit: "500" }) : vacia,
  ]);

  const diarias: WindsorAccountDaily[] = dias.map((d) => ({
    provider: "meta",
    accountId: id,
    accountName: nombre,
    currency: moneda,
    date: String(d.date_start),
    spendMicros: micros(d.spend),
    clicks: num(d.clicks),
    impressions: num(d.impressions),
    reach: d.reach !== undefined ? num(d.reach) : null,
    linkClicks: d.inline_link_clicks !== undefined ? num(d.inline_link_clicks) : null,
    engagement: accion(d.actions, "post_engagement"),
    leads: accion(d.actions, "lead", "onsite_conversion.lead_grouped"),
    purchases: accion(d.actions, "omni_purchase", "purchase"),
    conversations: accion(d.actions, "onsite_conversion.messaging_conversation_started_7d"),
    conversions: accion(d.actions, "omni_purchase", "purchase", "lead", "onsite_conversion.lead_grouped"),
    conversionValueMicros: (() => {
      const v = accion(d.action_values, "omni_purchase", "purchase");
      return v === null ? null : Math.round(v * 1_000_000);
    })(),
  }));

  const campanas: WindsorCampaign[] = campanasInfo.map((c) => {
    const ins = campanasIns.find((i) => String(i.campaign_id) === String(c.id));
    return {
      provider: "meta",
      accountId: id,
      accountName: nombre,
      currency: moneda,
      name: String(c.name),
      campaignId: String(c.id),
      status: (c.effective_status as string) ?? null,
      nativeObjective: (c.objective as string) ?? null,
      reach: ins ? num(ins.reach) : null,
      linkClicks: ins ? num(ins.inline_link_clicks) : null,
      engagement: ins ? accion(ins.actions, "post_engagement") : null,
      leads: ins ? accion(ins.actions, "lead", "onsite_conversion.lead_grouped") : null,
      purchases: ins ? accion(ins.actions, "omni_purchase", "purchase") : null,
      spendMicros: ins ? micros(ins.spend) : 0,
      clicks: ins ? num(ins.clicks) : 0,
      impressions: ins ? num(ins.impressions) : 0,
      conversions: ins ? accion(ins.actions, "omni_purchase", "purchase", "lead", "onsite_conversion.lead_grouped") : null,
      conversionValueMicros: ins && accion(ins.action_values, "omni_purchase", "purchase") !== null ? Math.round((accion(ins.action_values, "omni_purchase", "purchase") ?? 0) * 1_000_000) : null,
      conActividad: Boolean(ins),
      dailyBudgetMicros: presupuestoMicros(c.daily_budget, moneda),
    };
  });

  const infoAnuncio = new Map(anunciosInfo.map((a) => [String(a.id), a]));
  const anuncios: WindsorAd[] = anunciosIns.map((i) => {
    const a = infoAnuncio.get(String(i.ad_id));
    return {
      provider: "meta",
      accountId: id,
      accountName: nombre,
      currency: moneda,
      campaignName: String(i.campaign_name ?? ""),
      campaignId: i.campaign_id ? String(i.campaign_id) : null,
      adsetName: i.adset_name ? String(i.adset_name) : null,
      adsetId: i.adset_id ? String(i.adset_id) : null,
      adName: i.ad_name ? String(i.ad_name) : null,
      adId: i.ad_id ? String(i.ad_id) : null,
      status: (a?.effective_status as string) ?? null,
      spendMicros: micros(i.spend),
      impressions: num(i.impressions),
      clicks: num(i.clicks),
      reach: i.reach !== undefined ? num(i.reach) : null,
      linkClicks: i.inline_link_clicks !== undefined ? num(i.inline_link_clicks) : null,
      engagement: accion(i.actions, "post_engagement"),
      leads: accion(i.actions, "lead", "onsite_conversion.lead_grouped"),
      purchases: accion(i.actions, "omni_purchase", "purchase"),
      conversions: accion(i.actions, "omni_purchase", "purchase", "lead", "onsite_conversion.lead_grouped"),
      purchaseValue: accion(i.action_values, "omni_purchase", "purchase"),
      landingPageViews: accion(i.actions, "landing_page_view"),
      thruplays: null,
      videoViews: accion(i.actions, "video_view"),
      qualityRanking: null,
      engagementRateRanking: null,
      conversionRateRanking: null,
      optimizationScore: null,
      message: null,
      headline: null,
      destinationUrl: null,
      conActividad: true,
    };
  });
  return { diarias, campanas, anuncios };
}

/** Lee (con caché de 10 minutos) lo de las cuentas de Meta que Windsor no conoce. */
export async function metaNativoFaltante(conocidas: Set<string>, desde: string, hasta: string, parte: ParteDeLectura): Promise<Resultado> {
  const vacio: Resultado = { diarias: [], campanas: [], anuncios: [] };
  try {
    const cuentas = await cuentasNativasPendientes(conocidas);
    if (cuentas.length === 0) return vacio;
    const total: Resultado = { diarias: [], campanas: [], anuncios: [] };
    const db = getRawDb();
    for (const id of cuentas) {
      const clave = `meta_nativo_v2:${parte}:${id}:${desde}:${hasta}`;
      const guardado = await db.prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1").bind(clave).first<{ value: string; updated_at: number }>();
      let datos: Resultado;
      if (guardado && Date.now() - Number(guardado.updated_at) < TTL_MS) {
        datos = JSON.parse(guardado.value) as Resultado;
      } else {
        try {
          datos = await leerCuenta(id, desde, hasta, parte);
          // D1 rechaza valores de más de ~1 MB: si no cabe, se sirve sin guardar.
          const texto = JSON.stringify(datos);
          if (texto.length < 900_000) {
            await db.prepare("INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(clave, texto, Date.now()).run();
          }
        } catch (error) {
          console.error("WiWO.ADS lectura directa de Meta", id, error instanceof Error ? error.message : error);
          continue;
        }
      }
      total.diarias.push(...datos.diarias);
      total.campanas.push(...datos.campanas);
      total.anuncios.push(...datos.anuncios);
    }
    return total;
  } catch (error) {
    console.error("WiWO.ADS lectura directa de Meta", error instanceof Error ? error.message : error);
    return vacio;
  }
}
