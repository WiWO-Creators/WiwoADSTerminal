/**
 * Respaldo para escribir en Meta cuando Windsor falla por su cuenta (error 5xx): las mismas acciones, traducidas a la API de Meta.
 * Windsor y Meta usan las mismas unidades (la unidad menor de la moneda; CLP y similares, enteros), así que los parámetros pasan igual.
 * Parte pura, sin red.
 */
export type LlamadaDeMeta = { id: string; params: Record<string, unknown> };

const ID_POR_ACCION: Record<string, string> = {
  update_campaign: "campaign_id",
  update_adset: "adset_id",
  update_ad: "ad_id",
  set_campaign_budget: "campaign_id",
  set_adset_budget: "adset_id",
  pause_campaign: "campaign_id",
  enable_campaign: "campaign_id",
  pause_adset: "adset_id",
  enable_adset: "adset_id",
  pause_ad: "ad_id",
  enable_ad: "ad_id",
};

/** ¿Es un error de Windsor del lado del servidor (no del cambio pedido)? */
export const esFalloDeWindsor = (error: string | null | undefined): boolean =>
  /^Windsor respondió 5\d\d/.test(error ?? "") || /Internal Server Error/i.test(error ?? "");

/** La llamada equivalente a la API de Meta, o `null` si esa acción no tiene traducción segura. */
export function llamadaDeMetaParaAccion(action: string, params: Record<string, unknown>): LlamadaDeMeta | null {
  const claveId = ID_POR_ACCION[action];
  if (!claveId) return null;
  const id = params[claveId];
  if (typeof id !== "string" || !/^\d+$/.test(id)) return null;

  if (action.startsWith("pause_")) return { id, params: { status: "PAUSED" } };
  if (action.startsWith("enable_")) return { id, params: { status: "ACTIVE" } };
  if (action === "set_campaign_budget" || action === "set_adset_budget") {
    const monto = params.amount;
    if (typeof monto !== "number" || !Number.isInteger(monto) || monto <= 0) return null;
    if (params.budget_type === "daily") return { id, params: { daily_budget: monto } };
    if (params.budget_type === "lifetime") return { id, params: { lifetime_budget: monto } };
    return null;
  }

  // update_*: todo igual, con `extra_params` aplanado en el mismo nivel.
  const extra = params.extra_params;
  const salida: Record<string, unknown> = { ...params };
  delete salida[claveId];
  delete salida.extra_params;
  if (extra && typeof extra === "object") Object.assign(salida, extra as Record<string, unknown>);
  for (const k of Object.keys(salida)) if (salida[k] === null || salida[k] === undefined) delete salida[k];
  return Object.keys(salida).length === 0 ? null : { id, params: salida };
}
