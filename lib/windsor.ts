import { env } from "cloudflare:workers";

import { getRawDb } from "@/db";
import {
  addToBreakdown,
  emptyBreakdown,
  type ConversionBreakdown,
} from "@/lib/conversiones";
import { unidadesMenoresMeta } from "@/lib/monedas";
import { ACTIVE_PLATFORMS, PLATFORM, type Platform } from "@/lib/plataformas";

/**
 * Lectura de métricas vía Windsor.ai.
 *
 * Windsor ya normaliza Google Ads, Meta, TikTok y LinkedIn en un solo esquema,
 * así que la capa de lectura no depende de los trámites lentos de cada
 * plataforma (developer token de Google Ads, App Review de Meta). Esos siguen
 * haciendo falta, pero solo para escribir.
 *
 * NO se usa el conector "all": mezcla las plataformas publicitarias con las
 * fuentes de tráfico de GA4 —"(direct)", "chatgpt.com", dominios sueltos— y
 * una comparativa construida sobre eso sería falsa. Cada plataforma va por su
 * propio conector.
 *
 * Los nombres de campo y el manejo de errores replican lo ya resuelto en
 * WIWO.Ads (src/services/conectores/windsor.ts), que corrió contra datos
 * reales. Pedir un campo con el nombre equivocado devuelve la columna en null
 * sin ningún error, que es la peor forma de fallar.
 */

const API_BASE = "https://connectors.windsor.ai";
const CACHE_KEY = "windsor_cache_v2";
const CAMPAIGN_CACHE_KEY = "windsor_campanas_v5";
const CONVERSION_CACHE_KEY = "windsor_conversiones_v1";
const ADS_CACHE_KEY = "windsor_anuncios_v6";
const CATALOG_CACHE_KEY = "windsor_catalogo_v2";
const CACHE_TTL_MS = 15 * 60 * 1000;
/**
 * El catálogo cambia cuando alguien crea o pausa algo, no cada cuarto de hora,
 * y su consulta es la más lenta del sistema (dos minutos en frío contra tres
 * años de historial). Se guarda un día.
 */
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
/** Meses de historial que se barren para armar el catálogo. */
const CATALOG_MESES = 36;
const TIMEOUT_MS = 60_000;
/** El catálogo barre años: con 60 s se cortaba antes de responder. */
const CATALOG_TIMEOUT_MS = 280_000;
const REINTENTOS = 3;

/**
 * Estados que significan "ya no existe".
 *
 * Windsor excluye las entidades borradas incluso con `include_inactive`, y
 * mostrarlas sería ruido: nadie puede reactivar una campaña eliminada. Pausado
 * y archivado sí se muestran, porque son reversibles y el usuario necesita
 * verlos.
 */
const ESTADOS_BORRADOS = new Set(["REMOVED", "DELETED"]);

function estaBorrado(status: string | null): boolean {
  return ESTADOS_BORRADOS.has((status ?? "").toUpperCase());
}

/** Alias histórico: el tipo real vive en el registro de plataformas. */
export type WindsorProvider = Platform;

export type WindsorAccountDaily = {
  provider: WindsorProvider;
  accountId: string;
  accountName: string;
  currency: string | null;
  date: string;
  spendMicros: number;
  clicks: number;
  impressions: number;
  /**
   * Personas alcanzadas. NUNCA se suma entre días ni entre cuentas: la misma
   * persona alcanzada dos veces se contaría dos veces. Solo se usa el máximo
   * o se deja como dato del día.
   */
  reach: number | null;
  linkClicks: number | null;
  engagement: number | null;
  leads: number | null;
  purchases: number | null;
  conversations: number | null;
  conversions: number | null;
  conversionValueMicros: number | null;
};

export type WindsorCampaign = {
  provider: WindsorProvider;
  accountId: string;
  accountName: string;
  currency: string | null;
  name: string;
  /**
   * Id nativo de la plataforma (numérico en ambas, como texto). No es el
   * nombre: es lo que Windsor exige para escribir sobre esta campaña —por
   * ejemplo, para crear un conjunto de anuncios dentro de ella. Puede faltar
   * en filas antiguas de caché o si Windsor no lo devolvió para esa fila.
   */
  campaignId: string | null;
  status: string | null;
  /** Objetivo declarado por la plataforma, respaldo cuando no hay sigla. */
  nativeObjective: string | null;
  reach: number | null;
  linkClicks: number | null;
  engagement: number | null;
  leads: number | null;
  purchases: number | null;
  spendMicros: number;
  clicks: number;
  impressions: number;
  conversions: number | null;
  conversionValueMicros: number | null;
  /**
   * false: la entidad existe en la cuenta pero no tuvo actividad en el rango.
   *
   * Sus métricas valen cero porque la plataforma no reporta nada para ella, no
   * porque haya gastado cero. La interfaz debe mostrar "—", nunca un 0 que se
   * leería como "no rindió".
   */
  conActividad: boolean;
  /**
   * Presupuesto diario configurado, no el gasto. `null` cuando la campaña usa
   * presupuesto de campaña compartido en Meta (Advantage Campaign Budget) y
   * Windsor no lo expone a este nivel, o cuando la fila del catálogo no trae
   * el campo (no se pide junto con las métricas de actividad).
   */
  dailyBudgetMicros: number | null;
};

type Row = Record<string, unknown>;

/**
 * Conectores y campos por plataforma, tomados del registro.
 *
 * Sumar TikTok o LinkedIn es completar su ficha en lib/plataformas.ts; este
 * archivo no cambia.
 */
const CONNECTORS = Object.fromEntries(
  ACTIVE_PLATFORMS.map((id) => [
    id,
    { connector: PLATFORM[id].connector, fields: PLATFORM[id].camposDiarios },
  ]),
) as Record<Platform, { connector: string; fields: string[] }>;

const CAMPAIGN_FIELDS = Object.fromEntries(
  ACTIVE_PLATFORMS.map((id) => [id, PLATFORM[id].camposCampana]),
) as Record<Platform, string[]>;

export class WindsorError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export function windsorConfigured(): boolean {
  return Boolean(env.WINDSOR_API_KEY);
}

/**
 * Trae las filas diarias del rango, con caché corto en `app_meta`.
 *
 * El caché evita golpear la API en cada carga de página. Si Windsor falla, el
 * error sube: es preferible decir "no pudimos leer" a mostrar un cero, que se
 * leería como "no invirtió".
 */
export async function fetchWindsorDaily(
  rangeStart: string,
  rangeEnd: string,
): Promise<{ rows: WindsorAccountDaily[]; fetchedAt: number }> {
  if (!windsorConfigured()) throw new WindsorError("Falta WINDSOR_API_KEY");

  const db = getRawDb();
  const cacheId = `${CACHE_KEY}:${rangeStart}:${rangeEnd}`;
  const cached = await db
    .prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1")
    .bind(cacheId)
    .first<{ value: string; updated_at: number }>();

  if (cached && Date.now() - Number(cached.updated_at) < CACHE_TTL_MS) {
    return {
      rows: JSON.parse(cached.value) as WindsorAccountDaily[],
      fetchedAt: Number(cached.updated_at),
    };
  }

  // En paralelo: en serie, un mes de 40+ cuentas tardaba casi un minuto.
  const perProvider = await Promise.all(
    ACTIVE_PLATFORMS.map((provider) =>
      fetchProvider(provider, rangeStart, rangeEnd),
    ),
  );
  const rows = perProvider.flat();

  const fetchedAt = Date.now();
  await db
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .bind(cacheId, JSON.stringify(rows), fetchedAt)
    .run();

  return { rows, fetchedAt };
}

