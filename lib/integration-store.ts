import { env } from "cloudflare:workers";

import { can, type Actor } from "@/lib/permisos";
import { getRawDb } from "@/db";
import {
  fetchGoogleDailyAccountMetrics,
  fetchMetaDailyAccountMetrics,
  type DailyAccountMetric,
  type MetricDateRange,
  type ProviderMetricAccount,
  ProviderMetricsError,
} from "@/lib/provider-metrics";

export type IntegrationProvider = "google" | "meta";

export type IntegrationAccount = {
  id: string;
  externalId: string;
  type: "ads" | "analytics";
  name: string;
  currency: string | null;
  status: string | null;
  managerId: string | null;
  timezone: string | null;
  selected: boolean;
  available: boolean;
  isManager: boolean;
  metricsStatus: "not_synced" | "syncing" | "ready" | "error";
  metricsLastAttemptedAt: number | null;
  metricsLastSyncedAt: number | null;
  metricsLastDate: string | null;
  metricsLastError: string | null;
  updatedAt: number;
};

export type IntegrationSummary = {
  observedAt: number;
  provider: IntegrationProvider;
  label: string;
  description: string;
  configured: boolean;
  /** Qué falta para habilitar el proveedor. Vacío cuando está listo. */
  missingConfig: string[];
  status: "not_connected" | "connected" | "needs_attention";
  providerUserName: string | null;
  accountCount: number;
  selectedCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
  performanceStatus: "not_started" | "running" | "ready" | "partial" | "error";
  performanceLastSyncAt: number | null;
  performanceDataThrough: string | null;
  performanceRowCount: number;
  performanceError: string | null;
  accounts: IntegrationAccount[];
};

type OAuthSessionRow = {
  user_id: string;
  provider: IntegrationProvider;
  code_verifier_ciphertext: string | null;
  redirect_uri: string;
  expires_at: number;
};

type ConnectionRow = {
  id: string;
  status: string;
  provider_user_name: string | null;
  token_ciphertext: string;
  token_expires_at: number | null;
  last_sync_at: number | null;
  last_error: string | null;
  updated_at: number;
};

type AccountRow = {
  id: string;
  provider_account_id: string;
  account_type: "ads" | "analytics";
  name: string;
  currency: string | null;
  account_status: string | null;
  manager_account_id: string | null;
  timezone: string | null;
  selected: number;
  is_available: number;
  is_manager: number;
  metrics_status: IntegrationAccount["metricsStatus"];
  metrics_last_attempted_at: number | null;
  metrics_last_synced_at: number | null;
  metrics_last_date: string | null;
  metrics_last_error: string | null;
  updated_at: number;
};

type MetricSyncRunRow = {
  status: "running" | "succeeded" | "partial" | "failed";
  row_count: number;
  data_through: string | null;
  error_summary: string | null;
  finished_at: number | null;
  started_at: number;
};

type MetricSyncResult = {
  status: "not_started" | "succeeded" | "partial" | "failed";
  selectedAccountCount: number;
  syncedAccountCount: number;
  rowCount: number;
  dataThrough: string | null;
  error: string | null;
  authorizationRequired: boolean;
};

type TokenBundle = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt: number | null;
  scopes: string;
};

type AuthorizationResult = {
  tokens: TokenBundle;
  accounts: DiscoveredAccount[];
  warning: string | null;
  providerUserId: string | null;
  providerUserName: string;
};

type DiscoveredAccount = Pick<
  IntegrationAccount,
  | "externalId"
  | "type"
  | "name"
  | "currency"
  | "status"
  | "managerId"
  | "timezone"
  | "isManager"
>;

const PROVIDERS: Record<
  IntegrationProvider,
  Pick<IntegrationSummary, "label" | "description">
> = {
  google: {
    label: "Google",
    description: "Google Ads y propiedades de Google Analytics 4",
  },
  meta: {
    label: "Meta",
    description: "Cuentas publicitarias de Meta Ads",
  },
};

export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function isIntegrationProvider(
  value: string,
): value is IntegrationProvider {
  return value === "google" || value === "meta";
}

export function providerIsConfigured(provider: IntegrationProvider): boolean {
  return missingProviderConfig(provider).length === 0;
}

/**
 * Qué le falta a un proveedor para poder conectarse.
 *
 * Se devuelve el detalle y no un booleano porque "falta configuración" es un
 * mensaje inútil: en Google el OAuth puede estar listo y faltar solo el
 * developer token, que es un trámite aparte y de días.
 */
export function missingProviderConfig(
  provider: IntegrationProvider,
): string[] {
  const missing: string[] = [];
  if (!env.OAUTH_TOKEN_KEY) missing.push("llave de cifrado");
  if (provider === "google") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      missing.push("credenciales OAuth");
    }
    if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      missing.push("developer token de Google Ads");
    }
    return missing;
  }
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    missing.push("credenciales de la app de Meta");
  }
  return missing;
}

/**
 * Quién puede administrar conexiones.
 *
 * Se consulta el rol, no una lista de correos: un analista autenticado entra al
 * sistema pero no toca las fuentes de datos.
 */
export function userCanManageIntegrations(actor: Actor): boolean {
  return can(actor, "administrar_conexiones");
}

