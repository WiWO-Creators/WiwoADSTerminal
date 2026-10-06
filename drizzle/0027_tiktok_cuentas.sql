-- Cuentas de TikTok Ads (solo lectura, vía Windsor) asociadas a su cliente.
--   «USD Truecaller Colombia» 7602721778298355728 → TrueCaller (solo Meta y TikTok, según el equipo).
--   «Soundcore Chile»         7606087454329372673 → Anker · Soundcore.
INSERT OR IGNORE INTO `portfolio_accounts` (`id`, `portfolio_id`, `external_id`, `created_at`) VALUES
  ('truecaller::7602721778298355728', 'truecaller', '7602721778298355728', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('anker-soundcore::7606087454329372673', 'anker-soundcore', '7606087454329372673', CAST(strftime('%s','now') AS INTEGER) * 1000);