/**
 * Pide un conector con reintentos.
 *
 * Solo se reintenta 429 y 5xx: otro 4xx es un pedido mal formado y repetirlo
 * únicamente gasta cuota.
 */
async function fetchProvider(
  provider: WindsorProvider,
  rangeStart: string,
  rangeEnd: string,
): Promise<WindsorAccountDaily[]> {
  const raw = await requestWindsor(
    provider,
    CONNECTORS[provider].fields,
    rangeStart,
    rangeEnd,
  );
  return toRows(raw, provider);
}

/**
 * Pide un conector con reintentos y devuelve las filas crudas.
 *
 * Solo se reintenta 429 y 5xx: otro 4xx es un pedido mal formado y repetirlo
 * únicamente gasta cuota.
 */
async function requestWindsor(
  provider: WindsorProvider,
  fields: string[],
  rangeStart: string,
  rangeEnd: string,
  timeoutMs = TIMEOUT_MS,
): Promise<Row[]> {
  return requestWindsorConnector(
    CONNECTORS[provider].connector,
    fields,
    rangeStart,
    rangeEnd,
    { timeoutMs },
  );
}

/**
 * Pide un conector de Windsor por su nombre, no por plataforma publicitaria.
 *
 * `requestWindsor` asume que cada conector es una de las `ACTIVE_PLATFORMS`
 * del registro de plataformas. Los conectores de contenido orgánico
 * (`facebook_organic`, `instagram`) no encajan ahí —no son una plataforma de
 * anuncios—, así que esta versión toma el nombre del conector directo.
 *
 * `selectAccounts` acota el pedido a una sola cuenta. Verificado por prueba
 * directa: sin él, el conector devuelve el contenido de TODAS las páginas e
 * Instagram conectados al workspace de Windsor, no solo del cliente pedido.
 */
