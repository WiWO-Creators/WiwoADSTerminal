/**
 * Meta Marketing API directa, con el token del usuario del sistema «WiwoAds» (`META_SYSTEM_USER_TOKEN`).
 *
 * Alcance: solo cuentas ya asociadas a un cliente de WiWO.ADS (lo verifican las rutas con `accountIndex`); el token ve más
 * cuentas que esas y no se usan. Las audiencias no gastan dinero, pero Meta NO ofrece validar sin crear (`validate_only`
 * crea de verdad, verificado): por eso `simular` aquí no llama a Meta, solo comprueba los datos y devuelve lo que se crearía. Nunca se registra ni se devuelve el token.
 */
import { env } from "cloudflare:workers";
import { copiaDeReglaParaAnuncio, type ReglaNativaCruda } from "@/lib/reglas-meta-pura";
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
export async function copiarReglaMetaParaAnuncio(accountId: string, reglaId: string, anuncioId: string, nombre: string): Promise<string> {
  const original = await graph<ReglaNativaCruda>(reglaId, "GET", { fields: "id,name,status,evaluation_spec,execution_spec,schedule_spec" });
  const creada = await graph<{ id?: string }>(`${cuenta(accountId)}/adrules_library`, "POST", copiaDeReglaParaAnuncio(original, anuncioId, nombre));
  if (!creada.id) throw new ErrorDeMeta("Meta no devolvió la regla creada.");
  return creada.id;
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

/** Últimas publicaciones de una cuenta de Instagram, leídas directo de Meta (rápido; Windsor puede tardar minutos). Solo lectura. */
export async function listarMediosInstagram(instagramId: string): Promise<OrganicPost[]> {
  const j = await graph<{ data?: Array<{ id: string; permalink?: string; caption?: string; media_type?: string; media_product_type?: string; timestamp?: string; media_url?: string; thumbnail_url?: string }> }>(
    `${instagramId}/media`,
    "GET",
    { fields: "id,permalink,caption,media_type,media_product_type,timestamp,media_url,thumbnail_url", limit: 100 },
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
    engagement: null,
  }));
}

export type AnuncioDeInstagram = { creativeId: string; anuncioId: string };

/**
 * Crea un anuncio PAUSADO a partir de una publicación de Instagram ya existente, dentro de un conjunto ya existente.
 * Siempre nace pausado: no hay forma de crearlo activo desde aquí.
 */
export async function crearAnuncioDesdeInstagram(
  accountId: string,
  o: { nombre: string; conjuntoId: string; instagramUserId?: string | null; mediaId: string; paginaId?: string | null; facebook?: boolean },
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
    status: "PAUSED",
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
