-- Se suma otro Director, 2026-10-06: jdiaz@mgcglobalgroup.com, administrador (puede aprobar cambios de presupuesto junto a
-- Franz, Amparo, Albert y Polo).
INSERT OR IGNORE INTO `users` (`id`, `email`, `display_name`, `role`, `is_active`, `created_at`, `last_seen_at`, `invited_by`, `invited_at`, `cargo`) VALUES
  ('email:jdiaz@mgcglobalgroup.com', 'jdiaz@mgcglobalgroup.com', 'J. Díaz', 'admin', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000, 'Director');
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin', `is_active` = 1, `cargo` = 'Director' WHERE `email` = 'jdiaz@mgcglobalgroup.com';