async function requestWindsorConnector(
  connector: string,
  fields: string[],
  rangeStart: string,
  rangeEnd: string,
  {
    timeoutMs = TIMEOUT_MS,
    selectAccounts,
  }: { timeoutMs?: number; selectAccounts?: string } = {},
): Promise<Row[]> {
  const url = new URL(`${API_BASE}/${connector}`);
  url.searchParams.set("api_key", env.WINDSOR_API_KEY!);
  url.searchParams.set("date_from", rangeStart);
  url.searchParams.set("date_to", rangeEnd);
  url.searchParams.set("fields", fields.join(","));
  if (selectAccounts) url.searchParams.set("select_accounts", selectAccounts);

  let lastError: unknown = null;
  for (let intento = 0; intento < REINTENTOS; intento += 1) {
    if (intento > 0) await wait(500 * 2 ** (intento - 1));
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
      });
      if (response.ok) {
        const body = (await response.json()) as {
          data?: Row[];
          result?: Row[];
        };
        return body.data ?? body.result ?? [];
      }
      const retryable = response.status === 429 || response.status >= 500;
      const error = new WindsorError(
        `Windsor respondió ${response.status} para ${connector}`,
        retryable,
      );
      if (!retryable) throw error;
      lastError = error;
    } catch (error) {
      // Un timeout o una caída de red se reintentan. Un pedido mal formado no.
      if (error instanceof WindsorError && !error.retryable) throw error;
      lastError = error;
    }
  }

  throw new WindsorError(
    `Windsor falló tras ${REINTENTOS} intentos en ${connector}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function toRows(raw: Row[], provider: WindsorProvider): WindsorAccountDaily[] {
  return raw
    .map((row) => {
      const accountId = text(first(row, "account_id"));
      const date = text(row.date)?.slice(0, 10);
      if (!accountId || !date) return null;

      const conversions = first(row, "actions_omni_purchase", "conversions");
      const conversionValue = first(
        row,
        "action_values_omni_purchase",
        "conversions_value",
      );

      return {
        provider,
        accountId,
        accountName: text(first(row, "account_name")) ?? accountId,
        currency: text(
          first(row, "account_currency", "currency_code", "currency"),
        ),
        date,
        // La app guarda dinero en micros; Windsor entrega el monto directo.
        spendMicros: toMicros(first(row, "spend", "cost")),
        clicks: Math.round(number(row.clicks)),
        impressions: Math.round(number(row.impressions)),
        reach: optionalNumber(row.reach),
        linkClicks: optionalNumber(row.actions_link_click),
        engagement: optionalNumber(row.actions_post_engagement),
        leads: optionalNumber(row.actions_lead),
        purchases: optionalNumber(row.actions_omni_purchase),
        conversations: optionalNumber(
          row.actions_onsite_conversion_messaging_conversation_started_7d,
        ),
        conversions: conversions === null ? null : number(conversions),
        conversionValueMicros:
          conversionValue === null ? null : toMicros(conversionValue),
      } satisfies WindsorAccountDaily;
    })
    .filter((row): row is WindsorAccountDaily => row !== null);
}

/** Devuelve el primer alias presente. Windsor nombra distinto por conector. */
function first(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

/**
 * Devuelve null cuando la métrica no viene, en vez de cero.
 *
 * Un cero y un "no aplica" son cosas distintas: Meta no reporta compras en una
 * campaña de awareness, y mostrarlo como 0 sugeriría que no vendió nada.
 */
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMicros(value: unknown): number {
  return Math.round(number(value) * 1_000_000);
}

/**
 * Campañas del rango, agregadas.
 *
 * Se pide sin el campo `date` a propósito: así Windsor devuelve una fila por
 * campaña en vez de una por campaña y día. La diferencia es de dos órdenes de
 * magnitud en el tamaño de la respuesta.
 */
/**
 * Catálogo: todo lo que existe en las cuentas, no solo lo que entregó.
 *
 * El problema que resuelve: la API REST de Windsor devuelve únicamente las
 * entidades con actividad en el rango pedido. Una cuenta con 3 campañas activas
 * y 22 pausadas devolvía 3, y el sistema daba a entender que las otras no
 * existían. Eso rompe el caso real: "a veces pasa también que una campaña se
 * desactiva".
 *
 * Por qué no se usa la opción del conector: `include_inactive` en Google Ads
 * —y `include_objects_without_insights` en Meta— existe, y hace exactamente
 * falta, pero **solo por la interfaz de Windsor y por su MCP, no por la API
 * REST**. Se probó por REST con todas las grafías plausibles (valor
 * `true`/`1`/`on`/`True`, objeto `options={...}`, `options[include_inactive]`,
 * prefijos `_`/`opt_`/`google_ads_`, `_renew=true`, con y sin
 * `select_accounts`) y el endpoint las ignora en silencio: siempre las mismas
 * filas. Lo único que cambia la respuesta es la fecha.
 *
 * De ahí la técnica: `campaign_status` y `effective_status` son el estado de
 * **hoy**, no el del rango. Un barrido de varios años sin campos de métrica
 * devuelve cada entidad una vez, con su estado actual. Verificado en Amipass:
 * un mes devolvía 3 campañas; tres años devuelven 20.
 *
 * Lo que cuesta: es de lejos la consulta más lenta del sistema —116 s en
 * Google, 254 s en Meta, medidos en frío— así que **nunca va en la ruta de una
 * página**. Se construye con `construir: true` desde su propio endpoint y se
 * guarda un día; el tablero solo lee lo que ya esté guardado.
 */
export type Catalogo = {
  campanas: WindsorCampaign[];
  anuncios: WindsorAd[];
  /** null: nunca se ha construido. */
  construidoEn: number | null;
  rango: { desde: string; hasta: string };
  /** Plataformas cuyo barrido falló; su parte del catálogo falta. */
  fallos: Array<{ provider: Platform; mensaje: string }>;
};

/**
 * Rango del catálogo, ajustado a meses completos.
 *
 * El ajuste no es cosmético: Windsor cachea por rango exacto, así que un rango
 * que se moviera cada día obligaría a repetir el barrido completo a diario.
 * Pegado al mes, se repite una vez al mes.
 */
function rangoCatalogo(rangeEnd: string): { desde: string; hasta: string } {
  const fin = new Date(`${rangeEnd}T00:00:00Z`);
  const anio = fin.getUTCFullYear();
  const mes = fin.getUTCMonth();
  return {
    desde: iso(new Date(Date.UTC(anio, mes - CATALOG_MESES + 1, 1))),
    hasta: iso(new Date(Date.UTC(anio, mes + 1, 0))),
  };
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Borra lo cacheado de métricas, campañas, anuncios y contenido orgánico para
 * que la próxima lectura vaya a Windsor. **No** toca el catálogo (lo reconstruye
 * `fetchWindsorCatalog` con `construir: true`): es lo más caro de rehacer y no
 * cambia con cada actualización manual.
 */
export async function limpiarCacheDeMetricas(): Promise<number> {
  const prefijos = [CACHE_KEY, CAMPAIGN_CACHE_KEY, CONVERSION_CACHE_KEY, ADS_CACHE_KEY, ORGANIC_CACHE_KEY];
  const db = getRawDb();
  let borradas = 0;
  for (const prefijo of prefijos) {
    const resultado = await db
      .prepare("DELETE FROM app_meta WHERE key = ? OR key LIKE ?")
      .bind(prefijo, `${prefijo}:%`)
      .run();
    borradas += resultado.meta?.changes ?? 0;
  }
  return borradas;
}

/** Ventana de la actualización parcial: lo recién creado siempre cae acá adentro. */
const CATALOGO_PARCIAL_DIAS = 45;
const CATALOGO_PARCIAL_TIMEOUT_MS = 60_000;

function claveDeCampana(c: WindsorCampaign): string {
  return `${c.provider}:${c.campaignId ?? c.name}`;
}

function claveDeAnuncio(a: WindsorAd): string {
  return `${a.provider}:${a.adId ?? `${a.campaignName}::${a.adsetName ?? ""}::${a.adName ?? ""}`}`;
}

/**
 * Suma al catálogo guardado lo que exista de nuevo en unas cuentas puntuales,
 * sin repetir el barrido de años de todo el sistema (minutos).
 *
 * Existe para lo que pasa justo después de publicar: la campaña recién creada
 * no tiene ni una impresión, así que solo el catálogo la conoce, y ese se
 * reconstruía una vez al día como mucho. Se pide únicamente la cuenta afectada
 * y solo los últimos 45 días —lo creado ahora cae ahí siempre—, y el resultado
 * se **funde** con lo guardado por id: se agregan y actualizan entidades, no se
 * borran las viejas que la ventana corta no alcanza.
 *
 * No toca `construidoEn`: sigue siendo la fecha del último barrido completo,
 * que es la que decide cuándo toca el siguiente.
 *
 * `campaignIdsVistos` devuelve, sin filtrar por lo ya guardado, cada id de
 * campaña que Windsor realmente entregó en esta lectura — es lo que permite
 * a quien llama comprobar si una campaña recién creada existe de verdad en la
 * cuenta real, en vez de confiar a ciegas en que `execute_action` haya
 * respondido `ok`. Se verificó contra un caso real (2026-09-22): Windsor
 * confirmó como creada una campaña de Meta que nunca llegó a existir en la
 * cuenta — ni acá, ni en el historial de cambios de la cuenta real.
 */
export async function actualizarCatalogoDeCuentas(
  cuentas: Array<{ provider: WindsorProvider; accountId: string }>,
): Promise<{ agregadas: number; fallos: string[]; campaignIdsVistos: Set<string> }> {
  const campaignIdsVistos = new Set<string>();
  if (!windsorConfigured() || cuentas.length === 0) {
    return { agregadas: 0, fallos: [], campaignIdsVistos };
  }

  const hoy = new Date();
  const rango = rangoCatalogo(hoy.toISOString().slice(0, 10));
  const cacheId = `${CATALOG_CACHE_KEY}:${rango.desde}:${rango.hasta}`;
  const db = getRawDb();
  const cached = await db
    .prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1")
    .bind(cacheId)
    .first<{ value: string; updated_at: number }>();
  // Sin un catálogo base no hay a qué fundir —el barrido completo lo arma—,
  // pero igual se sigue: la consulta a Windsor de acá abajo es la única
  // forma de llenar `campaignIdsVistos`, y quien llama la necesita aunque
  // todavía no exista un catálogo guardado.
  const catalogo: Omit<Catalogo, "construidoEn"> = cached
    ? (JSON.parse(await descomprimirTexto(cached.value)) as Omit<Catalogo, "construidoEn">)
    : { campanas: [], anuncios: [], rango, fallos: [] };
  const desde = iso(new Date(hoy.getTime() - CATALOGO_PARCIAL_DIAS * 86_400_000));
  const hasta = iso(hoy);
  const fallos: string[] = [];
  let agregadas = 0;

  const unicas = new Map(cuentas.map((c) => [`${c.provider}:${c.accountId}`, c]));
  await Promise.all(
    [...unicas.values()].map(async ({ provider, accountId }) => {
      try {
        const conector = CONNECTORS[provider].connector;
        const [filasCampanas, filasAnuncios] = await Promise.all([
          requestWindsorConnector(conector, PLATFORM[provider].camposCatalogoCampana, desde, hasta, {
            timeoutMs: CATALOGO_PARCIAL_TIMEOUT_MS,
            selectAccounts: accountId,
          }),
          requestWindsorConnector(conector, PLATFORM[provider].camposCatalogoAnuncio, desde, hasta, {
            timeoutMs: CATALOGO_PARCIAL_TIMEOUT_MS,
            selectAccounts: accountId,
          }),
        ]);
        const campanas = sinActividad(toCampaigns(filasCampanas, provider));
        const anuncios = sinActividad(toAds(filasAnuncios, provider));
        for (const c of campanas) {
          if (c.campaignId) campaignIdsVistos.add(c.campaignId);
        }

        const porCampana = new Map(catalogo.campanas.map((c) => [claveDeCampana(c), c]));
        for (const c of campanas) {
          if (!porCampana.has(claveDeCampana(c))) agregadas += 1;
          // Lo ya guardado con métricas no se pisa: solo se agrega lo que falta.
          if (!porCampana.has(claveDeCampana(c))) porCampana.set(claveDeCampana(c), c);
        }
        catalogo.campanas = [...porCampana.values()];

        const porAnuncio = new Map(catalogo.anuncios.map((a) => [claveDeAnuncio(a), a]));
        for (const a of anuncios) {
          if (!porAnuncio.has(claveDeAnuncio(a))) porAnuncio.set(claveDeAnuncio(a), a);
        }
        catalogo.anuncios = [...porAnuncio.values()];
      } catch (error) {
        fallos.push(`${provider}:${accountId} — ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );

  if (cached && (agregadas > 0 || fallos.length < unicas.size)) {
    await db
      .prepare(
        `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      // `updated_at` se conserva: es la fecha del barrido completo.
      .bind(cacheId, await comprimirTexto(JSON.stringify(catalogo)), Number(cached.updated_at))
      .run();
  }
  return { agregadas, fallos, campaignIdsVistos };
}

/**
 * Prefijo que marca un valor de `app_meta` comprimido con gzip y codificado
 * en base64 — necesario desde que el catálogo completo (todas las campañas y
 * anuncios de todos los clientes, sin filtrar por actividad) empezó a superar
 * el límite real de D1 para una fila (~1 MB: `SQLITE_TOOBIG`, confirmado en
 * vivo el 2026-09-23). El texto comprime muy bien —son miles de objetos con
 * las mismas claves repetidas— así que esto solo debería volver a hacer falta
 * si el catálogo crece mucho más; ahí el siguiente paso es partirlo por
 * plataforma en vez de una sola fila.
 */
const PREFIJO_COMPRIMIDO = "gz:";

async function comprimirTexto(texto: string): Promise<string> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  void writer.write(new TextEncoder().encode(texto));
  void writer.close();
  const comprimido = await new Response(cs.readable).arrayBuffer();
  return PREFIJO_COMPRIMIDO + Buffer.from(comprimido).toString("base64");
}

async function descomprimirTexto(valor: string): Promise<string> {
  if (!valor.startsWith(PREFIJO_COMPRIMIDO)) return valor;
  const bytes = Buffer.from(valor.slice(PREFIJO_COMPRIMIDO.length), "base64");
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const descomprimido = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(descomprimido);
}

/**
 * Lee —y opcionalmente construye— el catálogo.
 *
 * Con `construir: false` jamás llama a Windsor: devuelve lo guardado, aunque
 * esté vencido, o vacío si nunca se construyó. Un catálogo vencido sigue siendo
 * mejor que ninguno, porque una campaña pausada hace un mes sigue pausada.
 */
export async function fetchWindsorCatalog(
  /**
   * Ancla del barrido. Por defecto hoy, **no** el rango que se esté
   * consultando: el catálogo describe lo que existe ahora y con qué estado, y
   * eso no cambia porque se miren las métricas de un mes pasado. Anclarlo al
   * rango consultado daría un barrido distinto por cada periodo y, con caché
   * vacío, dejaría sin catálogo a todos salvo el mes en curso.
   */
  anclaje?: string,
  {
    construir = false,
    forzar = false,
  }: {
    construir?: boolean;
    /** Reconstruye aunque lo guardado todavía esté vigente (actualización manual). */
    forzar?: boolean;
  } = {},
): Promise<Catalogo> {
  const rango = rangoCatalogo(anclaje ?? new Date().toISOString().slice(0, 10));
  const vacio: Catalogo = {
    campanas: [],
    anuncios: [],
    construidoEn: null,
    rango,
    fallos: [],
  };
  if (!windsorConfigured()) return vacio;

  const db = getRawDb();
  const cacheId = `${CATALOG_CACHE_KEY}:${rango.desde}:${rango.hasta}`;
  const cached = await db
    .prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1")
    .bind(cacheId)
    .first<{ value: string; updated_at: number }>();

  const guardado = cached
    ? ({
        ...(JSON.parse(await descomprimirTexto(cached.value)) as Omit<Catalogo, "construidoEn">),
        construidoEn: Number(cached.updated_at),
      } satisfies Catalogo)
    : null;
  const vigente =
    guardado && Date.now() - guardado.construidoEn < CATALOG_TTL_MS;

  if ((vigente && !forzar) || !construir) return guardado ?? vacio;

  // Cada plataforma se aísla: que Meta se pase de tiempo no debe costar el
  // catálogo de Google, que ya estaba listo.
  const fallos: Catalogo["fallos"] = [];
  const porPlataforma = await Promise.all(
    ACTIVE_PLATFORMS.map(async (provider) => {
      try {
        const [filasCampanas, filasAnuncios] = await Promise.all([
          requestWindsor(
            provider,
            PLATFORM[provider].camposCatalogoCampana,
            rango.desde,
            rango.hasta,
            CATALOG_TIMEOUT_MS,
          ),
          requestWindsor(
            provider,
            PLATFORM[provider].camposCatalogoAnuncio,
            rango.desde,
            rango.hasta,
            CATALOG_TIMEOUT_MS,
          ),
        ]);
        // Se reusan los normalizadores de las consultas con métricas: al no
        // venir campos de métrica, el gasto queda en 0 y las métricas
        // opcionales en null, que es lo que corresponde a algo sin actividad.
        return {
          campanas: sinActividad(toCampaigns(filasCampanas, provider)),
          anuncios: sinActividad(toAds(filasAnuncios, provider)),
        };
      } catch (error) {
        fallos.push({
          provider,
          mensaje: error instanceof Error ? error.message : String(error),
        });
        // Si ya había catálogo guardado para esta plataforma, se conserva.
        return {
          campanas: (guardado?.campanas ?? []).filter(
            (c) => c.provider === provider,
          ),
          anuncios: (guardado?.anuncios ?? []).filter(
            (a) => a.provider === provider,
          ),
        };
      }
    }),
  );

  const catalogo: Catalogo = {
    campanas: porPlataforma.flatMap((x) => x.campanas),
    anuncios: porPlataforma.flatMap((x) => x.anuncios),
    construidoEn: Date.now(),
    rango,
    fallos,
  };

  // Un barrido que falló en todas las plataformas no se guarda: borraría el
  // catálogo bueno que ya estaba.
  if (fallos.length < ACTIVE_PLATFORMS.length) {
    await db
      .prepare(
        `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .bind(cacheId, await comprimirTexto(JSON.stringify(catalogo)), catalogo.construidoEn)
      .run();
  }

  return catalogo;
}