export async function listIntegrations(
  user: Actor,
): Promise<IntegrationSummary[]> {
  const observedAt = Date.now();
  return Promise.all(
    (["google", "meta"] as const).map(async (provider) => {
      const connection = await findConnection(user.id, provider);
      const [accounts, metricRun] = connection
        ? await Promise.all([
            listAccountsForConnection(connection.id),
            findLatestMetricRun(connection.id),
          ])
        : [[], null];
      const status = !connection
        ? "not_connected"
        : connection.status === "connected"
          ? "connected"
          : "needs_attention";
      const eligibleAccounts = accounts.filter(
        (account) =>
          account.available && account.type === "ads" && !account.isManager,
      );

      const interruptedRun = Boolean(
        metricRun &&
          metricRun.status === "running" &&
          metricRun.started_at < Date.now() - 15 * 60 * 1000,
      );

      return {
        observedAt,
        provider,
        ...PROVIDERS[provider],
        configured: providerIsConfigured(provider),
        missingConfig: missingProviderConfig(provider),
        status,
        providerUserName: connection?.provider_user_name ?? null,
        accountCount: eligibleAccounts.length,
        selectedCount: eligibleAccounts.filter((account) => account.selected)
          .length,
        lastSyncAt: connection?.last_sync_at ?? null,
        lastError: connection?.last_error ?? null,
        performanceStatus: !metricRun
          ? "not_started"
          : interruptedRun
            ? "error"
          : metricRun.status === "succeeded"
            ? "ready"
            : metricRun.status === "failed"
              ? "error"
              : metricRun.status,
        performanceLastSyncAt:
          metricRun?.finished_at ?? metricRun?.started_at ?? null,
        performanceDataThrough: metricRun?.data_through ?? null,
        performanceRowCount: metricRun?.row_count ?? 0,
        performanceError: interruptedRun
          ? "La última sincronización se interrumpió. Puedes volver a intentarla."
          : metricRun?.error_summary ?? null,
        accounts,
      };
    }),
  );
}

export async function createAuthorizationUrl(
  user: Actor,
  provider: IntegrationProvider,
  request: Request,
): Promise<string> {
  assertAdmin(user);
  assertConfigured(provider);
  const state = randomBase64Url(32);
  const stateHash = await sha256(state);
  const requestOrigin = new URL(request.url).origin;
  const appOrigin = (env.APP_ORIGIN ?? requestOrigin).replace(/\/$/, "");
  if (requestOrigin !== appOrigin) {
    throw new IntegrationError("El origen de la conexión no es válido", 400);
  }
  const redirectUri = `${appOrigin}/api/integrations/${provider}/callback`;
  const codeVerifier =
    provider === "google" ? randomBase64Url(64) : null;
  const codeVerifierCiphertext = codeVerifier
    ? await encryptSecret(codeVerifier)
    : null;
  const now = Date.now();
  const db = getRawDb();

  await db
    .prepare("DELETE FROM oauth_sessions WHERE expires_at <= ?")
    .bind(now)
    .run();
  await db
    .prepare("DELETE FROM oauth_sessions WHERE user_id = ? AND provider = ?")
    .bind(user.id, provider)
    .run();
  await db
    .prepare(
      `INSERT INTO oauth_sessions
        (state_hash, user_id, provider, code_verifier_ciphertext, redirect_uri, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stateHash,
      user.id,
      provider,
      codeVerifierCiphertext,
      redirectUri,
      now + 10 * 60 * 1000,
      now,
    )
    .run();

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      [
        "https://www.googleapis.com/auth/adwords",
        "https://www.googleapis.com/auth/analytics.readonly",
      ].join(" "),
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", await sha256(codeVerifier!));
    return url.toString();
  }

  const url = new URL(
    `https://www.facebook.com/${metaGraphVersion()}/dialog/oauth`,
  );
  url.searchParams.set("client_id", env.META_APP_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "ads_read");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function completeAuthorization(
  user: Actor,
  provider: IntegrationProvider,
  state: string,
  code: string,
): Promise<void> {
  assertAdmin(user);
  assertConfigured(provider);
  if (!state || !code) {
    throw new IntegrationError("La autorización llegó incompleta");
  }
  const session = await consumeOAuthSession(user.id, provider, state);
  const codeVerifier = session.code_verifier_ciphertext
    ? await decryptSecret(session.code_verifier_ciphertext)
    : null;
  const result =
    provider === "google"
      ? await completeGoogleAuthorization(code, session, codeVerifier)
      : await completeMetaAuthorization(code, session);
  const now = Date.now();
  const existing = await findConnection(user.id, provider);
  if (provider === "google" && !result.tokens.refreshToken && existing) {
    const previous = await decryptTokenBundle(existing.token_ciphertext);
    result.tokens.refreshToken = previous.refreshToken;
  }
  const tokenCiphertext = await encryptTokenBundle(result.tokens);
  const connectionId = existing?.id ?? crypto.randomUUID();
  const db = getRawDb();

  await db
    .prepare(
      `INSERT INTO integration_connections
        (id, user_id, provider, status, provider_user_id, provider_user_name,
         scopes, token_ciphertext, token_expires_at, last_sync_at, last_error,
         created_at, updated_at)
       VALUES (?, ?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         status = 'connected', provider_user_id = excluded.provider_user_id,
         provider_user_name = excluded.provider_user_name,
         scopes = excluded.scopes, token_ciphertext = excluded.token_ciphertext,
         token_expires_at = excluded.token_expires_at,
         last_sync_at = excluded.last_sync_at, last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
    )
    .bind(
      connectionId,
      user.id,
      provider,
      result.providerUserId,
      result.providerUserName,
      result.tokens.scopes,
      tokenCiphertext,
      result.tokens.expiresAt,
      now,
      result.warning,
      now,
      now,
    )
    .run();

  await replaceAccounts(connectionId, result.accounts, !result.warning);
  const metrics = await syncSelectedAccountMetrics(
    connectionId,
    provider,
    result.tokens,
  );
  if (metrics.selectedAccountCount > 0) {
    const issue = joinIssues(result.warning, metrics.error);
    await db
      .prepare(
        `UPDATE integration_connections
         SET status = ?, last_error = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        metrics.authorizationRequired ? "needs_attention" : "connected",
        issue,
        Date.now(),
        connectionId,
        user.id,
      )
      .run();
  }
  await logIntegrationEvent(
    user,
    "integration_connected",
    `Conectó ${PROVIDERS[provider].label}`,
    metrics.selectedAccountCount
      ? `${result.accounts.length} cuentas descubiertas · ${metrics.syncedAccountCount}/${metrics.selectedAccountCount} con métricas`
      : `${result.accounts.length} cuentas descubiertas`,
  );
}

