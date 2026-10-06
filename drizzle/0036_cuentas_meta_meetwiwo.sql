-- Cuentas de Meta que ve el segundo usuario del sistema (portafolio Meetwiwo.com), 2026-10-06.
--   Acaiberry 1570278638035024 → acai-berry
--   Funeraria Maria ayuda 453169699698594 y «Funeraria | Maria Ayuda 2026» 792906527166172 → maria-ayuda (ya asociadas)
INSERT OR IGNORE INTO `portfolio_accounts` (`id`, `portfolio_id`, `external_id`, `provider`, `created_at`) VALUES
  ('acai-berry::1570278638035024', 'acai-berry', '1570278638035024', 'meta', CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
UPDATE `portfolio_accounts` SET `provider` = 'meta' WHERE `external_id` IN ('453169699698594', '792906527166172') AND (`provider` IS NULL OR `provider` = '');
