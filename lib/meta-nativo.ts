/**
 * Meta Marketing API directa, con el token del usuario del sistema «WiwoAds» (`META_SYSTEM_USER_TOKEN`).
 *
 * Alcance: solo cuentas ya asociadas a un cliente de WiWO.ADS (lo verifican las rutas con `accountIndex`); el token ve más
 * cuentas que esas y no se usan. Las audiencias no gastan dinero, pero Meta NO ofrece validar sin crear (`validate_only`
 * crea de verdad, verificado): por eso `simular` aquí no llama a Meta, solo comprueba los datos y devuelve lo que se crearía. Nunca se registra ni se devuelve el token.
 */
import { env } from "cloudflare:workers";
import { colocacionesDeConjunto, type Colocaciones } from "@/lib/anuncios-formato-pura";
import { copiaDeReglaParaAnuncio, especificacionDeReglaDeGasto, type ReglaNativaCruda } from "@/lib/reglas-meta-pura";
import type { OrganicPost } from "@/lib/windsor";

const VERSION = "v21.0";

export class ErrorDeMeta extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Tokens de los usuarios del sistema: uno por portafolio dueño de cuentas, separados por coma en `META_SYSTEM_USER_TOKEN`. */
export const tokensDeMeta = (): string[] =>
  (env.META_SYSTEM_USER_TOKEN ?? "")
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

export const metaNativoConfigurado = (): boolean => tokensDeMeta().length > 0;

/** Qué token funcionó para cada cuenta, para no probar los demás cada vez. */
const tokenPorCuenta = new Map<string, number>();
const cuentaDeRuta = (ruta: string): string | null => /^act_(\d+)/.exec(ruta)?.[1] ?? null;
/** Errores de Meta que significan «este token no ve esa cuenta»: se prueba con el siguiente. */
const SIN_ACCESO = new Set([10, 100, 200, 273, 803]);

type Params = Record<string, string | number | boolean | object | undefined>;

/** Llama a la API de Meta probando los tokens disponibles hasta que uno vea la cuenta. Devuelve el JSON tal cual. */
export async function graphJson<T>(ruta: string, metodo: "GET" | "POST" | "DELETE", params: Params = {}): Promise<T> {
  const tokens = tokensDeMeta();
  if (tokens.length === 0) throw new ErrorDeMeta("Falta el token de Meta (META_SYSTEM_USER_TOKEN).", 503);
  const cuentaId = cuentaDeRuta(ruta);
  const preferido = cuentaId !== null ? tokenPorCuenta.get(cuentaId) : undefined;
  const orden = tokens.map((_, i) => i).sort((a, b) => (a === preferido ? -1 : b === preferido ? 1 : a - b));
  let ultimo: ErrorDeMeta | null = null;
  for (const i of orden) {
    const cuerpo = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      cuerpo.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    cuerpo.set("access_token", tokens[i]);
    const url = `https://graph.facebook.com/${VERSION}/${ruta}`;
    const respuesta =
      metodo === "GET"
        ? await fetch(`${url}?${cuerpo}`, { cache: "no-store" })
        : metodo === "DELETE"
          ? await fetch(`${url}?${cuerpo}`, { method: "DELETE" })
          : await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: cuerpo });
    const json = (await respuesta.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string; code?: number } };
    if (respuesta.ok && !json.error) {
      if (cuentaId !== null) tokenPorCuenta.set(cuentaId, i);
      return json;
    }
    const e = json.error;
    console.error(`WiWO.ADS Meta: token ${i + 1}/${tokens.length} (${tokens[i].length} caracteres) rechazado, código ${e?.code ?? respuesta.status}`);
    ultimo = new ErrorDeMeta(e?.error_user_msg ?? e?.message ?? `Meta respondió ${respuesta.status}`, respuesta.status === 400 ? 422 : 502);
    // Un error que no es de acceso (límite de peticiones, datos mal formados) no mejora con otro token.
    // Al escribir solo se sigue con otro token ante un error de PERMISOS (200): un token puede ver la cuenta sin poder editarla
    // (rol de solo lectura), y un rechazo por permisos no deja nada creado.
    const sigue = e?.code !== undefined && (metodo === "GET" ? SIN_ACCESO.has(e.code) : e.code === 200);
    if (!sigue) break;
  }
  throw ultimo ?? new ErrorDeMeta("Meta no respondió.");
}