export async function syncIntegration(
  user: Actor,
  provider: IntegrationProvider,
): Promise<IntegrationSummary[]> {
  assertAdmin(user);
  assertConfigured(provider);
  const connection = await findConnection(user.id, provider);
  if (!connection) throw new IntegrationError("La cuenta no está conectada", 404);
  let tokens = await decryptTokenBundle(connection.token_ciphertext);

  try {
    if (provider === "google") tokens = await refreshGoogleToken(tokens);
    if (tokens.expiresAt && tokens.expiresAt <= Date.now()) {
      throw new IntegrationError("La autorización venció. Vuelve a conectar la cuenta.", 409);
    }

    const discovered =
      provider === "google"
        ? await discoverGoogleAccounts(tokens.accessToken)
        : await discoverMetaAccounts(tokens.accessToken);
    await replaceAccounts(
      connection.id,
      discovered.accounts,
      !discovered.warning,
    );
    const metrics = await syncSelectedAccountMetrics(
      connection.id,
      provider,
      tokens,
    );
    const encrypted = await encryptTokenBundle(tokens);
    const now = Date.now();
    const issue = joinIssues(discovered.warning, metrics.error);
    const connectionStatus = metrics.authorizationRequired
      ? "needs_attention"
      : "connected";
    await getRawDb()
      .prepare(
        `UPDATE integration_connections
         SET status = ?, token_ciphertext = ?, token_expires_at = ?,
           last_sync_at = ?, last_error = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        connectionStatus,
        encrypted,
        tokens.expiresAt,
        now,
        issue,
        now,
        connection.id,
        user.id,
      )
      .run();
    await logIntegrationEvent(
      user,
      "integration_synced",
      `Sincronizó ${PROVIDERS[provider].label}`,
      metrics.selectedAccountCount
        ? `${discovered.accounts.length} cuentas verificadas · ${metrics.syncedAccountCount}/${metrics.selectedAccountCount} con métricas`
        : `${discovered.accounts.length} cuentas verificadas · selección pendiente`,
    );
  } catch (error) {
    const message = safeErrorMessage(error);
    await getRawDb()
      .prepare(
        `UPDATE integration_connections
         SET status = 'needs_attention', last_error = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(message, Date.now(), connection.id, user.id)
      .run();
    throw error;
  }

  return listIntegrations(user);
}

export async function selectIntegrationAccounts(
  user: Actor,
  provider: IntegrationProvider,
  selectedIds: string[],
): Promise<IntegrationSummary[]> {
  assertAdmin(user);
  assertConfigured(provider);
  const connection = await findConnection(user.id, provider);
  if (!connection) throw new IntegrationError("La cuenta no está conectada", 404);
  const db = getRawDb();
  const accounts = await listAccountsForConnection(connection.id);
  const selected = new Set(selectedIds);
  if (selected.size === 0) {
    throw new IntegrationError("Selecciona al menos una cuenta", 400);
  }
  if (selected.size !== selectedIds.length) {
    throw new IntegrationError("La selección contiene cuentas duplicadas", 400);
  }
  const eligible = new Set(
    accounts
      .filter(
        (account) =>
          account.available && account.type === "ads" && !account.isManager,
      )
      .map((account) => account.id),
  );
  if ([...selected].some((id) => !eligible.has(id))) {
    throw new IntegrationError(
      "Solo puedes activar cuentas publicitarias disponibles que no sean administradoras",
      400,
    );
  }

  let tokens: TokenBundle;
  try {
    tokens = await decryptTokenBundle(connection.token_ciphertext);
    if (provider === "google") tokens = await refreshGoogleToken(tokens);
    if (tokens.expiresAt && tokens.expiresAt <= Date.now()) {
      throw new IntegrationError(
        "La autorización venció. Vuelve a conectar la cuenta.",
        409,
      );
    }
  } catch (error) {
    await markConnectionIssue(
      connection.id,
      user.id,
      safeErrorMessage(error),
    );
    throw error;
  }

  const statements = accounts.map((account) =>
    db
      .prepare(
        `UPDATE integration_accounts
         SET selected = ?,
           metrics_status = CASE
             WHEN ? = 1 AND selected = 0 THEN 'not_synced'
             ELSE metrics_status
           END,
           metrics_last_error = CASE
             WHEN ? = 1 AND selected = 0 THEN NULL
             ELSE metrics_last_error
           END,
           updated_at = ?
         WHERE connection_id = ? AND id = ?`,
      )
      .bind(
        selected.has(account.id) ? 1 : 0,
        selected.has(account.id) ? 1 : 0,
        selected.has(account.id) ? 1 : 0,
        Date.now(),
        connection.id,
        account.id,
      ),
  );
  if (statements.length) await db.batch(statements);

  let metrics: MetricSyncResult;
  try {
    metrics = await syncSelectedAccountMetrics(
      connection.id,
      provider,
      tokens,
    );
  } catch (error) {
    await markConnectionIssue(
      connection.id,
      user.id,
      safeErrorMessage(error),
    );
    throw error;
  }
  const encrypted = await encryptTokenBundle(tokens);
  const now = Date.now();
  await db
    .prepare(
      `UPDATE integration_connections
       SET status = ?, token_ciphertext = ?, token_expires_at = ?,
         last_error = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      metrics.authorizationRequired ? "needs_attention" : "connected",
      encrypted,
      tokens.expiresAt,
      metrics.error,
      now,
      connection.id,
      user.id,
    )
    .run();
  await logIntegrationEvent(
    user,
    "integration_accounts_selected",
    `Activó ${selected.size} ${selected.size === 1 ? "cuenta" : "cuentas"} de ${PROVIDERS[provider].label}`,
    metrics.status === "succeeded"
      ? `${metrics.rowCount} filas diarias sincronizadas`
      : metrics.error ?? "Sin métricas disponibles",
  );
  return listIntegrations(user);
}

export async function disconnectIntegration(
  user: Actor,
  provider: IntegrationProvider,
): Promise<IntegrationSummary[]> {
  assertAdmin(user);
  const connection = await findConnection(user.id, provider);
  if (!connection) return listIntegrations(user);

  try {
    const tokens = await decryptTokenBundle(connection.token_ciphertext);
    if (provider === "google") {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: tokens.refreshToken ?? tokens.accessToken,
        }),
      });
    } else {
      await fetch(metaGraphUrl("me/permissions"), {
        method: "DELETE",
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      });
    }
  } catch {
    // Local removal still takes precedence when a provider cannot be reached.
  }

  const db = getRawDb();
  await db.batch([
    db
      .prepare("DELETE FROM account_metrics_daily WHERE connection_id = ?")
      .bind(connection.id),
    db
      .prepare("DELETE FROM metric_sync_runs WHERE connection_id = ?")
      .bind(connection.id),
    db
      .prepare("DELETE FROM integration_accounts WHERE connection_id = ?")
      .bind(connection.id),
    db
      .prepare(
        "DELETE FROM integration_connections WHERE id = ? AND user_id = ?",
      )
      .bind(connection.id, user.id),
  ]);
  await logIntegrationEvent(
    user,
    "integration_disconnected",
    `Desconectó ${PROVIDERS[provider].label}`,
    "Acceso retirado de WiWO.ADS",
  );
  return listIntegrations(user);
}

async function completeGoogleAuthorization(
  code: string,
  session: OAuthSessionRow,
  codeVerifier: string | null,
): Promise<AuthorizationResult> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      code,
      code_verifier: codeVerifier ?? "",
      grant_type: "authorization_code",
      redirect_uri: session.redirect_uri,
    }),
  });
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new IntegrationError(
      body.error_description ?? "Google no pudo completar la conexión",
      502,
    );
  }
  const tokens: TokenBundle = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    tokenType: body.token_type,
    expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : null,
    scopes: body.scope ?? "",
  };
  const discovered = await discoverGoogleAccounts(tokens.accessToken);
  return {
    tokens,
    accounts: discovered.accounts,
    warning: discovered.warning,
    providerUserId: null,
    providerUserName: "Google Ads + Analytics",
  };
}

async function completeMetaAuthorization(
  code: string,
  session: OAuthSessionRow,
): Promise<AuthorizationResult> {
  const exchange = await fetch(
    metaGraphUrl("oauth/access_token"),
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.META_APP_ID!,
        client_secret: env.META_APP_SECRET!,
        redirect_uri: session.redirect_uri,
        code,
      }),
    },
  );
  const exchangeBody = (await exchange.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!exchange.ok || !exchangeBody.access_token) {
    throw new IntegrationError(
      exchangeBody.error?.message ?? "Meta no pudo completar la conexión",
      502,
    );
  }

  const longResponse = await fetch(
    metaGraphUrl("oauth/access_token"),
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: env.META_APP_ID!,
        client_secret: env.META_APP_SECRET!,
        fb_exchange_token: exchangeBody.access_token,
      }),
    },
  );
  const longBody = (await longResponse.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  };
  const accessToken = longBody.access_token ?? exchangeBody.access_token;
  const expiresIn = longBody.expires_in ?? exchangeBody.expires_in;
  const profileUrl = metaGraphUrl("me");
  profileUrl.searchParams.set("fields", "id,name");
  profileUrl.searchParams.set(
    "appsecret_proof",
    await hmacSha256Hex(env.META_APP_SECRET!, accessToken),
  );
  const profileResponse = await fetch(profileUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const profile = (await profileResponse.json()) as {
    id?: string;
    name?: string;
  };
  const discovered = await discoverMetaAccounts(accessToken);
  return {
    tokens: {
      accessToken,
      tokenType: longBody.token_type ?? exchangeBody.token_type,
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
      scopes: "ads_read",
    } satisfies TokenBundle,
    accounts: discovered.accounts,
    warning: discovered.warning,
    providerUserId: profile.id ?? null,
    providerUserName: profile.name ?? "Meta Ads",
  };
}

async function discoverGoogleAccounts(accessToken: string): Promise<{
  accounts: DiscoveredAccount[];
  warning: string | null;
}> {
  const warnings: string[] = [];
  const found = new Map<string, DiscoveredAccount>();
  let adsInventoryComplete = true;
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    "content-type": "application/json",
  };
  const version = env.GOOGLE_ADS_API_VERSION ?? "v25";

  const accessibleResponse = await fetch(
    `https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`,
    { headers },
  );
  const accessible = (await accessibleResponse.json()) as {
    resourceNames?: string[];
    error?: { message?: string };
  };
  if (!accessibleResponse.ok) {
    throw new IntegrationError(
      accessible.error?.message ?? "Google Ads no devolvió cuentas accesibles",
      502,
    );
  }

  for (const resourceName of accessible.resourceNames ?? []) {
    const rootId = resourceName.replace("customers/", "");
    let hierarchyLoaded = false;
    try {
      const hierarchyResponse = await fetch(
        `https://googleads.googleapis.com/${version}/customers/${rootId}/googleAds:searchStream`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query:
              "SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.status, customer_client.level FROM customer_client ORDER BY customer_client.level",
          }),
        },
      );
      if (hierarchyResponse.ok) {
        const chunks = (await hierarchyResponse.json()) as Array<{
          results?: Array<{
            customerClient?: {
              clientCustomer?: string;
              descriptiveName?: string;
              currencyCode?: string;
              timeZone?: string;
              manager?: boolean;
              status?: string;
              level?: string | number;
            };
          }>;
        }>;
        for (const chunk of chunks) {
          for (const row of chunk.results ?? []) {
            const item = row.customerClient;
            const externalId = item?.clientCustomer?.replace("customers/", "");
            if (!externalId) continue;
            found.set(`ads:${externalId}`, {
              externalId,
              type: "ads",
              name: item?.descriptiveName || formatGoogleCustomerId(externalId),
              currency: item?.currencyCode ?? null,
              status: item?.status ?? null,
              managerId: rootId === externalId ? null : rootId,
              timezone: item?.timeZone ?? null,
              isManager: Boolean(item?.manager),
            });
          }
        }
        hierarchyLoaded = true;
      } else {
        adsInventoryComplete = false;
      }
    } catch {
      hierarchyLoaded = false;
      adsInventoryComplete = false;
    }

    if (!hierarchyLoaded || !found.has(`ads:${rootId}`)) {
      found.set(`ads:${rootId}`, {
        externalId: rootId,
        type: "ads",
        name: formatGoogleCustomerId(rootId),
        currency: null,
        status: hierarchyLoaded ? "ENABLED" : null,
        managerId: null,
        timezone: null,
        isManager: !hierarchyLoaded,
      });
    }
  }

  if (!adsInventoryComplete) {
    warnings.push(
      "Google Ads devolvió un inventario parcial; se conservaron las cuentas anteriores.",
    );
  }

  try {
    const analyticsResponse = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (analyticsResponse.ok) {
      const analytics = (await analyticsResponse.json()) as {
        accountSummaries?: Array<{
          displayName?: string;
          propertySummaries?: Array<{
            property?: string;
            displayName?: string;
          }>;
        }>;
      };
      for (const account of analytics.accountSummaries ?? []) {
        for (const property of account.propertySummaries ?? []) {
          const externalId = property.property?.replace("properties/", "");
          if (!externalId) continue;
          found.set(`analytics:${externalId}`, {
            externalId,
            type: "analytics",
            name: `${property.displayName ?? externalId} · GA4`,
            currency: null,
            status: "ENABLED",
            managerId: account.displayName ?? null,
            timezone: null,
            isManager: false,
          });
        }
      }
    } else {
      warnings.push("Google Analytics no respondió; Google Ads sí quedó conectado.");
    }
  } catch {
    warnings.push("Google Analytics no respondió; Google Ads sí quedó conectado.");
  }

  return {
    accounts: [...found.values()],
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

async function discoverMetaAccounts(accessToken: string): Promise<{
  accounts: DiscoveredAccount[];
  warning: string | null;
}> {
  const accounts: DiscoveredAccount[] = [];
  const appSecretProof = await hmacSha256Hex(
    env.META_APP_SECRET!,
    accessToken,
  );
  let next: string | null = (() => {
    const url = metaGraphUrl("me/adaccounts");
    url.searchParams.set(
      "fields",
      "id,account_id,name,currency,account_status,timezone_name,business",
    );
    url.searchParams.set("limit", "200");
    url.searchParams.set("appsecret_proof", appSecretProof);
    return url.toString();
  })();
  let page = 0;

  while (next && page < 5) {
    const response = await fetch(next, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = (await response.json()) as {
      data?: Array<{
        id?: string;
        account_id?: string;
        name?: string;
        currency?: string;
        account_status?: number;
        timezone_name?: string;
        business?: { id?: string; name?: string };
      }>;
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new IntegrationError(
        body.error?.message ?? "Meta no devolvió cuentas publicitarias",
        502,
      );
    }
    for (const item of body.data ?? []) {
      const externalId = item.account_id ?? item.id?.replace("act_", "");
      if (!externalId) continue;
      accounts.push({
        externalId,
        type: "ads",
        name: item.name || `Meta Ads ${externalId}`,
        currency: item.currency ?? null,
        status: metaAccountStatus(item.account_status),
        managerId: item.business?.id ?? null,
        timezone: item.timezone_name ?? null,
        isManager: false,
      });
    }
    next = stripAccessToken(body.paging?.next ?? null);
    page += 1;
  }

  return {
    accounts,
    warning: next
      ? "Meta devolvió más cuentas de las que se pudieron revisar en este ciclo."
      : null,
  };
}

async function syncSelectedAccountMetrics(
  connectionId: string,
  provider: IntegrationProvider,
  tokens: TokenBundle,
): Promise<MetricSyncResult> {
  const eligible = (await listAccountsForConnection(connectionId)).filter(
    (account) =>
      account.selected &&
      account.available &&
      account.type === "ads" &&
      !account.isManager,
  );
  if (eligible.length === 0) {
    return {
      status: "not_started",
      selectedAccountCount: 0,
      syncedAccountCount: 0,
      rowCount: 0,
      dataThrough: null,
      error: null,
      authorizationRequired: false,
    };
  }

  const range = metricDateRange(32);
  const db = getRawDb();
  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  const maximumAccounts = 20;
  const targets = [...eligible]
    .sort((left, right) => {
      const priority = (account: IntegrationAccount) =>
        account.metricsStatus === "not_synced"
          ? 0
          : account.metricsStatus === "error"
            ? 1
          : account.metricsStatus === "syncing"
              ? 2
              : 3;
      return (
        priority(left) - priority(right) ||
        (left.metricsLastAttemptedAt ?? 0) -
          (right.metricsLastAttemptedAt ?? 0) ||
        (left.metricsLastSyncedAt ?? 0) - (right.metricsLastSyncedAt ?? 0) ||
        left.name.localeCompare(right.name)
      );
    })
    .slice(0, maximumAccounts);
  await db
    .prepare(
      `INSERT INTO metric_sync_runs
        (id, connection_id, provider, status, selected_account_count,
         synced_account_count, row_count, range_start, range_end,
         data_through, error_summary, started_at, finished_at)
       VALUES (?, ?, ?, 'running', ?, 0, 0, ?, ?, NULL, NULL, ?, NULL)`,
    )
    .bind(
      runId,
      connectionId,
      provider,
      eligible.length,
      range.start,
      range.end,
      startedAt,
    )
    .run();

  try {
  const syncingStatements = targets.map((account) =>
    db
      .prepare(
        `UPDATE integration_accounts
         SET metrics_status = 'syncing', metrics_last_attempted_at = ?,
           metrics_last_error = NULL, updated_at = ?
         WHERE id = ? AND connection_id = ?`,
      )
      .bind(startedAt, startedAt, account.id, connectionId),
  );
  for (let index = 0; index < syncingStatements.length; index += 50) {
    await db.batch(syncingStatements.slice(index, index + 50));
  }

  const errors: string[] = [];
  let syncedAccountCount = 0;
  let rowCount = 0;
  let dataThrough: string | null = null;
  let authorizationRequired = false;

  for (const account of targets) {
    try {
      const rows = await fetchAccountMetrics(provider, tokens, account, range);
      const normalized = normalizeDailyRows(rows, range);
      await replaceDailyMetricsRange(
        connectionId,
        provider,
        account,
        range,
        normalized,
      );
      // A successful empty response still proves coverage through the requested
      // end date. Activity dates live in account_metrics_daily; this field is
      // the coverage watermark for the account.
      const coverageThrough = range.end;
      const finishedAt = Date.now();
      await db
        .prepare(
          `UPDATE integration_accounts
           SET metrics_status = 'ready', metrics_last_synced_at = ?,
             metrics_last_date = ?, metrics_last_error = NULL, updated_at = ?
           WHERE id = ? AND connection_id = ?`,
        )
        .bind(
          finishedAt,
          coverageThrough,
          finishedAt,
          account.id,
          connectionId,
        )
        .run();
      syncedAccountCount += 1;
      rowCount += normalized.length;
      if (!dataThrough || coverageThrough < dataThrough) {
        dataThrough = coverageThrough;
      }
    } catch (error) {
      if (
        error instanceof ProviderMetricsError &&
        error.authorizationRequired
      ) {
        authorizationRequired = true;
      }
      const message = `${account.name}: ${safeErrorMessage(error)}`.slice(0, 240);
      errors.push(message);
      await db
        .prepare(
          `UPDATE integration_accounts
           SET metrics_status = 'error', metrics_last_error = ?, updated_at = ?
           WHERE id = ? AND connection_id = ?`,
        )
        .bind(message, Date.now(), account.id, connectionId)
        .run();
    }
  }

  if (eligible.length > maximumAccounts) {
    const skipped = eligible.length - maximumAccounts;
    errors.push(
      `${skipped} ${skipped === 1 ? "cuenta quedó" : "cuentas quedaron"} para la siguiente sincronización`,
    );
  }

  const status: MetricSyncResult["status"] =
    errors.length === 0
      ? "succeeded"
      : syncedAccountCount > 0
        ? "partial"
        : "failed";
  const errorSummary = errors.length ? errors.join(" · ").slice(0, 900) : null;
  const finishedAt = Date.now();
  await db
    .prepare(
      `UPDATE metric_sync_runs
       SET status = ?, synced_account_count = ?, row_count = ?,
         data_through = ?, error_summary = ?, finished_at = ?
       WHERE id = ? AND connection_id = ?`,
    )
    .bind(
      status,
      syncedAccountCount,
      rowCount,
      dataThrough,
      errorSummary,
      finishedAt,
      runId,
      connectionId,
    )
    .run();

  await db
    .prepare(
      `DELETE FROM account_metrics_daily
       WHERE connection_id = ? AND metric_date < ?`,
    )
    .bind(connectionId, isoDateOffset(-400))
    .run();

  return {
    status,
    selectedAccountCount: eligible.length,
    syncedAccountCount,
    rowCount,
    dataThrough,
    error: errorSummary,
    authorizationRequired,
  };
  } catch (error) {
    const failedAt = Date.now();
    const message = `Sincronización interrumpida: ${safeErrorMessage(error)}`.slice(
      0,
      500,
    );
    try {
      await db.batch([
        db
          .prepare(
            `UPDATE metric_sync_runs
             SET status = 'failed', error_summary = ?, finished_at = ?
             WHERE id = ? AND connection_id = ? AND status = 'running'`,
          )
          .bind(message, failedAt, runId, connectionId),
        ...targets.map((account) =>
          db
            .prepare(
              `UPDATE integration_accounts
               SET metrics_status = 'error', metrics_last_error = ?, updated_at = ?
               WHERE id = ? AND connection_id = ? AND metrics_status = 'syncing'`,
            )
            .bind(message, failedAt, account.id, connectionId),
        ),
      ]);
    } catch {
      // Preserve the original provider/storage error if D1 cannot record it.
    }
    throw error;
  }
}

async function fetchAccountMetrics(
  provider: IntegrationProvider,
  tokens: TokenBundle,
  account: IntegrationAccount,
  range: MetricDateRange,
): Promise<DailyAccountMetric[]> {
  const providerAccount: ProviderMetricAccount = {
    integrationAccountId: account.id,
    externalId: account.externalId,
    name: account.name,
    currency: account.currency,
    managerId: account.managerId,
  };
  if (provider === "google") {
    return fetchGoogleDailyAccountMetrics({
      accessToken: tokens.accessToken,
      account: providerAccount,
      range,
      developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      apiVersion: env.GOOGLE_ADS_API_VERSION ?? "v25",
    });
  }
  return fetchMetaDailyAccountMetrics({
    accessToken: tokens.accessToken,
    appSecretProof: await hmacSha256Hex(
      env.META_APP_SECRET!,
      tokens.accessToken,
    ),
    account: providerAccount,
    range,
    graphVersion: metaGraphVersion(),
  });
}

function normalizeDailyRows(
  rows: DailyAccountMetric[],
  range: MetricDateRange,
): DailyAccountMetric[] {
  const byDate = new Map<string, DailyAccountMetric>();
  for (const row of rows) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(row.metricDate) ||
      row.metricDate < range.start ||
      row.metricDate > range.end
    ) {
      throw new IntegrationError(
        "La plataforma devolvió una fecha de métricas fuera del rango solicitado",
        502,
      );
    }
    byDate.set(row.metricDate, row);
  }
  return [...byDate.values()].sort((a, b) =>
    a.metricDate.localeCompare(b.metricDate),
  );
}

