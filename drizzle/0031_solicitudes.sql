-- Solicitudes de publicación (2026-10-05): un analista arma algo y un supervisor lo aprueba o lo rechaza.
-- drafts_json: los borradores del Constructor (uno o varios, p. ej. varias publicaciones a impulsar en un conjunto).
-- resultado_json: ids y pasos de lo creado al aprobar. avisada = 1 cuando quien la creó ya vio su estado final.
CREATE TABLE `solicitudes` (
  `id` text PRIMARY KEY NOT NULL,
  `portfolio_id` text NOT NULL,
  `portfolio_name` text NOT NULL,
  `plataformas` text NOT NULL,
  `titulo` text NOT NULL,
  `destino` text NOT NULL,
  `drafts_json` text NOT NULL,
  `estado` text NOT NULL,
  `creador_email` text NOT NULL,
  `creador_nombre` text NOT NULL,
  `revisor_email` text,
  `revisor_nombre` text,
  `nota_revision` text,
  `error_texto` text,
  `resultado_json` text,
  `enlaces_json` text,
  `avisada` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `resuelta_at` integer,
  `publicada_at` integer,
  `activa_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_solicitudes_estado` ON `solicitudes` (`estado`);
--> statement-breakpoint
CREATE INDEX `idx_solicitudes_creador` ON `solicitudes` (`creador_email`);
