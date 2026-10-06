-- Cuentas de Meta confirmadas con el usuario del sistema «WiwoAds» (2026-10-05). Windsor todavía no las lee:
-- se asocian al cliente y los datos llegarán cuando la lectura use la API de Meta directa.
--   Agencia Palta 1645720452948877 → agencia-palta
--   SQM Comercial Perú 1440606950540243 y SQM ECUADOR S.A. 2421668381668111 → sqm
INSERT OR IGNORE INTO `portfolio_accounts` (`id`, `portfolio_id`, `external_id`, `provider`, `created_at`) VALUES
  ('agencia-palta::1645720452948877', 'agencia-palta', '1645720452948877', 'meta', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('sqm::1440606950540243', 'sqm', '1440606950540243', 'meta', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('sqm::2421668381668111', 'sqm', '2421668381668111', 'meta', CAST(strftime('%s','now') AS INTEGER) * 1000);
