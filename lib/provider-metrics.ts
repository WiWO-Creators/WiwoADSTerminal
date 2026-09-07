export type ProviderMetricAccount = {
  integrationAccountId: string;
  externalId: string;
  name: string;
  currency: string | null;
  managerId: string | null;
};

export type DailyAccountMetric = {
  metricDate: string;
  currency: string | null;
  spendMicros: number;
  impressions: number;
  clicks: number;
  conversions: number | null;
  conversionValueMicros: number | null;
};

export type MetricDateRange = {
  start: string;
  end: string;
};

export class ProviderMetricsError extends Error {
  constructor(
    message: string,
    public readonly providerStatus: number,
    public readonly authorizationRequired = false,
  ) {
    super(message);
  }
}

export async function fetchGoogleDailyAccountMetrics({
  accessToken,
  account,
  range,
  developerToken,
  apiVersion,
}: {
  accessToken: string;
  account: ProviderMetricAccount;
  range: MetricDateRange;
  developerToken: string;
  apiVersion: string;
}): Promise<DailyAccountMetric[]> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "developer-token": developerToken,
  };
  if (account.managerId) {
    headers["login-customer-id"] = digitsOnly(account.managerId);
  }
  const signal = AbortSignal.timeout(25_000);

  const response = await fetch(
    `https://googleads.googleapis.com/${apiVersion}/customers/${digitsOnly(account.externalId)}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        query: [
          "SELECT segments.date, customer.currency_code,",
          "metrics.cost_micros, metrics.impressions, metrics.clicks,",
          "metrics.conversions, metrics.conversions_value",
          "FROM customer",
          `WHERE segments.date BETWEEN '${range.start}' AND '${range.end}'`,
          "ORDER BY segments.date",
        ].join(" "),
      }),
    },
  );
  const body = (await response.json()) as
    | Array<{
        results?: Array<{
          segments?: { date?: string };
          customer?: { currencyCode?: string };
          metrics?: {
            costMicros?: string | number;
            impressions?: string | number;
            clicks?: string | number;
            conversions?: string | number;
            conversionsValue?: string | number;
          };
        }>;
      }>
    | { error?: { message?: string; status?: string } };

  if (!response.ok || !Array.isArray(body)) {
    const error = Array.isArray(body) ? null : body.error;
    throw new ProviderMetricsError(
      publicProviderMessage(
        "Google Ads",
        response.status,
        error?.status ?? error?.message,
      ),
      response.status,
      response.status === 401 || error?.status === "UNAUTHENTICATED",
    );
  }

  const rows: DailyAccountMetric[] = [];
  for (const chunk of body) {
    for (const result of chunk.results ?? []) {
      if (!result.segments?.date) continue;
      rows.push({
        metricDate: result.segments.date,
        currency: result.customer?.currencyCode ?? account.currency,
        spendMicros: integerNumber(result.metrics?.costMicros),
        impressions: integerNumber(result.metrics?.impressions),
        clicks: integerNumber(result.metrics?.clicks),
        conversions: optionalDecimalNumber(result.metrics?.conversions),
        conversionValueMicros: optionalMicros(result.metrics?.conversionsValue),
      });
    }
  }
  return rows;
}

export async function fetchMetaDailyAccountMetrics({
  accessToken,
  appSecretProof,
  account,
  range,
  graphVersion,
}: {
  accessToken: string;
  appSecretProof: string;
  account: ProviderMetricAccount;
  range: MetricDateRange;
  graphVersion: string;
}): Promise<DailyAccountMetric[]> {
  const rows: DailyAccountMetric[] = [];
  const initial = new URL(
    `https://graph.facebook.com/${graphVersion}/act_${digitsOnly(account.externalId)}/insights`,
  );
  initial.searchParams.set(
    "fields",
    "account_id,account_name,spend,impressions,clicks,date_start,date_stop",
  );
  initial.searchParams.set("level", "account");
  initial.searchParams.set("time_increment", "1");
  initial.searchParams.set(
    "time_range",
    JSON.stringify({ since: range.start, until: range.end }),
  );
  initial.searchParams.set("limit", "500");
  initial.searchParams.set("appsecret_proof", appSecretProof);

  let next: string | null = initial.toString();
  let page = 0;
  while (next && page < 10) {
    const response = await fetch(next, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(25_000),
    });
    const body = (await response.json()) as {
      data?: Array<{
        spend?: string;
        impressions?: string;
        clicks?: string;
        date_start?: string;
      }>;
      paging?: { next?: string };
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!response.ok) {
      const code = body.error?.code
        ? `código ${body.error.code}${body.error.error_subcode ? `.${body.error.error_subcode}` : ""}`
        : body.error?.message;
      throw new ProviderMetricsError(
        publicProviderMessage("Meta Ads", response.status, code),
        response.status,
        response.status === 401 || body.error?.code === 190,
      );
    }

    for (const result of body.data ?? []) {
      if (!result.date_start) continue;
      rows.push({
        metricDate: result.date_start,
        currency: account.currency,
        spendMicros: micros(result.spend),
        impressions: integerNumber(result.impressions),
        clicks: integerNumber(result.clicks),
        // Meta can return many overlapping action types. Until an account-level
        // KPI is explicitly configured, exposing one as "results" would be an
        // unsupported business assumption.
        conversions: null,
        conversionValueMicros: null,
      });
    }
    next = withoutAccessToken(body.paging?.next ?? null);
    page += 1;
  }
  if (next) {
    throw new ProviderMetricsError(
      "Meta Ads entregó demasiadas páginas para este ciclo; divide el rango e intenta nuevamente",
      429,
    );
  }
  return rows;
}

function publicProviderMessage(
  provider: string,
  status: number,
  providerCode?: string,
): string {
  const detail = providerCode?.replace(/[\r\n\t]+/g, " ").slice(0, 90);
  return `${provider} no entregó métricas (HTTP ${status}${detail ? ` · ${detail}` : ""})`;
}

function withoutAccessToken(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderMetricsError(
      "Meta Ads devolvió una paginación no válida",
      502,
    );
  }
  if (url.origin !== "https://graph.facebook.com") {
    throw new ProviderMetricsError(
      "Meta Ads devolvió una paginación fuera de Graph API",
      502,
    );
  }
  url.searchParams.delete("access_token");
  return url.toString();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function decimalNumber(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalDecimalNumber(
  value: string | number | undefined | null,
): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerNumber(value: string | number | undefined): number {
  return Math.max(0, Math.round(decimalNumber(value)));
}

function micros(value: string | number | undefined): number {
  return Math.max(0, Math.round(decimalNumber(value) * 1_000_000));
}

function optionalMicros(
  value: string | number | undefined | null,
): number | null {
  const parsed = optionalDecimalNumber(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed * 1_000_000));
}
