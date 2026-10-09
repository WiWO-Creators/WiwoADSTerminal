/**
 * TikTok directo (Marketing API v1.3): la parte pura, sin red ni `env`, para poder probarla sola.
 *
 * SIN VERIFICAR contra la API real: la app «WiwoAds» de TikTok sigue en revisión (Pending), así que todo sale de la
 * documentación oficial (leída el 2026-10-07) y NO de una respuesta real. Cuando haya credenciales y una cuenta
 * sandbox hay que contrastar cada forma antes de confiar en ella, como se hizo con LinkedIn. Todavía no hay código que
 * llame a TikTok: solo constructores de peticiones, validaciones y traducciones.
 */

export const BASE_API = "https://business-api.tiktok.com/open_api/v1.3";
export const BASE_SANDBOX = "https://sandbox-ads.tiktok.com/open_api/v1.3";

export class ErrorDeTiktok extends Error {
  code: number;
  constructor(message: string, code = 0) {
    super(message);
    this.code = code;
  }
}

/** La barra final es obligatoria: sin ella TikTok responde 404. */
export function urlDeApi(endpoint: string, opciones: { sandbox?: boolean; query?: Record<string, string | undefined> } = {}): string {
  const limpio = endpoint.replace(/^\/+/, "").replace(/\/*$/, "/");
  const url = new URL(`${opciones.sandbox ? BASE_SANDBOX : BASE_API}/${limpio}`);
  for (const [k, v] of Object.entries(opciones.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  return url.toString();
}

export function cabecerasDeApi(token: string, conCuerpo = false): Record<string, string> {
  return { "Access-Token": token, ...(conCuerpo ? { "Content-Type": "application/json" } : {}) };
}

/** Canje del `auth_code` (1 hora de vida, un solo uso). El token resultante no vence ni se renueva. */
export function cuerpoCanjeDeCodigo(p: { appId: string; secret: string; authCode: string }) {
  return { app_id: String(p.appId), secret: p.secret, auth_code: p.authCode, return_advertiser_ids: true };
}

/**
 * TikTok responde 200 aunque falle: manda el `code`. 0 es éxito y 20001 éxito parcial. Devuelve `data` o lanza.
 * Nunca incluye secretos en el mensaje.
 */
export function datosDeRespuesta<T = unknown>(cuerpo: unknown): T {
  const r = (cuerpo ?? {}) as { code?: number; message?: string; data?: T };
  if (r.code === 0 || r.code === 20001) return (r.data ?? ({} as T)) as T;
  const code = typeof r.code === "number" ? r.code : -1;
  throw new ErrorDeTiktok(`TikTok respondió ${code}: ${r.message ?? "sin detalle"}${mensajeDeCodigo(code)}`, code);
}

function mensajeDeCodigo(code: number): string {
  if (code === 40102 || code === 40105 || code === 40104) return " (el anunciante debe volver a autorizar la conexión)";
  if (code === 40001) return " (la autorización no incluye este permiso)";
  if (code === 40100 || code === 40016 || code === 40133) return " (límite de peticiones: esperar unos minutos)";
  return "";
}

/** Los ids de v1.3 son siempre texto. */
export function idTexto(id: string | number): string {
  return String(id);
}

/** Cada cuántas ids se puede operar por llamada en los cambios de estado. */
export const MAX_IDS_POR_ESTADO = 20;

export function lotesDe<T>(items: T[], tamano = MAX_IDS_POR_ESTADO): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

// ─── Objetivos de WiWO → TikTok ────────────────────────────────────────────────────────────────────────────────────

export type ObjetivoWiwo = "trafico" | "leads" | "ventas" | "alcance" | "interaccion" | "videos";

export interface ObjetivoTiktok {
  objectiveType: string;
  /** Meta de optimización del grupo y su evento de cobro: la combinación debe ser válida. */
  optimizationGoal: string;
  billingEvent: string;
  /** Hace falta un píxel/evento de conversión en el anunciante. */
  requierePixel: boolean;
}

export const OBJETIVO_TIKTOK: Record<ObjetivoWiwo, ObjetivoTiktok> = {
  trafico: { objectiveType: "TRAFFIC", optimizationGoal: "CLICK", billingEvent: "CPC", requierePixel: false },
  leads: { objectiveType: "LEAD_GENERATION", optimizationGoal: "LEAD_GENERATION", billingEvent: "OCPM", requierePixel: false },
  ventas: { objectiveType: "WEB_CONVERSIONS", optimizationGoal: "CONVERT", billingEvent: "OCPM", requierePixel: true },
  alcance: { objectiveType: "REACH", optimizationGoal: "REACH", billingEvent: "CPM", requierePixel: false },
  interaccion: { objectiveType: "ENGAGEMENT", optimizationGoal: "ENGAGED_VIEW", billingEvent: "CPV", requierePixel: false },
  videos: { objectiveType: "VIDEO_VIEWS", optimizationGoal: "ENGAGED_VIEW", billingEvent: "CPV", requierePixel: false },
};

/** Meta de optimización → evento de cobro permitido (tabla oficial). */
const COBRO_POR_META: Record<string, string> = {
  CLICK: "CPC",
  PAGE_VISIT: "CPC",
  CONVERT: "OCPM",
  INSTALL: "OCPM",
  LEAD_GENERATION: "OCPM",
  VALUE: "OCPM",
  TRAFFIC_LANDING_PAGE_VIEW: "OCPM",
  REACH: "CPM",
  SHOW: "CPM",
  ENGAGED_VIEW: "CPV",
  ENGAGED_VIEW_FIFTEEN: "CPV",
};

export function cobroValidoPara(optimizationGoal: string, billingEvent: string): boolean {
  return COBRO_POR_META[optimizationGoal] === billingEvent;
}

// ─── Presupuesto ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Mínimos por moneda de la tabla por moneda de TikTok. La página «Budget» dice 20 USD para ambos niveles y la tabla
 * dice 50 para campaña: se usa la tabla (más estricta) y el error real de la API manda al final.
 */
export const MINIMO_POR_MONEDA: Record<string, { campana: number; grupo: number }> = {
  USD: { campana: 50, grupo: 20 },
  COP: { campana: 50000, grupo: 20000 },
  CLP: { campana: 50000, grupo: 20000 },
  MXN: { campana: 500, grupo: 200 },
  PEN: { campana: 50, grupo: 20 },
  ARS: { campana: 50, grupo: 20 },
  BRL: { campana: 50, grupo: 20 },
  UYU: { campana: 500, grupo: 200 },
};

/** CLP no admite decimales; el resto, dos. */
export function redondearMonto(monto: number, moneda: string): number {
  return moneda === "CLP" ? Math.round(monto) : Math.round(monto * 100) / 100;
}

export function revisarPresupuesto(p: { monto: number; moneda: string; nivel: "campana" | "grupo" }): string | null {
  if (!Number.isFinite(p.monto) || p.monto <= 0) return "El presupuesto debe ser un número mayor que cero.";
  const minimo = MINIMO_POR_MONEDA[p.moneda]?.[p.nivel];
  if (minimo === undefined) return null; // moneda sin mínimo conocido: que decida la API
  return p.monto < minimo ? `TikTok exige al menos ${minimo} ${p.moneda} a nivel de ${p.nivel === "campana" ? "campaña" : "grupo"}.` : null;
}

/** Subir un presupuesto exige al menos el 105 % del gasto actual de esa campaña o grupo. */
export function revisarSubidaDePresupuesto(p: { nuevo: number; gastado: number }): string | null {
  const minimo = p.gastado * 1.05;
  return p.nuevo < minimo ? `El nuevo presupuesto debe ser al menos ${minimo.toFixed(2)} (105 % de lo gastado).` : null;
}

// ─── Fechas ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Las fechas de los grupos van en UTC+0 como «AAAA-MM-DD HH:MM:SS». */
export function fechaUtc(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** El reporte usa la zona horaria de la cuenta y el formato AAAA-MM-DD. Máximo 30 días si se agrupa por día. */
export function revisarRangoDeReporte(p: { desde: string; hasta: string; porDia: boolean }): string | null {
  const dias = (Date.parse(p.hasta) - Date.parse(p.desde)) / 86_400_000 + 1;
  if (!Number.isFinite(dias) || dias < 1) return "El rango de fechas no es válido.";
  const maximo = p.porDia ? 30 : 365;
  return dias > maximo ? `TikTok limita este reporte a ${maximo} días.` : null;
}

// ─── Constructores de peticiones ───────────────────────────────────────────────────────────────────────────────────

export interface EntradaCampana {
  anunciante: string;
  nombre: string;
  objetivo: ObjetivoWiwo;
  presupuestoDiario: number;
  moneda: string;
  /** Opcional: evita nombres duplicados y da idempotencia de 10 s. */
  requestId?: string;
}

/** Quita emojis, que TikTok rechaza en nombres y textos. */
export function sinEmoji(texto: string): string {
  return texto.replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/\s{2,}/g, " ").trim();
}

export function planDeCampana(e: EntradaCampana): { bloqueos: string[]; cuerpo?: Record<string, unknown> } {
  const bloqueos: string[] = [];
  const nombre = sinEmoji(e.nombre).slice(0, 512);
  if (!nombre) bloqueos.push("La campaña necesita un nombre (sin emojis).");
  const malPresupuesto = revisarPresupuesto({ monto: e.presupuestoDiario, moneda: e.moneda, nivel: "campana" });
  if (malPresupuesto) bloqueos.push(malPresupuesto);
  if (bloqueos.length) return { bloqueos };
  const o = OBJETIVO_TIKTOK[e.objetivo];
  return {
    bloqueos,
    cuerpo: {
      advertiser_id: idTexto(e.anunciante),
      campaign_name: nombre,
      objective_type: o.objectiveType,
      budget_mode: "BUDGET_MODE_DAY",
      budget: redondearMonto(e.presupuestoDiario, e.moneda),
      // Decidido (2026-10-07): en TikTok la campaña nace activa, como en las demás plataformas.
      operation_status: "ENABLE",
      ...(e.requestId ? { request_id: e.requestId } : {}),
    },
  };
}

export interface EntradaGrupo {
  anunciante: string;
  campanaId: string;
  nombre: string;
  objetivo: ObjetivoWiwo;
  presupuestoDiario: number;
  moneda: string;
  inicio: Date;
  fin?: Date;
  /** Ids de ubicación de TikTok (texto), no códigos de país. Se obtienen con /tool/region/. */
  ubicaciones: string[];
  edadMin?: "AGE_18_24" | "AGE_25_34" | "AGE_35_44" | "AGE_45_54" | "AGE_55_100";
  genero?: "GENDER_FEMALE" | "GENDER_MALE" | "GENDER_UNLIMITED";
  urlDestino?: string;
}

export function planDeGrupo(e: EntradaGrupo): { bloqueos: string[]; cuerpo?: Record<string, unknown> } {
  const bloqueos: string[] = [];
  const o = OBJETIVO_TIKTOK[e.objetivo];
  if (!cobroValidoPara(o.optimizationGoal, o.billingEvent)) bloqueos.push("La meta de optimización y el evento de cobro no combinan.");
  if (!sinEmoji(e.nombre)) bloqueos.push("El grupo necesita un nombre.");
  if (!e.ubicaciones.length) bloqueos.push("Falta al menos una ubicación (id de TikTok).");
  const malPresupuesto = revisarPresupuesto({ monto: e.presupuestoDiario, moneda: e.moneda, nivel: "grupo" });
  if (malPresupuesto) bloqueos.push(malPresupuesto);
  if (e.fin && e.fin <= e.inicio) bloqueos.push("La fecha de fin debe ser posterior a la de inicio.");
  if (bloqueos.length) return { bloqueos };
  return {
    bloqueos,
    cuerpo: {
      advertiser_id: idTexto(e.anunciante),
      campaign_id: idTexto(e.campanaId),
      adgroup_name: sinEmoji(e.nombre),
      ...(e.objetivo === "alcance" || e.objetivo === "videos" || e.objetivo === "interaccion" ? {} : { promotion_type: "WEBSITE" }),
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: e.ubicaciones.map(idTexto),
      gender: e.genero ?? "GENDER_UNLIMITED",
      ...(e.edadMin ? { age_groups: [e.edadMin] } : {}),
      budget_mode: "BUDGET_MODE_DAY",
      budget: redondearMonto(e.presupuestoDiario, e.moneda),
      schedule_type: e.fin ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW",
      schedule_start_time: fechaUtc(e.inicio),
      ...(e.fin ? { schedule_end_time: fechaUtc(e.fin) } : {}),
      optimization_goal: o.optimizationGoal,
      billing_event: o.billingEvent,
      bid_type: "BID_TYPE_NO_BID",
      pacing: "PACING_MODE_SMOOTH",
      operation_status: "ENABLE",
    },
  };
}

export type CambioTiktok = { nombre?: string; presupuesto?: number; estado?: "ACTIVAR" | "PAUSAR" };

/** Edición de una campaña: nombre y presupuesto van a /campaign/update/; el estado, a /campaign/status/update/. */
export function planDeEdicionDeCampana(p: { anunciante: string; campanaId: string; moneda: string; gastado?: number; cambio: CambioTiktok }) {
  const bloqueos: string[] = [];
  const pasos: { ruta: string; cuerpo: Record<string, unknown> }[] = [];
  const base = { advertiser_id: idTexto(p.anunciante) };
  if (p.cambio.nombre !== undefined || p.cambio.presupuesto !== undefined) {
    const cuerpo: Record<string, unknown> = { ...base, campaign_id: idTexto(p.campanaId) };
    if (p.cambio.nombre !== undefined) cuerpo.campaign_name = sinEmoji(p.cambio.nombre).slice(0, 512);
    if (p.cambio.presupuesto !== undefined) {
      const mal = revisarPresupuesto({ monto: p.cambio.presupuesto, moneda: p.moneda, nivel: "campana" });
      if (mal) bloqueos.push(mal);
      if (p.gastado !== undefined) {
        const sube = revisarSubidaDePresupuesto({ nuevo: p.cambio.presupuesto, gastado: p.gastado });
        if (sube) bloqueos.push(sube);
      }
      cuerpo.budget = redondearMonto(p.cambio.presupuesto, p.moneda);
    }
    pasos.push({ ruta: "campaign/update/", cuerpo });
  }
  if (p.cambio.estado) {
    // El parámetro real es `operation_status` (el ejemplo de la documentación usa `opt_status` por error).
    pasos.push({ ruta: "campaign/status/update/", cuerpo: { ...base, campaign_ids: [idTexto(p.campanaId)], operation_status: p.cambio.estado === "ACTIVAR" ? "ENABLE" : "DISABLE" } });
  }
  return { bloqueos, pasos: bloqueos.length ? [] : pasos };
}

/** Reporte diario por campaña con los nombres de métrica que usa el resto de la app. */
export function queryDeReporte(p: { anunciante: string; desde: string; hasta: string; nivel?: "campana" | "grupo" | "anuncio" }): Record<string, string> {
  const nivel = p.nivel === "grupo" ? "AUCTION_ADGROUP" : p.nivel === "anuncio" ? "AUCTION_AD" : "AUCTION_CAMPAIGN";
  const dimension = p.nivel === "grupo" ? "adgroup_id" : p.nivel === "anuncio" ? "ad_id" : "campaign_id";
  return {
    advertiser_id: idTexto(p.anunciante),
    report_type: "BASIC",
    data_level: nivel,
    dimensions: JSON.stringify([dimension, "stat_time_day"]),
    metrics: JSON.stringify(["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "reach", "conversion", "campaign_name", "adgroup_name", "currency"]),
    start_date: p.desde,
    end_date: p.hasta,
    page_size: "1000",
  };
}

/** Todas las métricas llegan como texto, en la moneda de la cuenta (no hay micros). */
export function numeroDeMetrica(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}
