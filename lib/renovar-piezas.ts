import { rankear } from "@/lib/mejores-peores-pura";
import { graphJson, metaNativoConfigurado } from "@/lib/meta-nativo";
import { objetivoDeNombre } from "@/lib/objetivos";

/**
 * Renovar piezas: cuando se suben contenidos nuevos a un conjunto, las piezas viejas se pueden retirar (pausar) para que el conjunto
 * no se sature de anuncios. Solo Meta. Pausar no borra nada: se reactiva cuando se quiera.
 */
export type PiezaDeConjunto = {
  id: string;
  nombre: string;
  estado: string;
  /** Días desde que se creó. */
  dias: number | null;
  impresiones: number;
  /** CTR de los últimos 30 días, en %; `null` si no tuvo impresiones. */
  ctr: number | null;
};

const ahora = () => Date.now();

/** Los anuncios ACTIVOS de un conjunto, de más viejo a más nuevo, con su rendimiento de 30 días. Solo lectura. */
export async function piezasDelConjunto(conjuntoId: string): Promise<PiezaDeConjunto[]> {
  if (!metaNativoConfigurado() || !/^\d+$/.test(conjuntoId)) return [];
  const j = await graphJson<{
    data?: Array<{
      id: string;
      name?: string;
      effective_status?: string;
      created_time?: string;
      insights?: { data?: Array<{ impressions?: string; ctr?: string }> };
    }>;
  }>(`${conjuntoId}/ads`, "GET", {
    fields: "name,effective_status,created_time,insights.date_preset(last_30d){impressions,ctr}",
    limit: 50,
  });
  return (j.data ?? [])
    .filter((a) => a.effective_status === "ACTIVE")
    .map((a) => {
      const i = a.insights?.data?.[0];
      const impresiones = Number(i?.impressions ?? 0);
      const t = a.created_time ? Date.parse(a.created_time) : NaN;
      return {
        id: String(a.id),
        nombre: a.name ?? String(a.id),
        estado: a.effective_status ?? "",
        dias: Number.isFinite(t) ? Math.floor((ahora() - t) / 86_400_000) : null,
        impresiones,
        ctr: impresiones > 0 && i?.ctr !== undefined ? Number(Number(i.ctr).toFixed(2)) : null,
      };
    })
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
}

/** Solo se retiran anuncios que de verdad están activos en ESE conjunto: cualquier otro id se descarta. */
export async function validarRetiradas(conjuntoId: string, ids: string[]): Promise<{ validas: Array<{ id: string; nombre: string }>; descartadas: string[] }> {
  const piezas = await piezasDelConjunto(conjuntoId);
  const mapa = new Map(piezas.map((p) => [p.id, p]));
  const validas: Array<{ id: string; nombre: string }> = [];
  const descartadas: string[] = [];
  for (const id of [...new Set(ids.map(String))]) {
    const p = mapa.get(id);
    if (p) validas.push({ id: p.id, nombre: p.nombre });
    else descartadas.push(id);
  }
  return { validas, descartadas };
}

const soloCuenta = (id: string) => id.replace(/^act_/, "");

/** El conjunto pertenece a alguna de esas cuentas de Meta (se lee de Meta, no se confía en lo que manda el navegador). */
export async function conjuntoEsDeLasCuentas(conjuntoId: string, cuentas: string[]): Promise<boolean> {
  if (!metaNativoConfigurado() || !/^\d+$/.test(conjuntoId)) return false;
  try {
    const j = await graphJson<{ account_id?: string }>(conjuntoId, "GET", { fields: "account_id" });
    return Boolean(j.account_id) && cuentas.some((c) => soloCuenta(c) === soloCuenta(String(j.account_id)));
  } catch {
    return false;
  }
}

/** El borrador del Constructor: los anuncios a retirar, validados contra Meta (solo activos del conjunto elegido). */
export async function cargarRetiradas(
  draft: { existingAdset: { adsetId: string } | null; existingCampaign: { platform: string } | null; retirarAnuncios: Array<{ id: string }> },
  cuentasDelCliente: Array<{ provider: string; externalId: string }>,
): Promise<Array<{ id: string; nombre: string }>> {
  if (!draft.existingAdset || draft.existingCampaign?.platform !== "meta" || draft.retirarAnuncios.length === 0) return [];
  // El conjunto tiene que ser de una cuenta de ESTE cliente: el id lo manda el navegador.
  if (!(await conjuntoEsDeLasCuentas(draft.existingAdset.adsetId, cuentasDelCliente.filter((c) => c.provider === "meta").map((c) => c.externalId)))) return [];
  const v = await validarRetiradas(draft.existingAdset.adsetId, draft.retirarAnuncios.map((r) => r.id)).catch(() => ({ validas: [] as Array<{ id: string; nombre: string }> }));
  return v.validas;
}

/** Pausa esos anuncios de Meta (uno a uno; un fallo no frena a los demás) y lo lee de vuelta. */
export async function retirarPiezasMeta(piezas: Array<{ id: string; nombre: string }>): Promise<Array<{ id: string; nombre: string; ok: boolean; error: string | null }>> {
  const salida: Array<{ id: string; nombre: string; ok: boolean; error: string | null }> = [];
  for (const p of piezas) {
    try {
      await graphJson(p.id, "POST", { status: "PAUSED" });
      const despues = await graphJson<{ status?: string }>(p.id, "GET", { fields: "status" });
      const ok = despues.status === "PAUSED";
      salida.push({ ...p, ok, error: ok ? null : `Meta lo dejó en ${despues.status ?? "otro estado"}.` });
    } catch (error) {
      salida.push({ ...p, ok: false, error: error instanceof Error ? error.message : "No se pudo pausar." });
    }
  }
  return salida;
}

