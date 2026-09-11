import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("buyer"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    invitedBy: text("invited_by"),
    invitedAt: integer("invited_at"),
  },
  (table) => [uniqueIndex("idx_users_email").on(table.email)],
);

/**
 * Qué portafolios ve cada persona.
 *
 * Vacío para un rol que ve todo. Para el resto, la ausencia de una fila
 * significa que ese cliente no existe para esa persona: el filtro se aplica al
 * leer, no en la interfaz.
 */
export const userPortfolios = sqliteTable(
  "user_portfolios",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    portfolioId: text("portfolio_id").notNull(),
    createdAt: integer("created_at").notNull(),
    createdBy: text("created_by"),
  },
  (table) => [
    uniqueIndex("idx_user_portfolios_user_portfolio").on(
      table.userId,
      table.portfolioId,
    ),
    index("idx_user_portfolios_user").on(table.userId),
  ],
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    status: text("status").notNull().default("pending"),
    severity: text("severity").notNull(),
    client: text("client").notNull(),
    platform: text("platform").notNull(),
    ownerLabel: text("owner_label").notNull(),
    autonomy: text("autonomy").notNull(),
    title: text("title").notNull(),
    diagnosis: text("diagnosis").notNull(),
    proposedAction: text("proposed_action").notNull(),
    impact: text("impact").notNull(),
    confidence: text("confidence").notNull(),
    agent: text("agent").notNull(),
    rule: text("rule").notNull(),
    ageLabel: text("age_label").notNull(),
    expiresLabel: text("expires_label").notNull(),
    beforeValue: text("before_value").notNull(),
    afterValue: text("after_value").notNull(),
    guardrail: text("guardrail").notNull(),
    metric: text("metric").notNull(),
    delta: text("delta").notNull(),
    primaryLabel: text("primary_label").notNull(),
    generatedAt: integer("generated_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    snoozedUntil: integer("snoozed_until"),
    resolvedAt: integer("resolved_at"),
    resolvedByUserId: text("resolved_by_user_id"),
    discardReason: text("discard_reason"),
    executionStatus: text("execution_status").notNull().default("not_requested"),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_decisions_status_severity_generated").on(
      table.status,
      table.severity,
      table.generatedAt,
    ),
    index("idx_decisions_client_status").on(table.client, table.status),
    index("idx_decisions_expires_at").on(table.expiresAt),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    decisionId: text("decision_id"),
    actorUserId: text("actor_user_id"),
    actorNameSnapshot: text("actor_name_snapshot").notNull(),
    actorEmailSnapshot: text("actor_email_snapshot"),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actionLabel: text("action_label").notNull(),
    result: text("result").notNull(),
    reason: text("reason"),
    clientSnapshot: text("client_snapshot").notNull(),
    originSnapshot: text("origin_snapshot").notNull(),
    changesJson: text("changes_json").notNull().default("{}"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("idx_audit_events_idempotency").on(table.idempotencyKey),
    index("idx_audit_events_decision_created").on(
      table.decisionId,
      table.createdAt,
    ),
    index("idx_audit_events_created_at").on(table.createdAt),
  ],
);

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const oauthSessions = sqliteTable(
  "oauth_sessions",
  {
    stateHash: text("state_hash").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    codeVerifierCiphertext: text("code_verifier_ciphertext"),
    redirectUri: text("redirect_uri").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_oauth_sessions_user_provider").on(table.userId, table.provider),
    index("idx_oauth_sessions_expires_at").on(table.expiresAt),
  ],
);

export const integrationConnections = sqliteTable(
  "integration_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("connected"),
    providerUserId: text("provider_user_id"),
    providerUserName: text("provider_user_name"),
    scopes: text("scopes").notNull().default(""),
    tokenCiphertext: text("token_ciphertext").notNull(),
    tokenExpiresAt: integer("token_expires_at"),
    lastSyncAt: integer("last_sync_at"),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_integration_connections_user_provider").on(
      table.userId,
      table.provider,
    ),
    index("idx_integration_connections_status").on(table.status),
  ],
);

export const integrationAccounts = sqliteTable(
  "integration_accounts",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    accountType: text("account_type").notNull().default("ads"),
    name: text("name").notNull(),
    currency: text("currency"),
    accountStatus: text("account_status"),
    managerAccountId: text("manager_account_id"),
    timezone: text("timezone"),
    selected: integer("selected", { mode: "boolean" }).notNull().default(false),
    isAvailable: integer("is_available", { mode: "boolean" })
      .notNull()
      .default(true),
    isManager: integer("is_manager", { mode: "boolean" })
      .notNull()
      .default(false),
    metricsStatus: text("metrics_status").notNull().default("not_synced"),
    metricsLastAttemptedAt: integer("metrics_last_attempted_at"),
    metricsLastSyncedAt: integer("metrics_last_synced_at"),
    metricsLastDate: text("metrics_last_date"),
    metricsLastError: text("metrics_last_error"),
    discoveredAt: integer("discovered_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_integration_accounts_connection_external").on(
      table.connectionId,
      table.providerAccountId,
      table.accountType,
    ),
    index("idx_integration_accounts_connection_selected").on(
      table.connectionId,
      table.selected,
    ),
    index("idx_integration_accounts_metric_candidates").on(
      table.connectionId,
      table.selected,
      table.isAvailable,
      table.accountType,
      table.isManager,
    ),
  ],
);

export const accountMetricsDaily = sqliteTable(
  "account_metrics_daily",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    integrationAccountId: text("integration_account_id").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    accountNameSnapshot: text("account_name_snapshot").notNull(),
    metricDate: text("metric_date").notNull(),
    currency: text("currency"),
    spendMicros: integer("spend_micros").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    conversions: real("conversions"),
    conversionValueMicros: integer("conversion_value_micros"),
    fetchedAt: integer("fetched_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_account_metrics_account_date").on(
      table.integrationAccountId,
      table.metricDate,
    ),
    index("idx_account_metrics_connection_date").on(
      table.connectionId,
      table.metricDate,
    ),
    index("idx_account_metrics_provider_account_date").on(
      table.provider,
      table.providerAccountId,
      table.metricDate,
    ),
  ],
);

export const metricSyncRuns = sqliteTable(
  "metric_sync_runs",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull().default("running"),
    selectedAccountCount: integer("selected_account_count")
      .notNull()
      .default(0),
    syncedAccountCount: integer("synced_account_count").notNull().default(0),
    rowCount: integer("row_count").notNull().default(0),
    rangeStart: text("range_start").notNull(),
    rangeEnd: text("range_end").notNull(),
    dataThrough: text("data_through"),
    errorSummary: text("error_summary"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    index("idx_metric_sync_runs_connection_started").on(
      table.connectionId,
      table.startedAt,
    ),
    index("idx_metric_sync_runs_status_started").on(
      table.status,
      table.startedAt,
    ),
  ],
);
