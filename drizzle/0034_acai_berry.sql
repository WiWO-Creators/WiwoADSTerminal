-- Acai Berry: cliente del equipo con plataformas por definir (2026-10-05). Se crea sin cuentas; la cuenta de Meta
-- «Acaiberry» (propiedad de acaiberry.cl, visible en el portafolio Meetwiwo.com) se asocia cuando se confirme su ID.
INSERT OR IGNORE INTO `portfolios` (`id`, `name`, `countries`, `empresa`, `created_at`, `updated_at`, `created_by`)
VALUES ('acai-berry', 'Acai Berry', 'CL', 'wiwo',
        CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 'migracion');