const graph = graphJson;

const cuenta = (id: string) => `act_${id.replace(/^act_/, "")}`;

export type AudienciaMeta = {
  id: string;
  nombre: string;
  tipo: string;
  subtipo: string;
  tamanoMinimo: number | null;
  tamanoMaximo: number | null;
  estado: string | null;
};

export async function listarAudienciasMeta(accountId: string): Promise<AudienciaMeta[]> {
  const j = await graph<{ data: Array<{ id: string; name: string; subtype?: string; approximate_count_lower_bound?: number; approximate_count_upper_bound?: number; delivery_status?: { description?: string } }> }>(
    `${cuenta(accountId)}/customaudiences`,
    "GET",
    { fields: "name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status", limit: 100 },
  );
  return j.data.map((a) => ({
    id: a.id,
    nombre: a.name,
    tipo: a.subtype === "LOOKALIKE" ? "Similar" : "Personalizada",
    subtipo: a.subtype ?? "",
    tamanoMinimo: a.approximate_count_lower_bound ?? null,
    tamanoMaximo: a.approximate_count_upper_bound ?? null,
    estado: a.delivery_status?.description ?? null,
  }));
}

export async function listarPixelesMeta(accountId: string): Promise<Array<{ id: string; nombre: string }>> {
  const j = await graph<{ data: Array<{ id: string; name: string }> }>(`${cuenta(accountId)}/adspixels`, "GET", { fields: "id,name", limit: 50 });
  return j.data.map((p) => ({ id: p.id, nombre: p.name }));
}

export type ReglaNativaMeta = { id: string; nombre: string; estado: string };

export async function listarReglasNativasMeta(accountId: string): Promise<ReglaNativaMeta[]> {
  const j = await graph<{ data: Array<{ id: string; name: string; status: string }> }>(`${cuenta(accountId)}/adrules_library`, "GET", { fields: "id,name,status", limit: 100 });
  return j.data.map((r) => ({ id: r.id, nombre: r.name, estado: r.status }));
}

export type ResultadoDeCreacion = { simulado: boolean; id: string | null };

/** Audiencia similar a partir de una audiencia existente. `ratio` entre 0,01 y 0,20 (1 % a 20 %). */
export async function crearAudienciaSimilar(
  accountId: string,
  o: { nombre: string; origenId: string; pais: string; ratio: number; simular: boolean },
): Promise<ResultadoDeCreacion> {
  if (!(o.ratio >= 0.01 && o.ratio <= 0.2)) throw new ErrorDeMeta("El porcentaje debe estar entre 1 % y 20 %.", 400);
  if (!/^[A-Z]{2}$/.test(o.pais)) throw new ErrorDeMeta("El país debe ser un código de 2 letras (ej. CL).", 400);
  if (o.simular) return { simulado: true, id: null };
  const j = await graph<{ id?: string }>(`${cuenta(accountId)}/customaudiences`, "POST", {
    name: o.nombre.slice(0, 100),
    subtype: "LOOKALIKE",
    origin_audience_id: o.origenId,
    lookalike_spec: { type: "similarity", ratio: o.ratio, country: o.pais },
  });
  return { simulado: o.simular, id: j.id ?? null };
}

/** Audiencia personalizada de sitio web: todas las personas que visitaron el sitio en los últimos `dias` días (píxel del cliente). */
export async function crearAudienciaWeb(
  accountId: string,
  o: { nombre: string; pixelId: string; dias: number; simular: boolean },
): Promise<ResultadoDeCreacion> {
  if (!(o.dias >= 1 && o.dias <= 180)) throw new ErrorDeMeta("Los días de retención deben estar entre 1 y 180.", 400);
  if (o.simular) return { simulado: true, id: null };
  const j = await graph<{ id?: string }>(`${cuenta(accountId)}/customaudiences`, "POST", {
    name: o.nombre.slice(0, 100),
    subtype: "WEBSITE",
    retention_days: o.dias,
    prefill: 1,
    rule: {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ id: o.pixelId, type: "pixel" }],
            retention_seconds: o.dias * 86400,
            filter: { operator: "and", filters: [{ field: "url", operator: "i_contains", value: "" }] },
          },
        ],
      },
    },
  });
  return { simulado: o.simular, id: j.id ?? null };
}