function sinActividad<T extends { status: string | null; conActividad: boolean }>(
  filas: T[],
): T[] {
  return filas
    .filter((fila) => !estaBorrado(fila.status))
    .map((fila) => ({ ...fila, conActividad: false }));
}

/**
 * Une el catálogo con las filas que sí tuvieron actividad.
 *
 * El orden importa: el catálogo es la base —define qué existe— y las filas con
 * métricas lo sobrescriben. Así una campaña que entregó conserva sus cifras y
 * una pausada queda presente y marcada.
 */
export function fusionarConCatalogo<T extends { conActividad: boolean }>(
  catalogo: T[],
  conMetricas: T[],
  clave: (fila: T) => string,
): T[] {
  const mapa = new Map<string, T>();
  for (const fila of catalogo) mapa.set(clave(fila), fila);
  for (const fila of conMetricas) mapa.set(clave(fila), fila);
  return [...mapa.values()];
}

export function claveCampana(c: WindsorCampaign): string {
  return `${c.provider}::${c.accountId}::${c.name}`;
}

export function claveAnuncio(a: WindsorAd): string {
  return `${a.provider}::${a.accountId}::${a.campaignName}::${a.adsetName ?? ""}::${a.adName ?? ""}`;
}

/**
 * Campañas del rango, completadas con el catálogo.
 *
 * La fusión se hace **fuera** del caché de métricas a propósito: así, en cuanto
 * el catálogo se construye, las campañas pausadas aparecen sin esperar a que
 * venza el caché de 15 minutos.
 */
export async function fetchWindsorCampaigns(
  rangeStart: string,
  rangeEnd: string,
): Promise<WindsorCampaign[]> {
  const [conMetricas, catalogo] = await Promise.all([
    fetchCampanasConMetricas(rangeStart, rangeEnd),
    fetchWindsorCatalog(),
  ]);
  return fusionarConCatalogo(catalogo.campanas, conMetricas, claveCampana);
}

