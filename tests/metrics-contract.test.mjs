import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [migration, attemptMigration, integrationStore, performanceStore] = await Promise.all([
  readFile(new URL("../drizzle/0002_lush_radioactive_man.sql", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0003_nappy_stick.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/integration-store.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/performance-store.ts", import.meta.url), "utf8"),
]);

test("migration enforces one daily metric row per selected account", () => {
  assert.match(migration, /CREATE TABLE `account_metrics_daily`/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX `idx_account_metrics_account_date`[^;]+`integration_account_id`,`metric_date`/,
  );
  assert.match(migration, /CREATE TABLE `metric_sync_runs`/);
  assert.match(migration, /ALTER TABLE `integration_accounts` ADD `is_available`/);
  assert.match(migration, /ALTER TABLE `integration_accounts` ADD `is_manager`/);
  assert.match(attemptMigration, /ADD `metrics_last_attempted_at` integer/);
});

test("inventory refresh preserves account identity and metric history", () => {
  const start = integrationStore.indexOf("async function replaceAccounts");
  const end = integrationStore.indexOf("async function logIntegrationEvent");
  const implementation = integrationStore.slice(start, end);
  assert.match(
    implementation,
    /ON CONFLICT\(connection_id, provider_account_id, account_type\)/,
  );
  assert.match(implementation, /SET is_available = 0/);
  assert.doesNotMatch(implementation, /DELETE FROM integration_accounts/);
});

test("portfolio query is scoped to the user and eligible selected ad accounts", () => {
  assert.match(performanceStore, /WHERE ic\.user_id = \?/);
  assert.match(performanceStore, /ia\.selected = 1/);
  assert.match(performanceStore, /ia\.is_available = 1/);
  assert.match(performanceStore, /ia\.account_type = 'ads'/);
  assert.match(performanceStore, /ia\.is_manager = 0/);
  assert.match(performanceStore, /new Map<string, CurrencyTotal>/);
});
