-- Equipo de WiWO.ADS: cargo de cada persona y su rol en el sistema, 2026-10-06.
--   Directores y jefes → administrador (todo, incluido Cuentas y aprobar presupuesto).
--   Digital Leads → supervisor (crean y aprueban a nivel de campañas y clientes; el presupuesto de otros lo aprueba un administrador).
--   Digital Creators → analista (se agregan desde Equipo; sus cambios van a aprobación).
-- Polo, A. Fernández y aveas@ son además administradores fundadores (OAUTH_ADMIN_EMAILS del servidor): nadie los modifica desde la app.
ALTER TABLE `users` ADD `cargo` text;
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`, `email`, `display_name`, `role`, `is_active`, `created_at`, `last_seen_at`, `invited_by`, `invited_at`) VALUES
  ('email:polo@wiwo.me', 'polo@wiwo.me', 'Polo', 'admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:afernandez@mgcglobalgroup.com', 'afernandez@mgcglobalgroup.com', 'A. Fernández', 'admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:aveas@mgcglobalgroup.com', 'aveas@mgcglobalgroup.com', 'Amaro Veas', 'admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:franz.albornoz@mgcglobalgroup.com', 'franz.albornoz@mgcglobalgroup.com', 'Franz Albornoz', 'admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:aurrejola@mgcglobalgroup.com', 'aurrejola@mgcglobalgroup.com', 'Amparo Urrejola', 'admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:amparo@wiwo.me', 'amparo@wiwo.me', 'Amparo Urrejola', 'admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:tgalvez@mgcglobalgroup.com', 'tgalvez@mgcglobalgroup.com', 'T. Gálvez', 'supervisor', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:jsantana@mgcglobalgroup.com', 'jsantana@mgcglobalgroup.com', 'JuanLuis Santana', 'supervisor', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:raimundo@wiwo.me', 'raimundo@wiwo.me', 'Raimundo', 'supervisor', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
-- Si alguna de estas personas ya estaba, se le deja el rol y el cargo que corresponden (y activa).
UPDATE `users` SET `role` = 'admin', `is_active` = 1, `cargo` = 'Director' WHERE `email` = 'polo@wiwo.me';
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin', `is_active` = 1, `cargo` = 'Director creativo' WHERE `email` = 'afernandez@mgcglobalgroup.com';
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin', `is_active` = 1, `cargo` = 'Programador' WHERE `email` = 'aveas@mgcglobalgroup.com';
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin', `is_active` = 1, `cargo` = 'Director Digital' WHERE `email` IN ('franz.albornoz@mgcglobalgroup.com', 'aurrejola@mgcglobalgroup.com', 'amparo@wiwo.me');
--> statement-breakpoint
UPDATE `users` SET `role` = 'supervisor', `is_active` = 1, `cargo` = 'Digital Lead' WHERE `email` IN ('tgalvez@mgcglobalgroup.com', 'jsantana@mgcglobalgroup.com', 'raimundo@wiwo.me');
