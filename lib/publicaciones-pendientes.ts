import { getRawDb } from "@/db";
import type { PasoEjecutado } from "@/lib/constructor-ejecutar";
import { idDeResultado, type WindsorAd, type WindsorCampaign, type WindsorProvider } from "@/lib/windsor";

/**
 * Cuánto se sigue ofreciendo una publicación reciente como "pendiente",
 * incluso si Windsor todavía no la sincronizó.
 *
 * 12 horas, no 48: una ventana larga terminó mostrando como "pendiente" dos
 * campañas de prueba de una sesión anterior que alguien ya había borrado a
 * mano en la plataforma real (confirmado en el registro de actividad de
 * Meta) — como Windsor tampoco las sincroniza nunca (están borradas, no
 * atrasadas), quedaban marcadas "pendiente" para siempre. No hay forma de
 * distinguir acá "borrada" de "Windsor todavía no la sincroniza": esta app
 * no tiene su propia acción para borrar campañas, así que `ejecuciones`
 * nunca se entera de un borrado hecho afuera. Achicar la ventana es la
 * mitigación real: el atraso medido en vivo fue de ~6 horas (creada 8:24,
 * sin sincronizar todavía pasado el mediodía), así que 12 horas cubre ese
 * caso real sin arrastrar campañas de pruebas de hace más de medio día.
 */
const VENTANA_MS = 12 * 60 * 60 * 1000;

type CuentaConocida = { provider: WindsorProvider; accountId: string; accountName: string };

const PREFIJO_DESCARTADA = "pendiente_descartada:";

/**
 * Marca un id de campaña "pendiente" para que deje de ofrecerse como tal —
 * el escape manual para cuando de verdad se borró en la plataforma (esta app
 * no tiene su propia acción para borrar, así que no hay forma de saberlo
 * sola; ver el porqué completo en `publicacionesPendientes`). No borra nada
 * real: solo deja de mostrar esta fila sintética.
 */
