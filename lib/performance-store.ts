import { getRawDb } from "@/db";
import {
  RANGO_POR_DEFECTO,
  resolverRango,
  type Rango,
  type RangoId,
} from "@/lib/rangos";
import { can, type Actor } from "@/lib/permisos";
import {
  ACTIVE_PLATFORMS,
  PLATFORM,
  type Platform,
} from "@/lib/plataformas";
import {
  buildPortfolios,
  portfolioIdFor,
  type PortfolioIndex,
  type PortfolioSummary,
} from "@/lib/portafolios";
import { accountIndex } from "@/lib/portafolios-store";
import { valorPorObjetivo, type ConversionBreakdown } from "@/lib/conversiones";
import {
  objetivoDeNombre,
  objetivoDePlataforma,
  OBJETIVO_LABELS,
  RESULTADO_POR_OBJETIVO,
  type Objetivo,
} from "@/lib/objetivos";
import {
  fetchGoogleConversionBreakdown,
  fetchWindsorAds,
  fetchWindsorCampaigns,
  fetchWindsorDaily,
  windsorConfigured,
  type WindsorAccountDaily,
  type WindsorAd,
  type WindsorCampaign,
} from "@/lib/windsor";

export type PerformanceMode = "setup" | "connected" | "live" | "stale";

export type PerformanceAccountSummary = {
  id: string;
  provider: Platform;
  name: string;
  currency: string | null;
  providerStatus: string | null;
  connectionStatus: "connected" | "needs_attention";
  metricsStatus: "not_synced" | "syncing" | "ready" | "error";
  issue: string | null;
  hasData: boolean;
  spendMicros: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  conversionValueMicros: number | null;
  dataFrom: string | null;
  dataThrough: string | null;
  lastSyncedAt: number | null;
  /**
   * Desglose de conversiones por tipo de acción. Solo Google.
   *
   * Existe porque `conversions` a secas mezcla compras con vistas de página:
   * sin este desglose, el tablero reportaría tráfico como resultados.
   */
  conversionBreakdown: ConversionBreakdown | null;
};

export type CurrencyTotal = {
  currency: string;
  spendMicros: number;
  conversionValueMicros: number | null;
};

/** Totales de una plataforma. El gasto va por moneda: mezclarlas miente. */
export type ProviderTotal = {
  provider: Platform;
  label: string;
  accountCount: number;
  accountsWithData: number;
  currencyTotals: CurrencyTotal[];
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  conversionValueMicros: number | null;
};

/**
 * Campaña con su cuenta y su objetivo ya resueltos.
 *
 * El objetivo sale de la sigla del nombre (`[LDS] Cliente · …`), que es el
 * método principal de MetriQ. `objetivo: null` significa que la campaña no
 * sigue la convención y hay que renombrarla, no que no tenga objetivo.
 */
export type CampaignSummary = WindsorCampaign & {
  accountKey: string;
  objetivo: Objetivo | null;
  /** true cuando el objetivo se dedujo del campo de la plataforma. */
  objetivoDeducido: boolean;
  /** Desglose por tipo de acción. Solo Google. */
  conversionBreakdown: ConversionBreakdown | null;
};

/**
 * Totales de una familia de objetivo.
 *
 * Cada objetivo se mide con su propia métrica: en awareness la interacción, en
 * leads el formulario, en ventas la compra. Reportar una sola cifra de
 * "resultados" para todos mezcla cosas que no se comparan entre sí.
 */
export type ObjectiveTotal = {
  objetivo: Objetivo;
  label: string;
  resultLabel: string;
  campaigns: number;
  currencyTotals: CurrencyTotal[];
  impressions: number;
  clicks: number;
  /** La métrica propia del objetivo. null: no se mide con conversiones. */
  result: number | null;
};

/** Fila de anuncio con su cuenta resuelta, para filtrar por portafolio. */
export type AdSummary = WindsorAd & {
  accountKey: string;
  objetivo: Objetivo | null;
};

export type PerformanceSnapshot = {
  generatedAt: number;
  mode: PerformanceMode;
  rangeStart: string;
  rangeEnd: string;
  /** Periodo elegido, para que la interfaz no tenga que deducirlo. */
  rango: { id: RangoId; label: string; enCurso: boolean };
  selectedAccountCount: number;
  accountsWithData: number;
  accounts: PerformanceAccountSummary[];
  campaigns: CampaignSummary[];
  ads: AdSummary[];
  byObjective: ObjectiveTotal[];
  portfolios: PortfolioSummary[];
  byProvider: ProviderTotal[];
  currencyTotals: CurrencyTotal[];
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  dataThrough: string | null;
  lastSyncedAt: number | null;
};