async function fetchCampanasConMetricas(
  rangeStart: string,
  rangeEnd: string,
): Promise<WindsorCampaign[]> {
  if (!windsorConfigured()) throw new WindsorError("Falta WINDSOR_API_KEY");

  const db = getRawDb();
  const cacheId = `${CAMPAIGN_CACHE_KEY}:${rangeStart}:${rangeEnd}`;
  const cached = await db
    .prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1")
    .bind(cacheId)
    .first<{ value: string; updated_at: number }>();

  if (cached && Date.now() - Number(cached.updated_at) < CACHE_TTL_MS) {
    return JSON.parse(cached.value) as WindsorCampaign[];
  }

  const perProvider = await Promise.all(
    ACTIVE_PLATFORMS.map(async (provider) => {
      const raw = await requestWindsor(
        provider,
        CAMPAIGN_FIELDS[provider],
        rangeStart,
        rangeEnd,
      );
      return toCampaigns(raw, provider);
    }),
  );
  const campaigns = perProvider.flat();

  await db
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .bind(cacheId, JSON.stringify(campaigns), Date.now())
    .run();

  return campaigns;
}

/**
 * Normaliza y agrega las campañas.
 *
 * Windsor puede devolver la misma campaña en varias filas: `effective_status`
 * en Meta es un campo a nivel de anuncio, así que una campaña con anuncios en
 * distinto estado se parte. Sin agregar, sus cifras aparecen divididas y la
 * tabla muestra menos inversión de la real.
 */