/** Prefijo de todo lo que se crea para probar: identifica lo que hay que borrar y es lo único que se deja eliminar. */
export const PREFIJO_DE_PRUEBA = "PRUEBA-WIWOADS";

/** Borra una audiencia, pero solo si es de prueba (su nombre empieza por el prefijo). Nunca toca las de los clientes. */
export async function eliminarAudienciaDePrueba(audienciaId: string): Promise<void> {
  const a = await graph<{ name?: string }>(audienciaId, "GET", { fields: "name" });
  if (!(a.name ?? "").startsWith(PREFIJO_DE_PRUEBA) && !/^PRUEBA /.test(a.name ?? "")) {
    throw new ErrorDeMeta(`No se borra: «${a.name}» no es una audiencia de prueba.`, 403);
  }
  await graph<{ success?: boolean }>(audienciaId, "DELETE");
}

/** Reglas automatizadas de Meta de una cuenta, tal como están. SOLO LECTURA: nunca se modifican desde aquí. */
export async function listarReglasMeta(accountId: string): Promise<{ moneda: string | null; reglas: ReglaNativaCruda[] }> {
  const [moneda, reglas] = await Promise.all([
    graph<{ currency?: string }>(cuenta(accountId), "GET", { fields: "currency" }),
    graph<{ data?: ReglaNativaCruda[] }>(`${cuenta(accountId)}/adrules_library`, "GET", { fields: "id,name,status,evaluation_spec,execution_spec,schedule_spec", limit: 100 }),
  ]);
  return { moneda: moneda.currency ?? null, reglas: reglas.data ?? [] };
}

/**
 * Crea en Meta una regla NUEVA que es copia de otra pero vigila solo un anuncio. Meta la evalúa por su cuenta,
 * sin depender de este servidor. La regla original no se modifica.
 */
export async function copiarReglaMetaParaAnuncio(accountId: string, reglaId: string, anuncioId: string | string[], nombre: string): Promise<string> {
  const original = await graph<ReglaNativaCruda>(reglaId, "GET", { fields: "id,name,status,evaluation_spec,execution_spec,schedule_spec" });
  const creada = await graph<{ id?: string }>(`${cuenta(accountId)}/adrules_library`, "POST", copiaDeReglaParaAnuncio(original, anuncioId, nombre));
  if (!creada.id) throw new ErrorDeMeta("Meta no devolvió la regla creada.");
  return creada.id;
}

type FilaCruda = Record<string, unknown>;

async function leerTodas(ruta: string, campos: string, limite: number, paginas: number): Promise<FilaCruda[]> {
  const salida: FilaCruda[] = [];
  let despues: string | undefined;
  for (let p = 0; p < paginas; p++) {
    const j = await graph<{ data?: FilaCruda[]; paging?: { cursors?: { after?: string }; next?: string } }>(ruta, "GET", { fields: campos, limit: limite, after: despues });
    salida.push(...(j.data ?? []));
    despues = j.paging?.next ? j.paging.cursors?.after : undefined;
    if (!despues) break;
  }
  return salida;
}

/**
 * Campañas y conjuntos de una cuenta tal como están en Meta (todo lo que existe, también lo pausado o recién creado, que
 * Windsor no entrega), en el formato de filas de Windsor para reutilizar el mismo traductor. Solo lectura.
 * Presupuestos: Meta los da en la unidad menor; el total de campaña, en la unidad de la moneda (como Windsor).
 */
