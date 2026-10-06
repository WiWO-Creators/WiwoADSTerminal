-- Carga de GA4 y GTM por cliente (2026-10-05), solo lo que no deja dudas: propiedades que Windsor ya lee y contenedores
-- confirmados por el equipo. ALO (más de 20 propiedades) y Valor completo quedan por confirmar. Ver docs/ESTADO_POR_CLIENTE.md.
-- Solo se llena donde el campo está vacío: no pisa nada que el equipo ya haya cargado a mano.

-- AIMA no existía como cliente.
INSERT OR IGNORE INTO `portfolios` (`id`, `name`, `countries`, `ga4_property_id`, `gtm_estado`, `gtm_container_id`, `created_at`, `updated_at`, `created_by`)
VALUES ('aima', 'AIMA', 'CL', '508525564', 'tiene', 'GTM-NCWP7W48',
        CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 'migracion');
--> statement-breakpoint
INSERT OR IGNORE INTO `portfolio_accounts` (`id`, `portfolio_id`, `external_id`, `created_at`) VALUES
  ('aima::866-336-0598', 'aima', '866-336-0598', CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint

-- Grupo Valor: Ébano y corotusantamaria.com (las dos que Windsor lee).
UPDATE `portfolios` SET `ga4_property_id` = '530554404,525122394' WHERE `id` = 'valor' AND `ga4_property_id` IS NULL;
--> statement-breakpoint
-- Palta: GA4 y contenedor de GTM.
UPDATE `portfolios` SET `ga4_property_id` = '354519679' WHERE `id` = 'agencia-palta' AND `ga4_property_id` IS NULL;
--> statement-breakpoint
UPDATE `portfolios` SET `gtm_estado` = 'tiene', `gtm_container_id` = 'GTM-5FL5C3Z5' WHERE `id` = 'agencia-palta' AND `gtm_estado` IS NULL;
--> statement-breakpoint
UPDATE `portfolios` SET `ga4_property_id` = '478107495' WHERE `id` = 'foundaxis' AND `ga4_property_id` IS NULL;
--> statement-breakpoint
-- SQM: la propiedad que Windsor lee (las otras cinco esperan acceso).
UPDATE `portfolios` SET `ga4_property_id` = '382329583' WHERE `id` = 'sqm' AND `ga4_property_id` IS NULL;
--> statement-breakpoint
UPDATE `portfolios` SET `ga4_property_id` = '429136856' WHERE `id` = 'cornerstone' AND `ga4_property_id` IS NULL;
--> statement-breakpoint
UPDATE `portfolios` SET `ga4_property_id` = '523292488' WHERE `id` = 'maria-ayuda' AND `ga4_property_id` IS NULL;
--> statement-breakpoint
UPDATE `portfolios` SET `ga4_property_id` = '377220244' WHERE `id` = 'primeros-pueblos' AND `ga4_property_id` IS NULL;
--> statement-breakpoint
UPDATE `portfolios` SET `ga4_property_id` = '399937718' WHERE `id` = 'skydive-andes' AND `ga4_property_id` IS NULL;
--> statement-breakpoint
UPDATE `portfolios` SET `ga4_property_id` = '310315497' WHERE `id` = 'amipass' AND `ga4_property_id` IS NULL;