type PerformanceRow = {
  id: string;
  provider: Platform;
  name: string;
  currency: string | null;
  account_status: string | null;
  connection_status: "connected" | "needs_attention";
  metrics_status: PerformanceAccountSummary["metricsStatus"];
  connection_error: string | null;
  metrics_error: string | null;
  metric_rows: number;
  spend_micros: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  conversion_value_micros: number | null;
  data_from: string | null;
  data_through: string | null;
  last_synced_at: number | null;
};

/**
 * Qué partes del snapshot se necesitan.
 *
 * Campañas y anuncios son las lecturas caras: juntas pesan 150 KB de caché que
 * hay que leer y convertir. Las pantallas de clientes y de conexiones solo
 * necesitan las cuentas, así que piden lo mínimo en vez de armar todo.
 */
export type SnapshotOptions = {
  incluirCampanas?: boolean;
  incluirAnuncios?: boolean;
  /** Periodo a medir. Por defecto, el mes en curso. */
  rango?: RangoId;
};

export async function getPerformanceSnapshot(
  actor: Actor,
  now = new Date(),
  options: SnapshotOptions = {},
): Promise<PerformanceSnapshot> {
  const rango = resolverRango(options.rango ?? RANGO_POR_DEFECTO, now);
  const rangeStart = rango.desde;
  const rangeEnd = rango.hasta;

  // Con Windsor configurado, la lectura sale de ahí: cubre más plataformas y
  // no espera los permisos nativos. El camino OAuth queda intacto de respaldo.
  if (windsorConfigured()) {
    return windsorSnapshot(rango, now, actor, {
      incluirCampanas: options.incluirCampanas ?? true,
      incluirAnuncios: options.incluirAnuncios ?? true,
      rango: rango.id,
    });
  }

  const result = await getRawDb()
    .prepare(
      `SELECT ia.id, ic.provider, ia.name,
        COALESCE(ia.currency, MAX(am.currency)) AS currency,
        ia.account_status, ic.status AS connection_status, ia.metrics_status,
        ic.last_error AS connection_error,
        ia.metrics_last_error AS metrics_error,
        COUNT(am.id) AS metric_rows,
        SUM(am.spend_micros) AS spend_micros,
        SUM(am.impressions) AS impressions,
        SUM(am.clicks) AS clicks,
        SUM(am.conversions) AS conversions,
        SUM(am.conversion_value_micros) AS conversion_value_micros,
        MIN(am.metric_date) AS data_from,
        ia.metrics_last_date AS data_through,
        ia.metrics_last_synced_at AS last_synced_at
       FROM integration_accounts ia
       INNER JOIN integration_connections ic ON ic.id = ia.connection_id
       LEFT JOIN account_metrics_daily am
         ON am.integration_account_id = ia.id
        AND am.metric_date BETWEEN ? AND ?
       WHERE ic.user_id = ?
         AND ia.selected = 1
         AND ia.is_available = 1
         AND ia.account_type = 'ads'
         AND ia.is_manager = 0
       GROUP BY ia.id, ic.provider, ia.name, ia.currency,
         ia.account_status, ic.status, ia.metrics_status,
         ic.last_error, ia.metrics_last_error, ia.metrics_last_date,
         ia.metrics_last_synced_at
       ORDER BY ia.name COLLATE NOCASE`,
    )
    .bind(rangeStart, rangeEnd, actor.id)
    .all<PerformanceRow>();

  return assembleSnapshot(
    result.results.map(toAccountSummary),
    rango,
    now,
    [],
    await accountIndex(),
  );
}

/**
 * Arma el snapshot a partir de las cuentas, venga de donde venga el dato.
 *
 * Las monedas se agrupan por separado: sumar CLP con USD daría un total que
 * no significa nada.
 */