async function replaceDailyMetricsRange(
  connectionId: string,
  provider: IntegrationProvider,
  account: IntegrationAccount,
  range: MetricDateRange,
  rows: DailyAccountMetric[],
): Promise<void> {
  const db = getRawDb();
  const now = Date.now();
  const statements = [
    db
      .prepare(
        `DELETE FROM account_metrics_daily
         WHERE connection_id = ? AND integration_account_id = ?
           AND metric_date BETWEEN ? AND ?`,
      )
      .bind(connectionId, account.id, range.start, range.end),
    ...rows.map((row) =>
      db
        .prepare(
          `INSERT INTO account_metrics_daily
          (id, connection_id, integration_account_id, provider,
           provider_account_id, account_name_snapshot, metric_date, currency,
           spend_micros, impressions, clicks, conversions,
           conversion_value_micros, fetched_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(integration_account_id, metric_date)
         DO UPDATE SET
           provider = excluded.provider,
           provider_account_id = excluded.provider_account_id,
           account_name_snapshot = excluded.account_name_snapshot,
           currency = excluded.currency,
           spend_micros = excluded.spend_micros,
           impressions = excluded.impressions,
           clicks = excluded.clicks,
           conversions = excluded.conversions,
           conversion_value_micros = excluded.conversion_value_micros,
           fetched_at = excluded.fetched_at,
           updated_at = excluded.updated_at`,
        )
        .bind(
          crypto.randomUUID(),
          connectionId,
          account.id,
          provider,
          account.externalId,
          account.name,
          row.metricDate,
          row.currency ?? account.currency,
          row.spendMicros,
          row.impressions,
          row.clicks,
          row.conversions,
          row.conversionValueMicros,
          now,
          now,
          now,
        ),
    ),
  ];
  await db.batch(statements);
}