function toCampaigns(raw: Row[], provider: WindsorProvider): WindsorCampaign[] {
  const merged = new Map<string, WindsorCampaign>();

  for (const campaign of parseCampaigns(raw, provider)) {
    const key = `${campaign.accountId}:${campaign.name}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, campaign);
      continue;
    }
    current.spendMicros += campaign.spendMicros;
    current.clicks += campaign.clicks;
    current.impressions += campaign.impressions;
    current.conversions = addNullable(current.conversions, campaign.conversions);
    current.linkClicks = addNullable(current.linkClicks, campaign.linkClicks);
    current.engagement = addNullable(current.engagement, campaign.engagement);
    current.leads = addNullable(current.leads, campaign.leads);
    current.purchases = addNullable(current.purchases, campaign.purchases);
    // El alcance no se suma: la misma persona alcanzada en dos filas se
    // contaría dos veces. Se toma el mayor, que es la cota inferior honesta.
    current.reach =
      current.reach === null || campaign.reach === null
        ? (current.reach ?? campaign.reach)
        : Math.max(current.reach, campaign.reach);
    current.conversionValueMicros = addNullable(
      current.conversionValueMicros,
      campaign.conversionValueMicros,
    );
    // Basta un anuncio activo para que la campaña esté entregando.
    if (isActiveStatus(campaign.status)) current.status = campaign.status;
    // El id no debería cambiar entre filas de la misma campaña; si alguna
    // fila vino sin él, se rescata el de otra.
    current.campaignId = current.campaignId ?? campaign.campaignId;
    current.dailyBudgetMicros =
      current.dailyBudgetMicros ?? campaign.dailyBudgetMicros;
  }

  return [...merged.values()];
}

/** Suma dejando null si falta un lado: un dato ausente no vale cero. */
function addNullable(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a + b;
}

function isActiveStatus(status: string | null): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "ENABLED" || value === "ACTIVE";
}

function parseCampaigns(
  raw: Row[],
  provider: WindsorProvider,
): WindsorCampaign[] {
  return raw
    .map((row): WindsorCampaign | null => {
      const accountId = text(first(row, "account_id"));
      const name = text(first(row, "campaign", "campaign_name"));
      if (!accountId || !name) return null;

      const conversions = first(row, "actions_omni_purchase", "conversions");
      const conversionValue = first(
        row,
        "action_values_omni_purchase",
        "conversions_value",
      );

      return {
        provider,
        accountId,
        accountName: text(first(row, "account_name")) ?? accountId,
        currency: text(
          first(row, "account_currency", "currency_code", "currency"),
        ),
        name,
        campaignId: text(row.campaign_id),
        status: text(first(row, "campaign_status", "effective_status")),
        nativeObjective: text(
          first(row, "objective", "advertising_channel_type"),
        ),
        conActividad: true,
        reach: optionalNumber(row.reach),
        linkClicks: optionalNumber(row.actions_link_click),
        engagement: optionalNumber(row.actions_post_engagement),
        leads: optionalNumber(row.actions_lead),
        purchases: optionalNumber(row.actions_omni_purchase),
        spendMicros: toMicros(first(row, "spend", "cost")),
        clicks: Math.round(number(row.clicks)),
        impressions: Math.round(number(row.impressions)),
        conversions: conversions === null ? null : number(conversions),
        conversionValueMicros:
          conversionValue === null ? null : toMicros(conversionValue),
        dailyBudgetMicros: presupuestoDiarioMicros(row, provider),
      };
    })
    .filter((row): row is WindsorCampaign => row !== null);
}

/**
 * Presupuesto diario en micros, verificado por plataforma.
 *
 * Google entrega `budget_amount` ya en la moneda de la cuenta, igual que
 * `cost` — se convierte igual. Meta entrega `campaign_daily_budget` en la
 * unidad menor (centavos), la misma unidad que exige de vuelta al escribir
 * un presupuesto nuevo — en monedas con centavos hay que multiplicar por
 * 10.000, no por 1.000.000; en las que no los tienen (CLP, COP…), por
 * 1.000.000 (ver `lib/monedas.ts`).
 */
function presupuestoDiarioMicros(
  row: Row,
  provider: WindsorProvider,
): number | null {
  if (provider === "google") {
    const valor = row.budget_amount;
    return valor === null || valor === undefined || valor === ""
      ? null
      : toMicros(valor);
  }
  if (provider === "meta") {
    const valor = row.campaign_daily_budget;
    if (valor === null || valor === undefined || valor === "") return null;
    // La unidad menor depende de la moneda de la cuenta: en CLP, COP y otras
    // sin centavos el valor ya viene en pesos enteros, no en centavos.
    return Math.round(
      (number(valor) * 1_000_000) / unidadesMenoresMeta(text(row.currency)),
    );
  }
  return null;
}

/**
 * Conversiones de Google Ads segmentadas por acción, por cuenta.
 *
 * Sin esto el tablero muestra vistas de página como resultados de negocio.
 * Se pide sin fecha: interesa el total del período, una fila por acción.
 *
 * Solo aplica a Google. Meta ya entrega `actions_purchase`, que es una acción
 * concreta y no una suma de todo.
 */
export async function fetchGoogleConversionBreakdown(
  rangeStart: string,
  rangeEnd: string,
): Promise<{
  porCuenta: Map<string, ConversionBreakdown>;
  /** Clave `cuenta::campaña`. Permite dar el resultado correcto por campaña. */
  porCampana: Map<string, ConversionBreakdown>;
}> {
  if (!windsorConfigured()) throw new WindsorError("Falta WINDSOR_API_KEY");

  const db = getRawDb();
  const cacheId = `${CONVERSION_CACHE_KEY}:${rangeStart}:${rangeEnd}`;
  const cached = await db
    .prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1")
    .bind(cacheId)
    .first<{ value: string; updated_at: number }>();

  if (cached && Date.now() - Number(cached.updated_at) < CACHE_TTL_MS) {
    const guardado = JSON.parse(cached.value) as {
      porCuenta: Record<string, ConversionBreakdown>;
      porCampana: Record<string, ConversionBreakdown>;
    };
    return {
      porCuenta: new Map(Object.entries(guardado.porCuenta ?? {})),
      porCampana: new Map(Object.entries(guardado.porCampana ?? {})),
    };
  }

  // Se pide `campaign_name` junto con la categoría: Google devuelve una fila
  // por acción y campaña, que es lo que permite separar compras de vistas de
  // página sin perder a qué campaña pertenece cada una.
  const raw = await requestWindsor(
    "google",
    [
      "account_id",
      "campaign_name",
      "conversion_action_category",
      "conversion_action_name",
      "conversions",
    ],
    rangeStart,
    rangeEnd,
  );

  const porCuenta = new Map<string, ConversionBreakdown>();
  const porCampana = new Map<string, ConversionBreakdown>();
  for (const row of raw) {
    const accountId = text(first(row, "account_id"));
    if (!accountId) continue;
    const categoria = text(row.conversion_action_category);
    const valor = number(row.conversions);

    const cuenta = porCuenta.get(accountId) ?? emptyBreakdown();
    addToBreakdown(cuenta, categoria, valor);
    porCuenta.set(accountId, cuenta);

    const campana = text(row.campaign_name);
    if (campana) {
      const clave = `${accountId}::${campana}`;
      const detalle = porCampana.get(clave) ?? emptyBreakdown();
      addToBreakdown(detalle, categoria, valor);
      porCampana.set(clave, detalle);
    }
  }

  await db
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .bind(
      cacheId,
      JSON.stringify({
        porCuenta: Object.fromEntries(porCuenta),
        porCampana: Object.fromEntries(porCampana),
      }),
      Date.now(),
    )
    .run();

  return { porCuenta, porCampana };
}

/**
 * Una fila por anuncio, con sus niveles superiores resueltos.
 *
 * Es la base de la vista tipo administrador de anuncios: campaña, conjunto (o
 * grupo, en Google) y anuncio, iguales entre plataformas aunque cada una los
 * llame distinto.
 *
 * Dos casos que no se pueden ignorar:
 *   - Performance Max no tiene grupo ni anuncio: `adsetName` y `adName` vienen
 *     en null y la fila representa la campaña entera.
 *   - Los anuncios responsivos de búsqueda traen todos sus títulos concatenados
 *     con "|" en `ad_name`; se guarda entero y la interfaz decide qué mostrar.
 */
export type WindsorAd = {
  provider: Platform;
  accountId: string;
  accountName: string;
  currency: string | null;
  campaignName: string;
  /** Id nativo de la campaña. Ver el porqué en `WindsorCampaign.campaignId`. */
  campaignId: string | null;
  adsetName: string | null;
  /** Id nativo del conjunto (`ad_group_id` en Google, `adset_id` en Meta). */
  adsetId: string | null;
  adName: string | null;
  /** Id nativo del anuncio. */
  adId: string | null;
  /**
   * Botón del anuncio en Meta (`WHATSAPP_MESSAGE`, `CALL_NOW`, `MESSAGE_PAGE`,
   * `LEARN_MORE`…). `null` en Google o si Windsor no lo trae. Es el único dato
   * de mensajería que Windsor entrega: el número de WhatsApp en sí no viaja.
   */
  callToAction?: string | null;
  status: string | null;
  spendMicros: number;
  impressions: number;
  clicks: number;
  reach: number | null;
  linkClicks: number | null;
  engagement: number | null;
  leads: number | null;
  purchases: number | null;
  conversions: number | null;
  /**
   * Miniatura real de la pieza, tal como la sirve Meta (`thumbnail_url`,
   * tabla "Ad" — verificado con `get_fields`, no es un supuesto). `null` en
   * Google o si Windsor no la trae. A diferencia de `link_url` — el destino
   * del anuncio —, esta sí llega poblada de forma consistente: es lo único
   * verificado que permite ver la pieza real, no una maqueta.
   */
  thumbnailUrl?: string | null;
  /**
   * false: la entidad existe en la cuenta pero no tuvo actividad en el rango.
   *
   * Sus métricas valen cero porque la plataforma no reporta nada para ella, no
   * porque haya gastado cero. La interfaz debe mostrar "—", nunca un 0 que se
   * leería como "no rindió".
   */
  conActividad: boolean;
};

/** Anuncios y conjuntos del rango, completados con el catálogo. */
export async function fetchWindsorAds(
  rangeStart: string,
  rangeEnd: string,
): Promise<WindsorAd[]> {
  const [conMetricas, catalogo] = await Promise.all([
    fetchAnunciosConMetricas(rangeStart, rangeEnd),
    fetchWindsorCatalog(),
  ]);
  return fusionarConCatalogo(catalogo.anuncios, conMetricas, claveAnuncio).sort(
    (a, b) => b.spendMicros - a.spendMicros,
  );
}

async function fetchAnunciosConMetricas(
  rangeStart: string,
  rangeEnd: string,
): Promise<WindsorAd[]> {
  if (!windsorConfigured()) throw new WindsorError("Falta WINDSOR_API_KEY");

  const db = getRawDb();
  const cacheId = `${ADS_CACHE_KEY}:${rangeStart}:${rangeEnd}`;
  const cached = await db
    .prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1")
    .bind(cacheId)
    .first<{ value: string; updated_at: number }>();

  if (cached && Date.now() - Number(cached.updated_at) < CACHE_TTL_MS) {
    return JSON.parse(cached.value) as WindsorAd[];
  }

  const perProvider = await Promise.all(
    ACTIVE_PLATFORMS.map(async (provider) => {
      const raw = await requestWindsor(
        provider,
        PLATFORM[provider].camposAnuncio,
        rangeStart,
        rangeEnd,
      );
      return toAds(raw, provider);
    }),
  );
  const ads = perProvider.flat().sort((a, b) => b.spendMicros - a.spendMicros);

  await db
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .bind(cacheId, JSON.stringify(ads), Date.now())
    .run();

  return ads;
}

function toAds(raw: Row[], provider: Platform): WindsorAd[] {
  const merged = new Map<string, WindsorAd>();

  for (const row of raw) {
    const accountId = text(first(row, "account_id"));
    const campaignName = text(first(row, "campaign", "campaign_name"));
    if (!accountId || !campaignName) continue;

    const adsetName = text(first(row, "adset_name", "ad_group_name"));
    const adName = text(row.ad_name);
    const clave = `${accountId}::${campaignName}::${adsetName ?? ""}::${adName ?? ""}`;

    const actual = merged.get(clave);
    const fila: WindsorAd = {
      provider,
      accountId,
      accountName: text(first(row, "account_name")) ?? accountId,
      currency: text(first(row, "account_currency", "currency_code", "currency")),
      campaignName,
      campaignId: text(row.campaign_id),
      adsetName,
      adsetId: text(first(row, "adset_id", "ad_group_id")),
      adName,
      adId: text(row.ad_id),
      callToAction: text(row.call_to_action_type),
      status: text(first(row, "effective_status", "ad_group_ad_status")),
      spendMicros: toMicros(first(row, "spend", "cost")),
      impressions: Math.round(number(row.impressions)),
      clicks: Math.round(number(row.clicks)),
      reach: optionalNumber(row.reach),
      linkClicks: optionalNumber(row.actions_link_click),
      engagement: optionalNumber(row.actions_post_engagement),
      leads: optionalNumber(row.actions_lead),
      purchases: optionalNumber(row.actions_omni_purchase),
      conversions: optionalNumber(row.conversions),
      thumbnailUrl: text(row.thumbnail_url),
      conActividad: true,
    };

    if (!actual) {
      merged.set(clave, fila);
      continue;
    }
    // Windsor puede partir un anuncio en varias filas, igual que las campañas.
    actual.spendMicros += fila.spendMicros;
    actual.impressions += fila.impressions;
    actual.clicks += fila.clicks;
    actual.linkClicks = addNullable(actual.linkClicks, fila.linkClicks);
    actual.engagement = addNullable(actual.engagement, fila.engagement);
    actual.leads = addNullable(actual.leads, fila.leads);
    actual.purchases = addNullable(actual.purchases, fila.purchases);
    actual.conversions = addNullable(actual.conversions, fila.conversions);
    actual.reach =
      actual.reach === null || fila.reach === null
        ? (actual.reach ?? fila.reach)
        : Math.max(actual.reach, fila.reach);
    actual.campaignId = actual.campaignId ?? fila.campaignId;
    actual.adsetId = actual.adsetId ?? fila.adsetId;
    actual.adId = actual.adId ?? fila.adId;
    actual.thumbnailUrl = actual.thumbnailUrl ?? fila.thumbnailUrl;
  }

  return [...merged.values()];
}

/**
 * Contenido orgánico real de una Página de Facebook o cuenta de Instagram —
 * lo que el equipo puede elegir como pieza al crear un anuncio, igual que
 * "usar publicación existente" en Meta Ads Manager.
 *
 * Verificado por prueba directa contra el workspace real de Windsor (no
 * documentado en ningún lado): `facebook_organic` da `type` (photo / album /
 * video_inline) y no distingue Reel de video de feed por ese campo — un Reel
 * se reconoce porque su `permalink_url` contiene "/reel/". `instagram` sí
 * separa Reel de Feed en `media_product_type`, y trae Historias en una
 * familia de campos aparte (`story_*`) que no comparte fila con `media_*`.
 */
export type OrganicPost = {
  platform: "facebook" | "instagram";
  accountId: string;
  id: string;
  createdAt: string | null;
  permalink: string;
  mediaUrl: string;
  caption: string | null;
  format: "reel" | "story" | "carousel" | "image" | "video";
  /**
   * Reacciones + comentarios + compartidos (o interacciones, en historias) —
   * la misma cifra que ya se ve en la plataforma. `null` cuando Windsor no la
   * trae para ese tipo de contenido. Existe para que, al elegir con qué
   * publicación armar un anuncio, se note a simple vista cuál ya viene
   * funcionando orgánicamente — no solo la fecha o la miniatura.
   */
  engagement: number | null;
};

const ORGANIC_CACHE_KEY = "windsor_organico_v2";
/**
 * Contenido nuevo no exige la frescura de las métricas de gasto: dos horas de
 * caché evitan golpear Windsor en cada apertura del selector sin hacer
 * esperar a alguien que publicó hace un minuto y quiere usarlo ya.
 */
const ORGANIC_TTL_MS = 2 * 60 * 60 * 1000;

function formatoFacebook(
  tipo: string | null,
  permalink: string,
): OrganicPost["format"] {
  if (permalink.includes("/reel/")) return "reel";
  if (tipo === "album") return "carousel";
  if (tipo === "video_inline") return "video";
  return "image";
}

function formatoInstagram(
  mediaType: string | null,
  productType: string | null,
): OrganicPost["format"] {
  if (productType === "REELS" || mediaType === "REELS") return "reel";
  if (mediaType === "CAROUSEL_ALBUM") return "carousel";
  if (mediaType === "VIDEO") return "video";
  return "image";
}

async function conCache(
  cacheId: string,
  calcular: () => Promise<OrganicPost[]>,
): Promise<OrganicPost[]> {
  const db = getRawDb();
  const cached = await db
    .prepare("SELECT value, updated_at FROM app_meta WHERE key = ? LIMIT 1")
    .bind(cacheId)
    .first<{ value: string; updated_at: number }>();
  if (cached && Date.now() - Number(cached.updated_at) < ORGANIC_TTL_MS) {
    return JSON.parse(cached.value) as OrganicPost[];
  }

  const posts = await calcular();
  await db
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .bind(cacheId, JSON.stringify(posts), Date.now())
    .run();
  return posts;
}

/** Publicaciones reales de una Página de Facebook, más recientes primero. */
export async function fetchFacebookPosts(
  pageId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<OrganicPost[]> {
  if (!windsorConfigured()) throw new WindsorError("Falta WINDSOR_API_KEY");

  return conCache(
    `${ORGANIC_CACHE_KEY}:facebook:${pageId}:${rangeStart}:${rangeEnd}`,
    async () => {
      const raw = await requestWindsorConnector(
        "facebook_organic",
        [
          "account_id",
          "account_name",
          "post_id",
          "message",
          "created_time",
          "permalink_url",
          "full_picture",
          "type",
          // Verificado contra el MCP de Windsor (get_fields, tabla "Post",
          // igual que post_id/permalink_url): reacciones + comentarios +
          // compartidos, la misma cifra que muestra Facebook.
          "post_engagements",
        ],
        rangeStart,
        rangeEnd,
        { selectAccounts: pageId },
      );

      // El nombre real de la página viaja gratis en esta misma consulta
      // (`account_name`) — se guarda aparte para el paso de Identidad del
      // Constructor sin pedirle a Windsor una consulta extra solo por eso.
      void guardarNombreDeCuenta("facebook", pageId, text(raw[0]?.account_name));

      return raw
        .map((row): OrganicPost | null => {
          const id = text(row.post_id);
          const permalink = text(row.permalink_url);
          const mediaUrl = text(row.full_picture);
          // Sin imagen no sirve como pieza de anuncio: no hay qué mostrar.
          if (!id || !permalink || !mediaUrl) return null;
          return {
            platform: "facebook",
            accountId: pageId,
            id,
            createdAt: text(row.created_time),
            permalink,
            mediaUrl,
            caption: text(row.message),
            format: formatoFacebook(text(row.type), permalink),
            engagement: optionalNumber(row.post_engagements),
          };
        })
        .filter((post): post is OrganicPost => post !== null)
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    },
  );
}

/**
 * Publicaciones e historias reales de una cuenta de Instagram, más recientes
 * primero.
 *
 * Windsor entrega historias y publicaciones en familias de campos separadas
 * (`story_*` contra `media_*`); una fila trae una u otra, nunca las dos.
 */
export async function fetchInstagramMedia(
  accountId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<OrganicPost[]> {
  if (!windsorConfigured()) throw new WindsorError("Falta WINDSOR_API_KEY");

  return conCache(
    `${ORGANIC_CACHE_KEY}:instagram:${accountId}:${rangeStart}:${rangeEnd}`,
    async () => {
      const raw = await requestWindsorConnector(
        "instagram",
        [
          "account_id",
          "account_name",
          "username",
          "media_id",
          "media_caption",
          "timestamp",
          "media_permalink",
          "media_url",
          "media_type",
          "media_product_type",
          "media_thumbnail_url",
          "story_id",
          "story_permalink",
          "story_thumbnail_url",
          "story_timestamp",
          // Verificado contra el MCP de Windsor (get_fields): likes +
          // comentarios + guardados + compartidos de la publicación.
          // `carousel_album_engagement` es la misma cifra pero para el
          // carrusel completo — `media_engagement` no siempre la trae.
          "media_engagement",
          "carousel_album_engagement",
          // Para historias no existe un equivalente a "engagement": esto es
          // lo más cercano (reacciones + respuestas + salidas navegando).
          "story_interactions",
        ],
        rangeStart,
        rangeEnd,
        { selectAccounts: accountId },
      );

      void guardarNombreDeCuenta(
        "instagram",
        accountId,
        text(raw[0]?.account_name),
        text(raw[0]?.username),
      );

      return raw
        .map((row): OrganicPost | null => {
          const storyId = text(row.story_id);
          if (storyId) {
            const permalink = text(row.story_permalink);
            const mediaUrl = text(row.story_thumbnail_url);
            if (!permalink || !mediaUrl) return null;
            return {
              platform: "instagram",
              accountId,
              id: storyId,
              createdAt: text(row.story_timestamp),
              permalink,
              mediaUrl,
              caption: null,
              format: "story",
              engagement: optionalNumber(row.story_interactions),
            };
          }

          const id = text(row.media_id);
          const permalink = text(row.media_permalink);
          const mediaUrl = text(first(row, "media_url", "media_thumbnail_url"));
          if (!id || !permalink || !mediaUrl) return null;
          return {
            platform: "instagram",
            accountId,
            id,
            createdAt: text(row.timestamp),
            permalink,
            mediaUrl,
            caption: text(row.media_caption),
            format: formatoInstagram(
              text(row.media_type),
              text(row.media_product_type),
            ),
            engagement: optionalNumber(
              first(row, "media_engagement", "carousel_album_engagement"),
            ),
          };
        })
        .filter((post): post is OrganicPost => post !== null)
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    },
  );
}

const IDENTIDAD_CACHE_KEY = "windsor_identidad_v1";

export type IdentidadMeta = {
  pageName: string | null;
  instagramName: string | null;
  instagramUsername: string | null;
};

/**
 * Guarda el nombre real de una página/cuenta detrás de un post o una
 * publicación que de todos modos ya se estaba trayendo — nunca dispara una
 * consulta propia a Windsor. Una primera versión de esto sí pedía su propia
 * consulta (`facebook_organic`/`instagram`, dos años de rango) y duplicó el
 * tiempo de `/api/creatividades` en frío: de ~93 s a más de 2 min, medido en
 * vivo. Por eso ahora es un efecto secundario de `fetchFacebookPosts` /
 * `fetchInstagramMedia` en vez de una función que se llama aparte.
 */
async function guardarNombreDeCuenta(
  plataforma: "facebook" | "instagram",
  accountId: string,
  nombre: string | null,
  usuario: string | null = null,
): Promise<void> {
  if (!nombre && !usuario) return;
  try {
    const db = getRawDb();
    await db
      .prepare(
        `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .bind(
        `${IDENTIDAD_CACHE_KEY}:${plataforma}:${accountId}`,
        JSON.stringify({ nombre, usuario }),
        Date.now(),
      )
      .run();
  } catch (error) {
    // Es un dato de cortesía para la pantalla de Identidad — perderlo no
    // debe tumbar la lectura real de publicaciones que lo trajo de paso.
    console.error("WiWO.ADS guardarNombreDeCuenta", error);
  }
}