export async function descartarPendiente(campaignId: string): Promise<void> {
  await getRawDb()
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, '1', ?)
       ON CONFLICT(key) DO NOTHING`,
    )
    .bind(`${PREFIJO_DESCARTADA}${campaignId}`, Date.now())
    .run();
}

async function idsDescartados(candidatos: string[]): Promise<Set<string>> {
  if (candidatos.length === 0) return new Set();
  const claves = candidatos.map((id) => `${PREFIJO_DESCARTADA}${id}`);
  const { results } = await getRawDb()
    .prepare(`SELECT key FROM app_meta WHERE key IN (${claves.map(() => "?").join(",")})`)
    .bind(...claves)
    .all<{ key: string }>();
  return new Set(
    (results ?? []).map((fila) => fila.key.slice(PREFIJO_DESCARTADA.length)),
  );
}

/** Lo recién creado desde el Constructor en UNA cuenta, para completar el árbol de edición mientras Windsor no lo trae. */
export type EntidadesRecientes = {
  campanas: Array<{ id: string; nombre: string; presupuestoDiario: number | null; presupuestoTotal: number | null; objetivo: string | null }>;
  conjuntos: Array<{ id: string; nombre: string; campaignId: string | null }>;
  anuncios: Array<{ id: string; nombre: string; campaignId: string | null; conjuntoId: string | null }>;
};

/**
 * Lo creado con éxito en las últimas horas en esta cuenta (según la bitácora). Solo si el cliente tiene UNA cuenta
 * de esa plataforma (la bitácora no guarda a qué cuenta fue cada paso; con más de una no se adivina).
 */
export async function entidadesRecientesDeCuenta(provider: string, accountId: string): Promise<EntidadesRecientes> {
  const vacio: EntidadesRecientes = { campanas: [], conjuntos: [], anuncios: [] };
  const db = getRawDb();
  const { results: duenos } = await db
    .prepare(`SELECT portfolio_id FROM portfolio_accounts WHERE external_id = ?`)
    .bind(accountId)
    .all<{ portfolio_id: string }>();
  const portfolioId = duenos?.[0]?.portfolio_id;
  if (!portfolioId) return vacio;
  const { results: hermanas } = await db
    .prepare(`SELECT external_id FROM portfolio_accounts WHERE portfolio_id = ? AND (provider = ? OR provider IS NULL)`)
    .bind(portfolioId, provider)
    .all<{ external_id: string }>();
  // Sin proveedor guardado en la tabla no se puede contar cuentas hermanas con certeza: se exige que la cuenta sea la única que
  // coincide por formato (Google: 123-456-7890; Meta: solo dígitos largos).
  const mismoFormato = (id: string) => (provider === "google" ? /^\d{3}-\d{3}-\d{4}$/.test(id) : provider === "meta" ? /^\d{12,}$/.test(id) : false);
  if ((hermanas ?? []).filter((h) => mismoFormato(h.external_id)).length !== 1) return vacio;

  const { results } = await db
    .prepare(`SELECT steps_json FROM ejecuciones WHERE ok = 1 AND portfolio_id = ? AND created_at > ? ORDER BY created_at DESC`)
    .bind(portfolioId, Date.now() - VENTANA_MS)
    .all<{ steps_json: string }>();

  const salida: EntidadesRecientes = { campanas: [], conjuntos: [], anuncios: [] };
  for (const fila of results ?? []) {
    let pasos: PasoEjecutado[];
    try {
      pasos = JSON.parse(fila.steps_json) as PasoEjecutado[];
    } catch {
      continue;
    }
    let campaignId: string | null = null;
    let conjuntoId: string | null = null;
    for (const paso of pasos) {
      if (!paso.ok || paso.platform !== provider) continue;
      const nombre = typeof paso.params.name === "string" ? paso.params.name : "(sin nombre)";
      if (paso.action === "create_campaign") {
        const id = idDeResultado(paso.raw, ["campaign_id", "campaignId", "id"]);
        campaignId = id;
        conjuntoId = null;
        if (!id) continue;
        const unidad = provider === "meta" ? 100 : 1_000_000;
        const dinero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v / unidad : null);
        salida.campanas.push({
          id,
          nombre,
          presupuestoDiario: dinero(paso.params.daily_budget ?? paso.params.budget_amount_micros),
          presupuestoTotal: dinero(paso.params.lifetime_budget),
          objetivo: typeof paso.params.objective === "string" ? paso.params.objective : typeof paso.params.channel_type === "string" ? paso.params.channel_type.toUpperCase() : null,
        });
      } else if (paso.action === "create_ad_group" || paso.action === "create_adset") {
        const id = idDeResultado(paso.raw, ["ad_group_id", "adGroupId", "adset_id", "adsetId", "id"]);
        conjuntoId = id;
        if (id) salida.conjuntos.push({ id, nombre, campaignId });
      } else if (paso.action === "create_ad" || paso.action === "create_responsive_search_ad" || paso.action === "boost_post") {
        const id = idDeResultado(paso.raw, ["ad_id", "adId", "id"], new Set([campaignId, conjuntoId].filter((v): v is string => Boolean(v))));
        const titulo = Array.isArray(paso.params.headlines) && typeof paso.params.headlines[0] === "string" ? paso.params.headlines[0] : nombre;
        if (id) salida.anuncios.push({ id, nombre: titulo, campaignId, conjuntoId });
      }
    }
  }
  return salida;
}

export type PublicacionesPendientes = {
  campanas: WindsorCampaign[];
  anuncios: WindsorAd[];
};

/**
 * Campañas y anuncios creados de verdad a través del Constructor que Windsor
 * todavía no sincronizó a su lado de lectura (`get_data`).
 *
 * Confirmado en vivo el 2026-09-23: una campaña de Meta y otra de Google,
 * creadas con éxito por `execute_action` (las dos con id real, las dos
 * verificadas contra la API real de cada plataforma — `ads_get_ad_entities`
 * para Meta), seguían sin aparecer en `get_data` más de 6 horas después: un
 * atraso real del lado de lectura de Windsor, no un error de esta app.
 * Mientras tanto, quien la publicó no la veía en ningún lado de WiWO.ADS,
 * aunque existiera de verdad y Windsor la hubiera creado sin problema.
 *
 * La fuente acá es la bitácora propia (`ejecuciones`), no Windsor: es la
 * única que ya sabe que esto se creó, con sus ids reales, sin depender de
 * que Windsor se ponga al día. Solo se ofrece cuando el cliente tiene una
 * única cuenta por plataforma — la bitácora no guarda con qué cuenta corrió
 * cada paso, así que con más de una no hay cómo saber a cuál pertenece sin
 * inventarlo, y una campaña puesta en la cuenta equivocada sería peor que no
 * mostrarla.
 */
export async function publicacionesPendientes(
  campanaIdsEnCatalogo: Set<string>,
  anuncioIdsEnCatalogo: Set<string>,
  cuentaUnicaPorPortfolio: Map<string, CuentaConocida[]>,
): Promise<PublicacionesPendientes> {
  const vacio: PublicacionesPendientes = { campanas: [], anuncios: [] };
  if (cuentaUnicaPorPortfolio.size === 0) return vacio;

  const db = getRawDb();
  const { results } = await db
    .prepare(
      `SELECT portfolio_id, steps_json FROM ejecuciones
       WHERE ok = 1 AND created_at > ?
       ORDER BY created_at DESC`,
    )
    .bind(Date.now() - VENTANA_MS)
    .all<{ portfolio_id: string; steps_json: string }>();

  const campanas: WindsorCampaign[] = [];
  const anuncios: WindsorAd[] = [];
  const campanasVistas = new Set<string>();
  const anunciosVistos = new Set<string>();

  for (const fila of results ?? []) {
    const cuentas = cuentaUnicaPorPortfolio.get(fila.portfolio_id);
    if (!cuentas) continue;

    let pasos: PasoEjecutado[];
    try {
      pasos = JSON.parse(fila.steps_json) as PasoEjecutado[];
    } catch {
      continue;
    }

    // Se recorre en orden, igual que el ejecutor real, para encadenar
    // campaña → conjunto → anuncio por plataforma sin mezclar la de una con
    // la de otra dentro del mismo plan (un plan real suele traer las dos).
    const contexto = new Map<
      WindsorProvider,
      { campaignId: string | null; campaignName: string | null; adsetId: string | null; adsetName: string | null }
    >();

    for (const paso of pasos) {
      if (!paso.ok) continue;
      const cuenta = cuentas.find((c) => c.provider === paso.platform);
      if (!cuenta) continue;
      const ctx = contexto.get(cuenta.provider) ?? {
        campaignId: null,
        campaignName: null,
        adsetId: null,
        adsetName: null,
      };

      if (paso.action === "create_campaign") {
        const id = idDeResultado(paso.raw, ["campaign_id", "campaignId", "id"]);
        const nombre = typeof paso.params.name === "string" ? paso.params.name : "(sin nombre)";
        ctx.campaignId = id;
        ctx.campaignName = nombre;
        ctx.adsetId = null;
        ctx.adsetName = null;
        if (id && !campanaIdsEnCatalogo.has(id) && !campanasVistas.has(id)) {
          campanasVistas.add(id);
          campanas.push({
            provider: cuenta.provider,
            accountId: cuenta.accountId,
            accountName: cuenta.accountName,
            currency: null,
            name: nombre,
            campaignId: id,
            status: "ACTIVE",
            nativeObjective: null,
            reach: null,
            linkClicks: null,
            engagement: null,
            leads: null,
            purchases: null,
            spendMicros: 0,
            clicks: 0,
            impressions: 0,
            conversions: null,
            conversionValueMicros: null,
            conActividad: false,
            dailyBudgetMicros: null,
            pendienteSincronizacion: true,
          });
        }
      } else if (paso.action === "create_ad_group" || paso.action === "create_adset") {
        ctx.adsetId = idDeResultado(paso.raw, ["ad_group_id", "adGroupId", "adset_id", "adsetId", "id"]);
        ctx.adsetName = typeof paso.params.name === "string" ? paso.params.name : ctx.campaignName;
      } else if (paso.action === "create_ad" || paso.action === "create_responsive_search_ad" || paso.action === "boost_post") {
        const adId = idDeResultado(paso.raw, ["ad_id", "adId", "id"]);
        const nombreAd =
          typeof paso.params.name === "string"
            ? paso.params.name
            : (Array.isArray(paso.params.headlines) && typeof paso.params.headlines[0] === "string"
                ? paso.params.headlines[0]
                : (ctx.campaignName ?? "(sin nombre)"));
        if (adId && ctx.campaignId && !anuncioIdsEnCatalogo.has(adId) && !anunciosVistos.has(adId)) {
          anunciosVistos.add(adId);
          anuncios.push({
            provider: cuenta.provider,
            accountId: cuenta.accountId,
            accountName: cuenta.accountName,
            currency: null,
            campaignName: ctx.campaignName ?? "(sin nombre)",
            campaignId: ctx.campaignId,
            adsetName: ctx.adsetName,
            adsetId: ctx.adsetId,
            adName: nombreAd,
            adId,
            callToAction: null,
            status: "ACTIVE",
            spendMicros: 0,
            impressions: 0,
            clicks: 0,
            reach: null,
            linkClicks: null,
            engagement: null,
            leads: null,
            purchases: null,
            conversions: null,
            purchaseValue: null,
            landingPageViews: null,
            thruplays: null,
            videoViews: null,
            qualityRanking: null,
            engagementRateRanking: null,
            conversionRateRanking: null,
            optimizationScore: null,
            thumbnailUrl: null,
            message: null,
            headline: null,
            destinationUrl: null,
            conActividad: false,
            pendienteSincronizacion: true,
          });
        }
      }
      contexto.set(cuenta.provider, ctx);
    }
  }

  const descartados = await idsDescartados([
    ...campanas.map((c) => c.campaignId).filter((id): id is string => id !== null),
    ...anuncios.map((a) => a.adId).filter((id): id is string => id !== null),
  ]);

  return {
    campanas: campanas.filter((c) => !c.campaignId || !descartados.has(c.campaignId)),
    anuncios: anuncios.filter((a) => !a.adId || !descartados.has(a.adId)),
  };
}
