import { getRawDb } from "@/db";

export type PerformanceMode = "setup" | "connected" | "live" | "stale";

export type PerformanceAccountSummary = {
  id: string;
  provider: "google" | "meta";
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
};

export type CurrencyTotal = {
  currency: string;
  spendMicros: number;
  conversionValueMicros: number | null;
};

export type PerformanceSnapshot = {
  generatedAt: number;
  mode: PerformanceMode;
  rangeStart: string;
  rangeEnd: string;
  selectedAccountCount: number;
  accountsWithData: number;
  accounts: PerformanceAccountSummary[];
  currencyTotals: CurrencyTotal[];
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  dataThrough: string | null;
  lastSyncedAt: number | null;
};

type PerformanceRow = {
  id: string;
  provider: "google" | "meta";
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

export async function getPerformanceSnapshot(
  userId: string,
  now = new Date(),
): Promise<PerformanceSnapshot> {
  const rangeEnd = isoDate(now);
  const rangeStart = `${rangeEnd.slice(0, 8)}01`;
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
    .bind(rangeStart, rangeEnd, userId)
    .all<PerformanceRow>();

  const accounts = result.results.map(toAccountSummary);
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
    rangeStart,
    rangeEnd,
    selectedAccountCount: accounts.length,
    accountsWithData: withData.length,
    accounts,
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