/**
 * Nombre real de la Página de Facebook y de la cuenta de Instagram detrás de
 * un `pageId`/`instagramId` — para mostrar "Colbún Energía" y
 * "@energiacolbun" en vez del id numérico crudo en el paso de Identidad del
 * Constructor. Nunca golpea Windsor: solo lee lo que
 * `fetchFacebookPosts`/`fetchInstagramMedia` ya haya guardado de paso la
 * última vez que alguien abrió el selector de publicaciones de esa cuenta.
 * `null` si eso todavía no pasó — la pantalla se cae de vuelta al id crudo,
 * nunca inventa un nombre.
 */
export async function fetchIdentidadMeta(
  pageId: string | null,
  instagramId: string | null,
): Promise<IdentidadMeta> {
  const vacio: IdentidadMeta = { pageName: null, instagramName: null, instagramUsername: null };
  if (!pageId && !instagramId) return vacio;

  const db = getRawDb();
  const claves = [
    pageId ? `${IDENTIDAD_CACHE_KEY}:facebook:${pageId}` : null,
    instagramId ? `${IDENTIDAD_CACHE_KEY}:instagram:${instagramId}` : null,
  ].filter((k): k is string => k !== null);
  if (claves.length === 0) return vacio;

  const { results } = await db
    .prepare(
      `SELECT key, value FROM app_meta WHERE key IN (${claves.map(() => "?").join(",")})`,
    )
    .bind(...claves)
    .all<{ key: string; value: string }>();

  const porClave = new Map((results ?? []).map((r) => [r.key, JSON.parse(r.value) as { nombre: string | null; usuario: string | null }]));
  const pagina = pageId ? porClave.get(`${IDENTIDAD_CACHE_KEY}:facebook:${pageId}`) : null;
  const instagram = instagramId ? porClave.get(`${IDENTIDAD_CACHE_KEY}:instagram:${instagramId}`) : null;

  return {
    pageName: pagina?.nombre ?? null,
    instagramName: instagram?.nombre ?? null,
    instagramUsername: instagram?.usuario ?? null,
  };
}

