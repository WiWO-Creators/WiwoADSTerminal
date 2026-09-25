-- Una cuenta de Meta puede tener más de un píxel: MGC factura Converse y
-- Coliseum desde la misma cuenta publicitaria, cada marca con su propio
-- píxel, y `portfolio_accounts.pixel_id` (0015) solo podía guardar uno —
-- quedaba una elección forzada ("¿cuál de los dos pongo?") en vez de guardar
-- los dos y dejar que la persona elija cuál usa cada campaña.
--
-- Vive en su propia tabla, con clave en `external_id` (no en el id de fila
-- de `portfolio_accounts`, que se borra y reinserta cada vez que se tocan
-- las cuentas de un cliente — ver `replaceAccounts`): así un píxel sobrevive
-- a eso sin tener que rescatarlo antes de cada borrado.
CREATE TABLE `account_pixels` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`pixel_id` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_account_pixels_external` ON `account_pixels` (`external_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_pixels_unique` ON `account_pixels` (`external_id`, `pixel_id`);
--> statement-breakpoint
-- Migra lo ya cargado en 0015 (auditoría de píxeles del 2026-09-23) para no
-- perderlo: cada cuenta con un solo píxel sigue teniendo ese mismo píxel acá.
INSERT INTO account_pixels (id, external_id, pixel_id, label, created_at)
SELECT lower(hex(randomblob(16))), external_id, pixel_id, NULL, strftime('%s','now') * 1000
FROM portfolio_accounts
WHERE pixel_id IS NOT NULL AND pixel_id != '';