function metricDateRange(days: number): MetricDateRange {
  return {
    start: isoDateOffset(-(Math.max(1, Math.min(days, 90)) - 1)),
    end: isoDateOffset(0),
  };
}

function isoDateOffset(offsetDays: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

async function refreshGoogleToken(tokens: TokenBundle): Promise<TokenBundle> {
  if (!tokens.expiresAt || tokens.expiresAt > Date.now() + 5 * 60 * 1000) {
    return tokens;
  }
  if (!tokens.refreshToken) {
    throw new IntegrationError(
      "Google no entregó acceso permanente. Vuelve a conectar la cuenta.",
      409,
    );
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new IntegrationError(
      body.error_description ?? "Google requiere volver a autorizar la cuenta",
      409,
    );
  }
  return {
    ...tokens,
    accessToken: body.access_token,
    expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : null,
    scopes: body.scope ?? tokens.scopes,
    tokenType: body.token_type ?? tokens.tokenType,
  };
}

async function consumeOAuthSession(
  userId: string,
  provider: IntegrationProvider,
  state: string,
): Promise<OAuthSessionRow> {
  const stateHash = await sha256(state);
  const db = getRawDb();
  const session = await db
    .prepare(
      `DELETE FROM oauth_sessions
       WHERE state_hash = ? AND user_id = ? AND provider = ? AND expires_at > ?
       RETURNING user_id, provider, code_verifier_ciphertext, redirect_uri, expires_at`,
    )
    .bind(stateHash, userId, provider, Date.now())
    .first<OAuthSessionRow>();
  if (!session) {
    throw new IntegrationError(
      "La autorización venció o no coincide con esta sesión. Intenta nuevamente.",
      409,
    );
  }
  return session;
}

async function findConnection(
  userId: string,
  provider: IntegrationProvider,
): Promise<ConnectionRow | null> {
  return getRawDb()
    .prepare(
      `SELECT id, status, provider_user_name, token_ciphertext,
        token_expires_at, last_sync_at, last_error, updated_at
       FROM integration_connections
       WHERE user_id = ? AND provider = ? LIMIT 1`,
    )
    .bind(userId, provider)
    .first<ConnectionRow>();
}

async function listAccountsForConnection(
  connectionId: string,
): Promise<IntegrationAccount[]> {
  const result = await getRawDb()
    .prepare(
      `SELECT id, provider_account_id, account_type, name, currency,
        account_status, manager_account_id, timezone, selected,
        is_available, is_manager, metrics_status, metrics_last_attempted_at,
        metrics_last_synced_at, metrics_last_date, metrics_last_error, updated_at
       FROM integration_accounts
       WHERE connection_id = ?
       ORDER BY is_available DESC, account_type, name`,
    )
    .bind(connectionId)
    .all<AccountRow>();
  return result.results.map((row) => ({
    id: row.id,
    externalId: row.provider_account_id,
    type: row.account_type,
    name: row.name,
    currency: row.currency,
    status: row.account_status,
    managerId: row.manager_account_id,
    timezone: row.timezone,
    selected: Boolean(row.selected),
    available: Boolean(row.is_available),
    isManager: Boolean(row.is_manager),
    metricsStatus: row.metrics_status,
    metricsLastAttemptedAt: row.metrics_last_attempted_at,
    metricsLastSyncedAt: row.metrics_last_synced_at,
    metricsLastDate: row.metrics_last_date,
    metricsLastError: row.metrics_last_error,
    updatedAt: row.updated_at,
  }));
}

async function findLatestMetricRun(
  connectionId: string,
): Promise<MetricSyncRunRow | null> {
  return getRawDb()
    .prepare(
      `SELECT status, row_count, data_through, error_summary,
        finished_at, started_at
       FROM metric_sync_runs
       WHERE connection_id = ?
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .bind(connectionId)
    .first<MetricSyncRunRow>();
}

async function replaceAccounts(
  connectionId: string,
  accounts: DiscoveredAccount[],
  markMissingUnavailable = true,
): Promise<void> {
  const db = getRawDb();
  const existing = await listAccountsForConnection(connectionId);
  const existingByExternalKey = new Map(
    existing.map((account) => [
      `${account.type}:${account.externalId}`,
      account,
    ]),
  );
  const now = Date.now();
  const statements = accounts.map((account) =>
    db
      .prepare(
        `INSERT INTO integration_accounts
          (id, connection_id, provider_account_id, account_type, name,
           currency, account_status, manager_account_id, timezone, selected,
           is_available, is_manager, metrics_status, metrics_last_synced_at,
           metrics_last_date, metrics_last_error, discovered_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'not_synced',
           NULL, NULL, NULL, ?, ?)
         ON CONFLICT(connection_id, provider_account_id, account_type)
         DO UPDATE SET
           name = excluded.name,
           currency = excluded.currency,
           account_status = excluded.account_status,
           manager_account_id = excluded.manager_account_id,
           timezone = excluded.timezone,
           is_available = 1,
           is_manager = excluded.is_manager,
           updated_at = excluded.updated_at`,
      )
      .bind(
        existingByExternalKey.get(`${account.type}:${account.externalId}`)?.id ??
          crypto.randomUUID(),
        connectionId,
        account.externalId,
        account.type,
        account.name,
        account.currency,
        account.status,
        account.managerId,
        account.timezone,
        existingByExternalKey.get(`${account.type}:${account.externalId}`)
          ?.selected
          ? 1
          : 0,
        account.isManager ? 1 : 0,
        now,
        now,
      ),
  );
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }

  const discoveredKeys = new Set(
    accounts.map((account) => `${account.type}:${account.externalId}`),
  );
  const unavailable = markMissingUnavailable
    ? existing.filter(
        (account) => !discoveredKeys.has(`${account.type}:${account.externalId}`),
      )
    : [];
  const unavailableStatements = unavailable.map((account) =>
    db
      .prepare(
        `UPDATE integration_accounts
         SET is_available = 0, updated_at = ?
         WHERE id = ? AND connection_id = ?`,
      )
      .bind(now, account.id, connectionId),
  );
  for (let index = 0; index < unavailableStatements.length; index += 50) {
    await db.batch(unavailableStatements.slice(index, index + 50));
  }
}

async function logIntegrationEvent(
  user: Actor,
  eventType: string,
  actionLabel: string,
  result: string,
) {
  await getRawDb()
    .prepare(
      `INSERT INTO audit_events
        (id, decision_id, actor_user_id, actor_name_snapshot,
         actor_email_snapshot, event_type, from_status, to_status,
         action_label, result, reason, client_snapshot, origin_snapshot,
         changes_json, idempotency_key, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL,
         'WiWO.ADS', 'Integraciones', '{}', ?, ?)`,
    )
    .bind(
      `LOG-${crypto.randomUUID()}`,
      user.id,
      user.email,
      user.email,
      eventType,
      actionLabel,
      result,
      crypto.randomUUID(),
      Date.now(),
    )
    .run();
}

async function encryptTokenBundle(bundle: TokenBundle): Promise<string> {
  return encryptSecret(JSON.stringify(bundle));
}

async function encryptSecret(value: string): Promise<string> {
  const key = await tokenKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("wiwo-ads-integrations:v1"),
    },
    key,
    plaintext,
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptTokenBundle(ciphertext: string): Promise<TokenBundle> {
  return JSON.parse(await decryptSecret(ciphertext)) as TokenBundle;
}

async function decryptSecret(ciphertext: string): Promise<string> {
  const [version, ivPart, encryptedPart] = ciphertext.split(".");
  if (version !== "v1" || !ivPart || !encryptedPart) {
    throw new IntegrationError("La credencial guardada no es válida", 500);
  }
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(ivPart),
      additionalData: new TextEncoder().encode("wiwo-ads-integrations:v1"),
    },
    await tokenKey(),
    base64UrlToBytes(encryptedPart),
  );
  return new TextDecoder().decode(decrypted);
}

async function tokenKey(): Promise<CryptoKey> {
  if (!env.OAUTH_TOKEN_KEY) {
    throw new IntegrationError("La conexión segura todavía no está habilitada", 503);
  }
  const bytes = base64UrlToBytes(env.OAUTH_TOKEN_KEY);
  if (bytes.byteLength !== 32) {
    throw new IntegrationError("La llave de conexiones no es válida", 500);
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function assertConfigured(provider: IntegrationProvider) {
  if (!providerIsConfigured(provider)) {
    throw new IntegrationError(
      `${PROVIDERS[provider].label} todavía no está habilitado por el administrador`,
      503,
    );
  }
}

function assertAdmin(actor: Actor) {
  if (!userCanManageIntegrations(actor)) {
    throw new IntegrationError(
      "Tu usuario no tiene permiso para administrar conexiones",
      403,
    );
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function randomBase64Url(bytes: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function formatGoogleCustomerId(value: string): string {
  const clean = value.replace(/\D/g, "");
  if (clean.length !== 10) return `Google Ads ${value}`;
  return `Google Ads ${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
}

function stripAccessToken(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationError("Meta devolvió una paginación no válida", 502);
  }
  if (url.origin !== "https://graph.facebook.com") {
    throw new IntegrationError(
      "Meta devolvió una paginación fuera de Graph API",
      502,
    );
  }
  url.searchParams.delete("access_token");
  return url.toString();
}

function metaAccountStatus(status?: number): string | null {
  if (status === 1) return "ACTIVE";
  if (status === 2) return "DISABLED";
  if (status === 3) return "UNSETTLED";
  if (status === 7) return "PENDING_REVIEW";
  if (status === 9) return "IN_GRACE_PERIOD";
  if (status === 100) return "PENDING_CLOSURE";
  if (status === 101) return "CLOSED";
  return status ? String(status) : null;
}

function metaGraphVersion(): string {
  const configured = env.META_GRAPH_VERSION?.trim();
  return configured && /^v\d+\.\d+$/.test(configured) ? configured : "v26.0";
}

function metaGraphUrl(path: string): URL {
  const normalizedPath = path.replace(/^\/+/, "");
  return new URL(
    `https://graph.facebook.com/${metaGraphVersion()}/${normalizedPath}`,
  );
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "La plataforma no respondió correctamente";
}

function joinIssues(...issues: Array<string | null | undefined>): string | null {
  const present = issues.map((issue) => issue?.trim()).filter(Boolean);
  return present.length ? present.join(" ").slice(0, 900) : null;
}

async function markConnectionIssue(
  connectionId: string,
  userId: string,
  message: string,
): Promise<void> {
  await getRawDb()
    .prepare(
      `UPDATE integration_connections
       SET status = 'needs_attention', last_error = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(message.slice(0, 500), Date.now(), connectionId, userId)
    .run();
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
