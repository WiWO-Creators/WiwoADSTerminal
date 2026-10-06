-- Cuentas de LinkedIn Ads (solo lectura, vía Windsor) asociadas a su cliente.
--
-- Colbún Marketing es el cliente de LinkedIn de Colbún: «Colbún Clientes» y «Colbun S.A».
-- Amipass y Cornerstone ya existen como clientes; Bodenor Flexcenter no tenía cliente declarado (salía como su
-- cuenta de Google suelta), así que se declara con sus cuentas de Google y LinkedIn y su GA4.
INSERT OR IGNORE INTO `portfolio_accounts` (`id`, `portfolio_id`, `external_id`, `created_at`) VALUES
  ('colbun-marketing::555900177', 'colbun-marketing', '555900177', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('colbun-marketing::555950160', 'colbun-marketing', '555950160', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('amipass::510459144', 'amipass', '510459144', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('cornerstone::520473140', 'cornerstone', '520473140', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('cornerstone::512754838', 'cornerstone', '512754838', CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint

INSERT OR IGNORE INTO `portfolios` (`id`, `name`, `countries`, `ga4_property_id`, `created_at`, `updated_at`, `created_by`)
VALUES ('bodenor-flexcenter', 'Bodenor Flexcenter', 'CL', '430828037',
        CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 'migracion');
--> statement-breakpoint

INSERT OR IGNORE INTO `portfolio_accounts` (`id`, `portfolio_id`, `external_id`, `created_at`) VALUES
  ('bodenor-flexcenter::414-969-7360', 'bodenor-flexcenter', '414-969-7360', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('bodenor-flexcenter::551831377', 'bodenor-flexcenter', '551831377', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('bodenor-flexcenter::507218626', 'bodenor-flexcenter', '507218626', CAST(strftime('%s','now') AS INTEGER) * 1000);
