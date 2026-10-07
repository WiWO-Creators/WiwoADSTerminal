-- Ajuste de cargos del equipo, 2026-10-06. Los permisos los decide el rol (administrador); el cargo es el título que se muestra.
--   Polo → Super Admin (jefe, protegido). aveas → Admin. A. Fernández → Director (jefe, protegido).
--   Amparo (dos correos) → Paid Media, con la misma autoridad que Franz (Director Digital): administrador.
--   Samanta → administrador.
UPDATE `users` SET `cargo` = 'Super Admin' WHERE `email` = 'polo@wiwo.me';
--> statement-breakpoint
UPDATE `users` SET `cargo` = 'Admin' WHERE `email` = 'aveas@mgcglobalgroup.com';
--> statement-breakpoint
UPDATE `users` SET `cargo` = 'Director' WHERE `email` = 'afernandez@mgcglobalgroup.com';
--> statement-breakpoint
UPDATE `users` SET `cargo` = 'Paid Media' WHERE `email` IN ('aurrejola@mgcglobalgroup.com', 'amparo@wiwo.me');
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`, `email`, `display_name`, `role`, `is_active`, `created_at`, `last_seen_at`, `invited_by`, `invited_at`, `cargo`) VALUES
  ('email:samanta@wiwo.me', 'samanta@wiwo.me', 'Samanta', 'admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000, 'Admin');
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin', `is_active` = 1, `cargo` = COALESCE(`cargo`, 'Admin') WHERE `email` = 'samanta@wiwo.me';