/* -------------------------------------------------------------------------- */
/* Qué reemplazar: los anuncios de peor rendimiento de una campaña             */
/* -------------------------------------------------------------------------- */

export type PiezaParaReemplazar = {
  id: string;
  nombre: string;
  conjunto: string | null;
  conjuntoId: string | null;
  dias: number | null;
  gasto: number;
  impresiones: number;
  ctr: number | null;
  /** Por qué conviene reemplazarla (o, si no hay con qué comparar, por qué se propone). */
  porQue: string;
};

type AnuncioDeMeta = {
  id: string;
  name?: string;
  effective_status?: string;
  created_time?: string;
  adset?: { id?: string; name?: string };
  insights?: { data?: Array<{ spend?: string; impressions?: string; clicks?: string; inline_link_clicks?: string; ctr?: string; actions?: Array<{ action_type: string; value: string }> }> };
};

const accion = (i: NonNullable<AnuncioDeMeta["insights"]>["data"] extends Array<infer U> | undefined ? U : never, tipo: string) =>
  Number((i.actions ?? []).find((a) => a.action_type === tipo)?.value ?? 0);

/**
 * Los 3 anuncios ACTIVOS de una campaña de Meta que peor rinden, con el porqué, para decidir cuáles reemplazar al subir contenido
 * nuevo. Se compara con los demás anuncios de la misma campaña (mismo objetivo y moneda) por costo por resultado, o por CTR si el
 * objetivo no trae resultado. Con menos de 2 anuncios comparables se propone retirar los más viejos y se dice así. Solo lectura.
 */
export async function peoresPiezasDeCampana(campaignId: string, nombreDeCampana: string, moneda: string | null): Promise<{ piezas: PiezaParaReemplazar[]; total: number; comparado: boolean }> {
  if (!metaNativoConfigurado() || !/^\d+$/.test(campaignId)) return { piezas: [], total: 0, comparado: false };
  const j = await graphJson<{ data?: AnuncioDeMeta[] }>(`${campaignId}/ads`, "GET", {
    fields: "name,effective_status,created_time,adset{id,name},insights.date_preset(last_30d){spend,impressions,clicks,inline_link_clicks,ctr,actions}",
    limit: 100,
  });
  const activos = (j.data ?? []).filter((a) => a.effective_status === "ACTIVE");
  const objetivo = objetivoDeNombre(nombreDeCampana);
  const filas = activos.map((a) => {
    const i = a.insights?.data?.[0];
    const impresiones = Number(i?.impressions ?? 0);
    const t = a.created_time ? Date.parse(a.created_time) : NaN;
    const resultado = !i ? null : objetivo === "AE" ? accion(i, "post_engagement") : objetivo === "TRF" ? Number(i.inline_link_clicks ?? 0) : objetivo === "LDS" ? accion(i, "lead") : objetivo === "VTA" ? accion(i, "purchase") : null;
    return {
      pieza: { id: String(a.id), nombre: (a.name ?? String(a.id)).split("|")[0].trim() || String(a.id), conjunto: a.adset?.name ?? null, conjuntoId: a.adset?.id ? String(a.adset.id) : null, dias: Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : null, gasto: Number(i?.spend ?? 0), impresiones, ctr: impresiones > 0 && i?.ctr !== undefined ? Number(Number(i.ctr).toFixed(2)) : null },
      entrada: {
        tipo: "anuncio" as const, id: String(a.id), nombre: a.name ?? String(a.id), campana: nombreDeCampana, cuenta: "", provider: "meta", objetivo,
        moneda, familia: null, gasto: Number(i?.spend ?? 0), impresiones, clics: Number(i?.clicks ?? 0), resultado, miniatura: null, boton: null,
        calidad: null, interaccion: null, conversion: null,
      },
    };
  });
  const rank = rankear(filas.map((f) => f.entrada), 3);
  const porId = new Map(filas.map((f) => [f.pieza.id, f.pieza]));
  const peores: PiezaParaReemplazar[] = rank.peores.map((p) => ({ ...(porId.get(p.id) as Omit<PiezaParaReemplazar, "porQue">), porQue: p.porQue }));
  // Si no hay 3 que rindan claramente peor, se completa con los más viejos (la saturación viene de la antigüedad, que es lo que dice la decisión) y se dice por qué.
  const yaEstan = new Set(peores.map((p) => p.id));
  const ctrDe = (p: { ctr: number | null }) => (p.ctr !== null ? `, CTR ${p.ctr.toLocaleString("es-CL")} %` : "");
  const relleno = [...filas]
    .filter((f) => !yaEstan.has(f.pieza.id))
    .sort((a, b) => (b.pieza.dias ?? 0) - (a.pieza.dias ?? 0))
    .slice(0, 3 - peores.length)
    .map((f) => ({
      ...f.pieza,
      porQue: (peores.length > 0 ? "No rinde claramente peor que el resto de la campaña; " : "No hay suficientes anuncios comparables para medir cuál rinde peor; ") + `se propone por antigüedad${f.pieza.dias !== null ? ` (${f.pieza.dias} días activo${ctrDe(f.pieza)})` : ""}.`,
    }));
  return { piezas: [...peores, ...relleno].slice(0, 3), total: activos.length, comparado: peores.length > 0 };
}