/**
 * Ejecuta una acción de escritura en la plataforma, vía Windsor.
 *
 * Este es el único punto del sistema que cambia algo fuera de WiWO.ADS. Todo
 * lo demás lee. La ruta que lo llama exige la capacidad `aprobar_cambios` y
 * una confirmación explícita; acá no hay ningún guardarraíl adicional, así que
 * no debe llamarse desde ningún otro lado.
 *
 * El endpoint se descubrió probando con una acción inexistente —que no puede
 * ejecutar nada— hasta que el error dejó de hablar de campos faltantes:
 *
 *   POST https://connectors.windsor.ai/{conector}/actions?api_key=…
 *   { "account": "<id de cuenta>", "action": "<id de acción>", "params": {…} }
 *
 * No se reintenta nunca. Un reintento sobre una creación que en realidad sí
 * salió deja dos campañas iguales, y no hay forma de distinguir un timeout de
 * una respuesta perdida.
 */
export type WindsorActionResult = {
  ok: boolean;
  /** Respuesta cruda, para poder mostrar y registrar exactamente qué pasó. */
  raw: unknown;
  error: string | null;
};

export async function executeWindsorAction(
  provider: WindsorProvider,
  accountId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<WindsorActionResult> {
  if (!windsorConfigured()) throw new WindsorError("Falta WINDSOR_API_KEY");

  const connector = PLATFORM[provider].connector;
  const url = new URL(`${API_BASE}/${connector}/actions`);
  url.searchParams.set("api_key", env.WINDSOR_API_KEY!);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ account: accountId, action, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Un timeout acá es ambiguo a propósito: puede que la plataforma sí lo
    // haya creado. Se informa como fallo pero sin reintentar.
    return {
      ok: false,
      raw: null,
      error: `Sin respuesta de Windsor en ${action}: ${
        error instanceof Error ? error.message : String(error)
      }. Revisa en la plataforma antes de volver a intentarlo.`,
    };
  }

  const texto = await response.text();
  let cuerpo: unknown = texto;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    // Se deja el texto crudo: sirve igual para el registro.
  }

  if (!response.ok) {
    const mensaje =
      cuerpo && typeof cuerpo === "object" && "error" in cuerpo
        ? String((cuerpo as { error: unknown }).error)
        : `Windsor respondió ${response.status}`;
    return { ok: false, raw: cuerpo, error: mensaje };
  }

  return { ok: true, raw: cuerpo, error: null };
}

export { idDeResultado, idEnTextoLibre } from "@/lib/ids-de-resultado";
