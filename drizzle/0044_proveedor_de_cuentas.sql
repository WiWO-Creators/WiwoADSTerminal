-- Las cuentas sin proveedor guardado se completan por la forma de su identificador, 2026-10-07. Así «Colbún» y el resto
-- muestran sus cuentas de Meta, Google, TikTok y LinkedIn sin pasos manuales.
--   Google: 123-456-7890 o 10 dígitos. Meta: 14 a 17 dígitos. TikTok: 19 dígitos. LinkedIn: 9 dígitos.
UPDATE `portfolio_accounts` SET `provider` = 'google'
  WHERE (`provider` IS NULL OR `provider` = '')
    AND (`external_id` GLOB '[0-9][0-9][0-9]-[0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'
         OR (length(`external_id`) = 10 AND `external_id` NOT GLOB '*[^0-9]*'));
--> statement-breakpoint
UPDATE `portfolio_accounts` SET `provider` = 'meta'
  WHERE (`provider` IS NULL OR `provider` = '')
    AND length(`external_id`) BETWEEN 14 AND 17 AND `external_id` NOT GLOB '*[^0-9]*';
--> statement-breakpoint
UPDATE `portfolio_accounts` SET `provider` = 'tiktok'
  WHERE (`provider` IS NULL OR `provider` = '')
    AND length(`external_id`) = 19 AND `external_id` NOT GLOB '*[^0-9]*';
--> statement-breakpoint
UPDATE `portfolio_accounts` SET `provider` = 'linkedin'
  WHERE (`provider` IS NULL OR `provider` = '')
    AND length(`external_id`) = 9 AND `external_id` NOT GLOB '*[^0-9]*';