function assembleSnapshot(
  accounts: PerformanceAccountSummary[],
  rango: Rango,
  now: Date,
  campaigns: CampaignSummary[] = [],
  index: PortfolioIndex = new Map(),
  ads: AdSummary[] = [],
): PerformanceSnapshot {
  const withData = accounts.filter((account) => account.hasData);
  const lastSyncedAt = minNumber(
    withData.map((account) => account.lastSyncedAt),
  );
  const dataThrough = minText(
    withData.map((account) => account.dataThrough),
  );
  const currencyTotals = new Map<string, CurrencyTotal>();
  for (const account of withData) {
    const currency = account.currency ?? "N/D";
    const current = currencyTotals.get(currency) ?? {
      currency,
      spendMicros: 0,
      conversionValueMicros: 0,
    };
    current.spendMicros += account.spendMicros ?? 0;
    current.conversionValueMicros =
      current.conversionValueMicros === null ||
      account.conversionValueMicros === null
        ? null
        : current.conversionValueMicros + account.conversionValueMicros;
    currencyTotals.set(currency, current);
  }

  const staleThreshold = now.getTime() - 26 * 60 * 60 * 1000;
  const completeAndCurrent = accounts.every(
    (account) =>
      account.hasData &&
      account.connectionStatus === "connected" &&
      account.metricsStatus === "ready" &&
      Boolean(account.lastSyncedAt && account.lastSyncedAt >= staleThreshold),
  );
  const mode: PerformanceMode =
    accounts.length === 0
      ? "setup"
      : withData.length === 0
        ? "connected"
        : completeAndCurrent
          ? "live"
          : "stale";

  return {
    generatedAt: now.getTime(),
    mode,
    rangeStart: rango.desde,
    rangeEnd: rango.hasta,
    rango: { id: rango.id, label: rango.label, enCurso: rango.enCurso },
    selectedAccountCount: accounts.length,
    accountsWithData: withData.length,
    accounts,
    campaigns,
    ads,
    byObjective: summarizeObjectives(campaigns),
    portfolios: buildPortfolios(accounts, index),
    byProvider: summarizeProviders(accounts),
    currencyTotals: [...currencyTotals.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
    impressions: nullableSum(withData.map((account) => account.impressions)),
    clicks: nullableSum(withData.map((account) => account.clicks)),
    conversions: nullableSum(withData.map((account) => account.conversions)),
    dataThrough,
    lastSyncedAt,
  };
}

/**
 * Agrupa las cuentas por plataforma para poder compararlas.
 *
 * El gasto nunca se suma entre monedas distintas: cada moneda queda como su
 * propia fila. Una plataforma sin cuentas no aparece.
 */
function summarizeProviders(
  accounts: PerformanceAccountSummary[],
): ProviderTotal[] {
  return ACTIVE_PLATFORMS
    .map((provider) => {
      const own = accounts.filter((account) => account.provider === provider);
      const withData = own.filter((account) => account.hasData);
      const totals = new Map<string, CurrencyTotal>();

      for (const account of withData) {
        const currency = account.currency ?? "—";
        const current = totals.get(currency) ?? {
          currency,
          spendMicros: 0,
          conversionValueMicros: null,
        };
        current.spendMicros += account.spendMicros ?? 0;
        if (account.conversionValueMicros !== null) {
          current.conversionValueMicros =
            (current.conversionValueMicros ?? 0) +
            account.conversionValueMicros;
        }
        totals.set(currency, current);
      }

      return {
        provider,
        label: PLATFORM[provider].label,
        accountCount: own.length,
        accountsWithData: withData.length,
        currencyTotals: [...totals.values()].sort((a, b) =>
          a.currency.localeCompare(b.currency),
        ),
        impressions: nullableSum(withData.map((a) => a.impressions)),
        clicks: nullableSum(withData.map((a) => a.clicks)),
        conversions: nullableSum(withData.map((a) => a.conversions)),
        conversionValueMicros: nullableSum(
          withData.map((a) => a.conversionValueMicros),
        ),
      };
    })
    .filter((total) => total.accountCount > 0);
}

function toAccountSummary(row: PerformanceRow): PerformanceAccountSummary {
  const hasData =
    Number(row.metric_rows) > 0 || row.metrics_status === "ready" ||
    row.last_synced_at !== null;
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    currency: row.currency,
    providerStatus: row.account_status,
    connectionStatus: row.connection_status,
    metricsStatus: row.metrics_status,
    issue:
      row.metrics_error ??
      (row.connection_status === "needs_attention"
        ? row.connection_error
        : null),
    hasData,
    spendMicros: hasData ? Number(row.spend_micros ?? 0) : null,
    impressions: hasData ? Number(row.impressions ?? 0) : null,
    clicks: hasData ? Number(row.clicks ?? 0) : null,
    conversions: hasData
      ? row.provider === "google"
        ? Number(row.conversions ?? 0)
        : row.conversions !== null
          ? Number(row.conversions)
          : null
      : null,
    conversionBreakdown: null,
    conversionValueMicros: hasData
      ? row.provider === "google"
        ? Number(row.conversion_value_micros ?? 0)
        : row.conversion_value_micros !== null
          ? Number(row.conversion_value_micros)
          : null
      : null,
    dataFrom: row.data_from,
    dataThrough: row.data_through,
    lastSyncedAt: row.last_synced_at ? Number(row.last_synced_at) : null,
  };
}

