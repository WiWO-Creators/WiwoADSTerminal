-- Digital Creators (rol analista): ven la gestión y arman cambios, pero todo va a aprobación; los cambios de presupuesto, a un Director Digital o superior. 2026-10-06.
INSERT OR IGNORE INTO `users` (`id`, `email`, `display_name`, `role`, `is_active`, `created_at`, `last_seen_at`, `invited_by`, `invited_at`) VALUES
  ('email:aarroyo@mgcglobalgroup.com', 'aarroyo@mgcglobalgroup.com', 'Álvaro Arroyo', 'analyst', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:sode@mgcglobalgroup.com', 'sode@mgcglobalgroup.com', 'Sofía Ode', 'analyst', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:cmuller@mgcglobalgroup.com', 'cmuller@mgcglobalgroup.com', 'C. Müller', 'analyst', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('email:sofia@wiwo.me', 'sofia@wiwo.me', 'Sofía Migliaro', 'analyst', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, 0, 'sistema', CAST(strftime('%s','now') AS INTEGER) * 1000);
--> statement-breakpoint
UPDATE `users` SET `role` = 'analyst', `is_active` = 1, `cargo` = 'Digital Creator'
  WHERE `email` IN ('aarroyo@mgcglobalgroup.com', 'sode@mgcglobalgroup.com', 'cmuller@mgcglobalgroup.com', 'sofia@wiwo.me');