export async function leerEstructuraMeta(accountId: string, divisorMenor: number): Promise<{ campanas: FilaCruda[]; conjuntos: FilaCruda[] }> {
  const [campanas, conjuntos] = await Promise.all([
    leerTodas(`${cuenta(accountId)}/campaigns`, "id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,special_ad_categories,spend_cap", 200, 4),
    leerTodas(`${cuenta(accountId)}/adsets`, "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,bid_strategy,bid_amount,optimization_goal,billing_event,destination_type,start_time,end_time,promoted_object,targeting", 100, 6),
  ]);
  const idCuenta = accountId.replace(/^act_/, "");
  return {
    campanas: campanas.map((c) => ({
      campaign_id: c.id, account_id: idCuenta, campaign: c.name, campaign_configured_status: c.status, campaign_effective_status: c.effective_status,
      campaign_objective: c.objective, campaign_daily_budget: c.daily_budget,
      campaign_lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / divisorMenor : null,
      campaign_bid_strategy: c.bid_strategy, campaign_start_time: c.start_time, campaign_stop_time: c.stop_time,
      campaign_special_ad_categories: c.special_ad_categories, campaign_spend_cap: c.spend_cap,
    })),
    conjuntos: conjuntos.map((a) => ({
      adset_id: a.id, account_id: idCuenta, adset_name: a.name, campaign_id: a.campaign_id, adset_status: a.status, adset_effective_status: a.effective_status,
      adset_daily_budget: a.daily_budget, adset_lifetime_budget: a.lifetime_budget, adset_bid_strategy: a.bid_strategy, adset_bid_amount: a.bid_amount,
      adsset_optimization_goal: a.optimization_goal, adset_billing_event: a.billing_event, adset_destination_type: a.destination_type,
      adset_start_time: a.start_time, adset_end_time: a.end_time, adset_promoted_object: a.promoted_object, adset_targeting: a.targeting,
    })),
  };
}

/** Las campañas de una cuenta tal como están hoy en Meta (id → nombre y estado). Solo lectura. */
export async function campanasVivasDeMeta(accountId: string): Promise<Map<string, { nombre: string | null; estado: string | null }>> {
  const filas = await leerTodas(`${cuenta(accountId)}/campaigns`, "id,name,status", 200, 4);
  return new Map(filas.map((c) => [String(c.id), { nombre: c.name ? String(c.name) : null, estado: c.status ? String(c.status) : null }]));
}

/** Estado de una campaña, conjunto o anuncio tal como está hoy en Meta. Solo lectura. */
export async function estadoDeEntidadMeta(entidadId: string): Promise<{ status: string | null; efectivo: string | null }> {
  const j = await graph<{ status?: string; effective_status?: string }>(entidadId, "GET", { fields: "status,effective_status" });
  return { status: j.status ?? null, efectivo: j.effective_status ?? null };
}

