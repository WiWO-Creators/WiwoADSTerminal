-- Memoria del asistente (2026-10-05): lo que el equipo quiere que recuerde para trabajar mejor con el tiempo.
-- scope: 'equipo' (vale para todos los clientes) o el id de un cliente. Nunca se guardan datos personales ni credenciales
-- (lo valida `lib/asistente-memoria.ts` antes de escribir).
CREATE TABLE `asistente_memoria` (
  `id` text PRIMARY KEY NOT NULL,
  `scope` text NOT NULL,
  `texto` text NOT NULL,
  `autor_email` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `usos` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_asistente_memoria_scope` ON `asistente_memoria` (`scope`);