function nullableSum(values: Array<number | null>): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

function minNumber(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? Math.min(...present) : null;
}

function minText(values: Array<string | null>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length ? present.sort().at(0) ?? null : null;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Snapshot construido desde Windsor.
 *
 * Cada cuenta se arma agregando sus filas diarias del rango. Si Windsor no
 * responde, se devuelve modo "setup" en vez de ceros: un gasto de 0 se leería
 * como "no invirtió", y eso sería mentira.
 */
async function windsorSnapshot(
  rango: Rango,
  now: Date,
  actor: Actor,
  options: Required<SnapshotOptions>,
): Promise<PerformanceSnapshot> {
  const rangeStart = rango.desde;
  const rangeEnd = rango.hasta;

  // Las cuatro lecturas de Windsor son independientes entre sí — ninguna
  // necesita el resultado de otra para empezar a pedirse — así que se disparan
  // todas a la vez con Promise.allSettled.
  //
  // Antes iban una tras otra: diario, luego desglose de conversiones, luego
  // campañas, luego anuncios. Cuatro ida y vuelta secuenciales a Windsor, cada
  // una de 10 a 25 s en frío, sumaban hasta 99 s medidos al cambiar de mes. En
  // paralelo el total es el de la más lenta, no la suma de las cuatro.
  // allSettled y no all: que el desglose de Google falle no debe tumbar las
  // otras tres, que ya traían datos útiles.
  const [dailyResult, desgloseResult, campaignsResult, adsResult] =
    await Promise.allSettled([
      fetchWindsorDaily(rangeStart, rangeEnd),
      fetchGoogleConversionBreakdown(rangeStart, rangeEnd),
      options.incluirCampanas
        ? fetchWindsorCampaigns(rangeStart, rangeEnd)
        : Promise.resolve([] as WindsorCampaign[]),
      options.incluirAnuncios
        ? fetchWindsorAds(rangeStart, rangeEnd)
        : Promise.resolve([] as WindsorAd[]),
    ]);

  if (dailyResult.status === "rejected") {
    return assembleSnapshot([], rango, now);
  }
  const { rows, fetchedAt } = dailyResult.value;

  const grouped = new Map<string, WindsorAccountDaily[]>();
  for (const row of rows) {
    const key = `${row.provider}:${row.accountId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const accounts: PerformanceAccountSummary[] = [...grouped.entries()]
    .map(([key, daily]) => {
      const first = daily[0];
      const dates = daily.map((row) => row.date).sort();
      return {
        id: `windsor:${key}`,
        provider: first.provider,
        name: first.accountName,
        currency: daily.find((row) => row.currency)?.currency ?? null,
        providerStatus: null,
        connectionStatus: "connected" as const,
        metricsStatus: "ready" as const,
        issue: null,
        hasData: true,
        spendMicros: daily.reduce((sum, row) => sum + row.spendMicros, 0),
        impressions: daily.reduce((sum, row) => sum + row.impressions, 0),
        clicks: daily.reduce((sum, row) => sum + row.clicks, 0),
        conversions: daily.some((row) => row.conversions === null)
          ? null
          : daily.reduce((sum, row) => sum + (row.conversions ?? 0), 0),
        conversionValueMicros: daily.some(
          (row) => row.conversionValueMicros === null,
        )
          ? null
          : daily.reduce((sum, row) => sum + (row.conversionValueMicros ?? 0), 0),
        dataFrom: dates.at(0) ?? null,
        dataThrough: dates.at(-1) ?? null,
        lastSyncedAt: fetchedAt,
        conversionBreakdown: null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  // Alcance por persona: quien no ve todos los clientes solo recibe los
  // portafolios que tiene asignados. Se filtra acá, en el servidor, para que
  // una cuenta fuera de su alcance no llegue nunca al navegador.
  // Google: reemplazar el conteo crudo por el segmentado por acción. Sin esto
  // una cuenta de tráfico declara miles de "resultados" que son vistas.
  let porCampana = new Map<string, ConversionBreakdown>();
  if (desgloseResult.status === "fulfilled") {
    const desglose = desgloseResult.value;
    porCampana = desglose.porCampana;
    for (const account of accounts) {
      if (account.provider !== "google") continue;
      const externo = account.id.split(":").at(-1) ?? "";
      const detalle = desglose.porCuenta.get(externo);
      if (!detalle) continue;
      account.conversionBreakdown = detalle;
      account.conversions = Math.round(detalle.negocio * 100) / 100;
    }
  }
  // Si falla, se mantiene el conteo crudo y el desglose queda en null: la
  // interfaz lo marca como no verificado en vez de callarlo.

  // Cuentas sin actividad en el rango, pero que el catálogo sí conoce.
  //
  // Sin esto, una cuenta que no gastó nada en el periodo elegido desaparecía
  // del todo: no solo sus cifras salían en cero, sino que la cuenta —y el
  // cliente entero, si era su única cuenta— dejaba de existir para el resto
  // del sistema. MGC es el caso real: sus tres cuentas tienen 26 campañas en
  // el catálogo, pero ninguna gastó en el mes en curso, así que el cliente
  // completo desaparecía de "Clientes" y de todas las vistas que dependen de
  // `performance.portfolios`, incluido el administrador de anuncios.
  const conocidas = new Map<
    string,
    { accountId: string; provider: Platform; accountName: string; currency: string | null }
  >();
  if (campaignsResult.status === "fulfilled") {
    for (const c of campaignsResult.value) {
      conocidas.set(`${c.provider}:${c.accountId}`, c);
    }
  }
  if (adsResult.status === "fulfilled") {
    for (const a of adsResult.value) {
      const clave = `${a.provider}:${a.accountId}`;
      if (!conocidas.has(clave)) conocidas.set(clave, a);
    }
  }
  for (const [clave, cuenta] of conocidas) {
    if (grouped.has(clave)) continue; // ya tiene actividad real en el rango
    accounts.push({
      id: `windsor:${clave}`,
      provider: cuenta.provider,
      name: cuenta.accountName,
      currency: cuenta.currency,
      providerStatus: null,
      connectionStatus: "connected",
      metricsStatus: "not_synced",
      issue: null,
      // false, no null: no es que la métrica no se pudo leer, es que la
      // plataforma no reporta nada porque no hubo entrega en el rango.
      hasData: false,
      spendMicros: 0,
      impressions: 0,
      clicks: 0,
      conversions: null,
      conversionValueMicros: null,
      dataFrom: null,
      dataThrough: null,
      lastSyncedAt: fetchedAt,
      conversionBreakdown: null,
    });
  }
  accounts.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const index = await accountIndex();
  const visibles = allowedAccounts(accounts, actor, index);
  const clavesVisibles = new Set(visibles.map((account) => account.id));

  // Las campañas son un pedido aparte y agregado; si falla, el tablero sigue
  // mostrando el nivel de cuenta en vez de caerse entero.
  let campaigns: CampaignSummary[] = [];
  if (options.incluirCampanas && campaignsResult.status === "fulfilled") {
    campaigns = campaignsResult.value
      .map((row) => {
        const porSigla = objetivoDeNombre(row.name);
        const deducido = porSigla
          ? null
          : objetivoDePlataforma(row.provider, row.nativeObjective);
        const detalle =
          row.provider === "google"
            ? (porCampana.get(`${row.accountId}::${row.name}`) ?? null)
            : null;
        return {
          ...row,
          accountKey: `windsor:${row.provider}:${row.accountId}`,
          objetivo: porSigla ?? deducido,
          objetivoDeducido: !porSigla && deducido !== null,
          conversionBreakdown: detalle,
          // El resultado de la campaña, ya limpio de vistas de página.
          conversions: detalle
            ? Math.round(detalle.negocio * 100) / 100
            : row.conversions,
        };
      })
      .filter((row) => clavesVisibles.has(row.accountKey))
      .sort((a, b) => b.spendMicros - a.spendMicros);
  }

  // Nivel de anuncio: la base de la vista tipo administrador. Si falla, el
  // resto del tablero sigue funcionando sin ese detalle.
  let ads: AdSummary[] = [];
  if (options.incluirAnuncios && adsResult.status === "fulfilled") {
    ads = adsResult.value
      .map((row) => ({
        ...row,
        accountKey: `windsor:${row.provider}:${row.accountId}`,
        // Solo por sigla: el corte por anuncio no trae el objetivo nativo.
        objetivo: objetivoDeNombre(row.campaignName),
      }))
      .filter((row) => clavesVisibles.has(row.accountKey));
  }

  return assembleSnapshot(visibles, rango, now, campaigns, index, ads);
}

/**
 * Cuentas que esta persona puede ver.
 *
 * Un rol con "ver_todos_los_clientes" no se filtra. El resto solo ve las
 * cuentas de los portafolios que tenga asignados: sin asignaciones no ve nada,
 * que es el comportamiento seguro cuando alguien entra recién invitado.
 */
function allowedAccounts(
  accounts: PerformanceAccountSummary[],
  actor: Actor,
  index: PortfolioIndex,
): PerformanceAccountSummary[] {
  if (can(actor, "ver_todos_los_clientes")) return accounts;
  const permitidos = new Set(actor.portfolioIds);
  return accounts.filter((account) =>
    permitidos.has(portfolioIdFor(account, index)),
  );
}

/**
 * Agrupa las campañas por objetivo y calcula el resultado propio de cada uno.
 *
 * Meta reporta la métrica directamente; Google la obtiene de las categorías de
 * conversión que corresponden a ese objetivo. Las campañas sin sigla quedan
 * fuera: clasificarlas a ciegas las pondría en la familia equivocada.
 */
function summarizeObjectives(campaigns: CampaignSummary[]): ObjectiveTotal[] {
  const grupos = new Map<Objetivo, CampaignSummary[]>();
  for (const campaign of campaigns) {
    if (!campaign.objetivo) continue;
    // Las campañas que existen pero no entregaron en el rango quedan fuera de
    // este resumen: es el resumen del periodo. Contarlas diría "12 campañas de
    // ventas" cuando solo dos estuvieron al aire. En la tabla sí aparecen.
    if (!campaign.conActividad) continue;
    grupos.set(campaign.objetivo, [
      ...(grupos.get(campaign.objetivo) ?? []),
      campaign,
    ]);
  }

  return [...grupos.entries()]
    .map(([objetivo, items]) => {
      const totals = new Map<string, CurrencyTotal>();
      for (const item of items) {
        const currency = item.currency ?? "N/D";
        const actual = totals.get(currency) ?? {
          currency,
          spendMicros: 0,
          conversionValueMicros: null,
        };
        actual.spendMicros += item.spendMicros;
        totals.set(currency, actual);
      }

      let result: number | null = null;
      for (const item of items) {
        const valor =
          item.provider === "google"
            ? valorPorObjetivo(item.conversionBreakdown, objetivo)
            : metaResult(item, objetivo);
        if (valor === null) continue;
        result = (result ?? 0) + valor;
      }

      return {
        objetivo,
        label: OBJETIVO_LABELS[objetivo],
        resultLabel: RESULTADO_POR_OBJETIVO[objetivo],
        campaigns: items.length,
        currencyTotals: [...totals.values()].sort((a, b) =>
          a.currency.localeCompare(b.currency),
        ),
        impressions: items.reduce((sum, i) => sum + i.impressions, 0),
        clicks: items.reduce((sum, i) => sum + i.clicks, 0),
        result: result === null ? null : Math.round(result * 100) / 100,
      };
    })
    .sort((a, b) => b.campaigns - a.campaigns);
}

/** La métrica que Meta usa como resultado en cada familia. */
function metaResult(
  campaign: CampaignSummary,
  objetivo: Objetivo,
): number | null {
  if (objetivo === "AE") return campaign.engagement;
  if (objetivo === "TRF") return campaign.linkClicks;
  if (objetivo === "LDS") return campaign.leads;
  if (objetivo === "VTA") return campaign.purchases;
  // Otras conversiones: Meta las reporta como conversaciones iniciadas, un
  // campo que solo viene en el corte diario, no en el de campaña.
  return null;
}