/** Cuándo se creó el último anuncio de cada campaña de una cuenta (ms). Solo lectura. */
export async function ultimoAnuncioPorCampana(accountId: string): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  let despues: string | undefined;
  for (let pagina = 0; pagina < 4; pagina++) {
    const j = await graph<{ data?: Array<{ campaign_id?: string; created_time?: string }>; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${cuenta(accountId)}/ads`,
      "GET",
      { fields: "campaign_id,created_time", limit: 500, after: despues },
    );
    for (const a of j.data ?? []) {
      const t = a.created_time ? Date.parse(a.created_time) : NaN;
      if (a.campaign_id && Number.isFinite(t) && t > (salida.get(a.campaign_id) ?? 0)) salida.set(a.campaign_id, t);
    }
    despues = j.paging?.next ? j.paging.cursors?.after : undefined;
    if (!despues) break;
  }
  return salida;
}

/** Crea en Meta una regla nueva de tope de gasto para estos anuncios (se pausan al superarlo). Meta la evalúa por su cuenta. */
export async function crearReglaMetaDeGasto(accountId: string, o: { nombre: string; anuncioIds: string[]; gasto: number }): Promise<string> {
  const moneda = (await graph<{ currency?: string }>(cuenta(accountId), "GET", { fields: "currency" })).currency ?? null;
  const creada = await graph<{ id?: string }>(`${cuenta(accountId)}/adrules_library`, "POST", especificacionDeReglaDeGasto({ ...o, moneda }));
  if (!creada.id) throw new ErrorDeMeta("Meta no devolvió la regla creada.");
  return creada.id;
}

/** Borra una regla de Meta de PRUEBA (su nombre lleva el prefijo). Nunca toca una regla de un cliente. */
export async function eliminarReglaMetaDePrueba(reglaId: string): Promise<void> {
  if (!/^d+$/.test(reglaId)) throw new ErrorDeMeta("Id de regla no válido.", 400);
  const r = await graph<{ name?: string }>(reglaId, "GET", { fields: "name" });
  if (!(r.name ?? "").includes(PREFIJO_DE_PRUEBA)) throw new ErrorDeMeta(`No se borra: «${r.name}» no es una regla de prueba.`, 403);
  await graph<{ success?: boolean }>(reglaId, "DELETE");
}

/** Últimas publicaciones de una cuenta de Instagram, leídas directo de Meta (rápido; Windsor puede tardar minutos). Solo lectura. */
export async function listarMediosInstagram(instagramId: string): Promise<OrganicPost[]> {
  const j = await graph<{ data?: Array<{ id: string; permalink?: string; caption?: string; media_type?: string; media_product_type?: string; timestamp?: string; media_url?: string; thumbnail_url?: string; like_count?: number; comments_count?: number }> }>(
    `${instagramId}/media`,
    "GET",
    { fields: "id,permalink,caption,media_type,media_product_type,timestamp,media_url,thumbnail_url,like_count,comments_count", limit: 100 },
  );
  return (j.data ?? []).map((m) => ({
    platform: "instagram" as const,
    accountId: instagramId,
    id: m.id,
    createdAt: m.timestamp ?? null,
    permalink: m.permalink ?? "",
    mediaUrl: m.media_url ?? m.thumbnail_url ?? "",
    caption: m.caption ?? null,
    format: m.media_product_type === "REELS" ? ("reel" as const) : m.media_type === "CAROUSEL_ALBUM" ? ("carousel" as const) : m.media_type === "VIDEO" ? ("video" as const) : ("image" as const),
    engagement: (m.like_count ?? 0) + (m.comments_count ?? 0) || null,
  }));
}

export type AnuncioDeInstagram = { creativeId: string; anuncioId: string };

/** Crea un anuncio nuevo con un creativo ya armado (imagen, carrusel…) dentro de un conjunto existente. Queda activo salvo que se pida otra cosa. */
export async function crearAnuncioConCreativo(
  accountId: string,
  o: { nombre: string; conjuntoId: string; creativo: Record<string, string | object>; estado?: "ACTIVE" | "PAUSED" },
): Promise<AnuncioDeInstagram> {
  const creativo = await graph<{ id?: string }>(`${cuenta(accountId)}/adcreatives`, "POST", o.creativo);
  if (!creativo.id) throw new ErrorDeMeta("Meta no devolvió el creativo.");
  const anuncio = await graph<{ id?: string }>(`${cuenta(accountId)}/ads`, "POST", {
    name: o.nombre.slice(0, 100),
    adset_id: o.conjuntoId,
    creative: { creative_id: creativo.id },
    status: o.estado ?? "ACTIVE",
  });
  if (!anuncio.id) throw new ErrorDeMeta("Meta no devolvió el anuncio.");
  return { creativeId: creativo.id, anuncioId: anuncio.id };
}

/**
 * Boostea cualquier anuncio existente: crea uno nuevo en otro conjunto reutilizando el creativo del original
 * (sirve también cuando el anuncio no usa una publicación: imagen o video subidos, carruseles…). Queda activo.
 */
export async function crearAnuncioDesdeCreativo(
  accountId: string,
  o: { nombre: string; conjuntoId: string; creativeId: string; estado?: "ACTIVE" | "PAUSED" },
): Promise<AnuncioDeInstagram> {
  if (!/^\d+$/.test(o.creativeId)) throw new ErrorDeMeta("Identificador de creativo no válido.", 400);
  const anuncio = await graph<{ id?: string }>(`${cuenta(accountId)}/ads`, "POST", {
    name: o.nombre.slice(0, 100),
    adset_id: o.conjuntoId,
    creative: { creative_id: o.creativeId },
    status: o.estado ?? "ACTIVE",
  });
  if (!anuncio.id) throw new ErrorDeMeta("Meta no devolvió el anuncio.");
  return { creativeId: o.creativeId, anuncioId: anuncio.id };
}

/** Qué ubicaciones (feed, stories, reels) cubre un conjunto de Meta. Solo lectura. */
export async function colocacionesDeConjuntoMeta(conjuntoId: string): Promise<Colocaciones> {
  const j = await graph<{ targeting?: Record<string, unknown> }>(conjuntoId, "GET", { fields: "targeting" });
  return colocacionesDeConjunto(j.targeting ?? null);
}

/**
 * Crea un anuncio a partir de una publicación de Instagram (o de Facebook) ya existente, dentro de un conjunto ya existente.
 * Queda activo: antes de llegar aquí ya pasó por las aprobaciones que corresponden. Las pruebas piden `estado: "PAUSED"`.
 */
export async function crearAnuncioDesdeInstagram(
  accountId: string,
  o: { nombre: string; conjuntoId: string; instagramUserId?: string | null; mediaId: string; paginaId?: string | null; facebook?: boolean; estado?: "ACTIVE" | "PAUSED" },
): Promise<AnuncioDeInstagram> {
  if (!o.facebook && !o.instagramUserId) throw new ErrorDeMeta("Falta la cuenta de Instagram del cliente.", 400);
  // Un conjunto de visitas al perfil exige el botón «Visitar perfil» con el enlace al perfil; sin él Meta rechaza el anuncio.
  const conjunto = await graph<{ destination_type?: string; optimization_goal?: string }>(o.conjuntoId, "GET", { fields: "destination_type,optimization_goal" });
  let boton: { type: string; value: { link: string } } | undefined;
  if (!o.facebook && (conjunto.destination_type === "INSTAGRAM_PROFILE" || conjunto.optimization_goal === "PROFILE_VISIT")) {
    const perfil = await graph<{ username?: string }>(o.instagramUserId!, "GET", { fields: "username" });
    if (!perfil.username) throw new ErrorDeMeta("No pude leer el usuario de Instagram para armar el botón de perfil.");
    boton = { type: "VISIT_PROFILE", value: { link: `https://www.instagram.com/${perfil.username}/` } };
  }
  const crear = (conPagina: boolean) =>
    graph<{ id?: string }>(`${cuenta(accountId)}/adcreatives`, "POST", {
      name: o.nombre.slice(0, 100),
      ...(o.facebook
        ? { object_story_id: o.mediaId }
        : { instagram_user_id: o.instagramUserId ?? undefined, source_instagram_media_id: o.mediaId, object_id: conPagina ? (o.paginaId ?? undefined) : undefined, call_to_action: boton }),
    });
  let creativo: { id?: string };
  try {
    creativo = await crear(true);
  } catch (error) {
    // Un anuncio de una publicación de Instagram no necesita la Página: si ninguna cuenta del sistema tiene rol en ella, se crea sin ella.
    if (o.facebook || !o.paginaId || !/página|page/i.test(error instanceof Error ? error.message : "")) throw error;
    creativo = await crear(false);
  }
  if (!creativo.id) throw new ErrorDeMeta("Meta no devolvió el creativo.");
  const anuncio = await graph<{ id?: string }>(`${cuenta(accountId)}/ads`, "POST", {
    name: o.nombre.slice(0, 100),
    adset_id: o.conjuntoId,
    creative: { creative_id: creativo.id },
    status: o.estado ?? "ACTIVE",
  });
  if (!anuncio.id) throw new ErrorDeMeta("Meta no devolvió el anuncio.");
  return { creativeId: creativo.id, anuncioId: anuncio.id };
}

