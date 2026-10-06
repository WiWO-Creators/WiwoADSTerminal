-- Cuentas de Meta confirmadas por el equipo (2026-10-05) contra el listado de Windsor.
--   Foundaxis 1327585191742131 → Foundaxis (aparecía sin proveedor y el Constructor no la ofrecía).
--   Ébano 1271746788353880     → Valor Development (proyecto Ébano).
-- Sin Windsor todavía (no se pueden leer): Agencia Palta 1645720452948877, WiWO_Ads 3305419739762154,
-- SQM Comercial Perú 1440606950540243 y SQM Ecuador 2421668381668111 (dependen del usuario del sistema de Meta).
INSERT OR IGNORE INTO `portfolio_accounts` (`id`, `portfolio_id`, `external_id`, `provider`, `created_at`) VALUES
  ('foundaxis::1327585191742131', 'foundaxis', '1327585191742131', 'meta', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('valor::1271746788353880', 'valor', '1271746788353880', 'meta', CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
UPDATE `portfolio_accounts` SET `provider` = 'meta' WHERE `external_id` IN ('1327585191742131', '1271746788353880') AND (`provider` IS NULL OR `provider` = '');
