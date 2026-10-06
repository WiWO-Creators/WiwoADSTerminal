-- Segmentos por cliente: proyectos (Grupo Valor) o mercados (SQM, ALO Group, Anker). Es un filtro con
-- nombre sobre lo que ya se lee, no una cuenta nueva.
--
-- segments: JSON [{ "id", "nombre", "coincide": [palabras], "paises": [ISO-2] }]. `coincide` son palabras
--   que aparecen en el nombre de la cuenta, la campaña, el conjunto o el anuncio (sin tildes ni mayúsculas).
--   Opcional: sin él, el cliente se ve como siempre.
ALTER TABLE `portfolios` ADD `segments` text;
--> statement-breakpoint

UPDATE `portfolios` SET `segments` = '[{"id":"ebano","nombre":"Ébano","coincide":["ebano"],"paises":[]},{"id":"corotu","nombre":"Corotú","coincide":["corotu"],"paises":[]},{"id":"marea","nombre":"Marea","coincide":["marea"],"paises":[]},{"id":"bijao","nombre":"Bijao","coincide":["bijao"],"paises":[]}]' WHERE `id` = 'valor' AND `segments` IS NULL;
--> statement-breakpoint

UPDATE `portfolios` SET `segments` = '[{"id":"mexico","nombre":"México (SPN)","coincide":["spn"],"paises":["MX"]},{"id":"latam","nombre":"LATAM (Perú, Colombia, Ecuador)","coincide":["latam"],"paises":["PE","CO","EC"]},{"id":"iberia","nombre":"Iberia (España)","coincide":["espana"],"paises":["ES"]}]' WHERE `id` = 'sqm' AND `segments` IS NULL;
--> statement-breakpoint

UPDATE `portfolios` SET `segments` = '[{"id":"peru","nombre":"Perú","coincide":["peru"],"paises":["PE"]},{"id":"colombia","nombre":"Colombia","coincide":["colombia"],"paises":["CO"]},{"id":"ecuador","nombre":"Ecuador","coincide":["ecuador"],"paises":["EC"]},{"id":"panama","nombre":"Panamá","coincide":["panama"],"paises":["PA"]},{"id":"argentina","nombre":"Argentina","coincide":["argentina"],"paises":["AR"]},{"id":"chile","nombre":"Chile","coincide":["chile"],"paises":["CL"]}]' WHERE `id` = 'alo-group' AND `segments` IS NULL;
--> statement-breakpoint

UPDATE `portfolios` SET `segments` = '[{"id":"chile","nombre":"Anker Chile","coincide":["chile"],"paises":["CL"]},{"id":"argentina","nombre":"Anker Argentina","coincide":["argentina"],"paises":["AR"]}]' WHERE `id` = 'anker-soundcore' AND `segments` IS NULL;
--> statement-breakpoint

-- Colbún se divide en dos marcas: Comunicaciones (Meta y Google) y Marketing (LinkedIn, aún sin conectar).
UPDATE `portfolios` SET `name` = 'Colbún Comunicaciones' WHERE `id` = 'colbun' AND `name` = 'Colbún Energía';
--> statement-breakpoint

INSERT OR IGNORE INTO `portfolios` (`id`, `name`, `countries`, `notes`, `created_at`, `updated_at`, `created_by`)
VALUES ('colbun-marketing', 'Colbún Marketing', 'CL', 'Solo LinkedIn. Se llena cuando LinkedIn esté conectado.',
        CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 'migracion');
--> statement-breakpoint

-- TrueCaller (MGC Colombia): solo Meta y TikTok.
INSERT OR IGNORE INTO `portfolios` (`id`, `name`, `countries`, `notes`, `created_at`, `updated_at`, `created_by`)
VALUES ('truecaller', 'TrueCaller', 'CO', 'MGC Colombia. Solo Meta y TikTok.',
        CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 'migracion');
--> statement-breakpoint

INSERT OR IGNORE INTO `portfolio_accounts` (`id`, `portfolio_id`, `external_id`, `created_at`)
VALUES ('truecaller::1110358747560979', 'truecaller', '1110358747560979', CAST(strftime('%s','now') AS INTEGER) * 1000);