export type InteresMeta = { id: string; nombre: string; tamano: number | null; ruta: string | null };

/** Busca intereses de Meta por palabra (para segmentar). Solo lectura; no necesita una cuenta en particular. */
export async function buscarInteresesMeta(consulta: string): Promise<InteresMeta[]> {
  const q = consulta.trim();
  if (q.length < 2) return [];
  const j = await graph<{ data?: Array<{ id: string; name: string; audience_size_lower_bound?: number; path?: string[] }> }>("search", "GET", {
    type: "adinterest",
    q,
    limit: 15,
    locale: "es_LA",
  });
  return (j.data ?? []).map((i) => ({
    id: i.id,
    nombre: i.name,
    tamano: i.audience_size_lower_bound ?? null,
    ruta: i.path ? i.path.join(" › ") : null,
  }));
}

/** Borra una campaña de Meta de PRUEBA (su nombre lleva el prefijo). Nunca toca una campaña de un cliente. */
export async function eliminarCampanaMetaDePrueba(campaignId: string): Promise<void> {
  if (!/^\d+$/.test(campaignId)) throw new ErrorDeMeta("Id de campaña no válido.", 400);
  const c = await graph<{ name?: string }>(campaignId, "GET", { fields: "name" });
  if (!(c.name ?? "").includes(PREFIJO_DE_PRUEBA)) throw new ErrorDeMeta(`No se borra: «${c.name}» no es una campaña de prueba.`, 403);
  await graph<{ success?: boolean }>(campaignId, "DELETE");
}
