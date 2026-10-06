-- Anker · Soundcore: sus cuentas no tenían proveedor, así que la app no las veía como de Meta / Google, 2026-10-06.
--   1494126595605892 (Anker Chile + Arg) y 4252945408262033 → meta; 985-043-3091 → google.
--   Instagram: @ankerchile (17841466251443913), para poder impulsar sus publicaciones.
UPDATE `portfolio_accounts` SET `provider` = 'meta' WHERE `portfolio_id` = 'anker-soundcore' AND `external_id` IN ('1494126595605892', '4252945408262033') AND (`provider` IS NULL OR `provider` = '');
--> statement-breakpoint
UPDATE `portfolio_accounts` SET `provider` = 'google' WHERE `portfolio_id` = 'anker-soundcore' AND `external_id` = '985-043-3091' AND (`provider` IS NULL OR `provider` = '');
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841466251443913' WHERE `id` = 'anker-soundcore' AND `instagram_id` IS NULL;
