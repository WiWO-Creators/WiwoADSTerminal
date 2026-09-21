-- Registro de lo que WiWO.ADS sí ejecutó en las plataformas.
--
-- Hasta ahora el sistema solo leía, así que no había nada que registrar. Con
-- la creación real de campañas aparece la primera acción que cambia algo
-- fuera de acá, en la cuenta de un cliente, y eso no puede quedar sin rastro:
-- hay que poder responder "quién creó esto, cuándo, con qué parámetros y qué
-- respondió la plataforma" sin depender de la memoria de nadie.
--
-- Va aparte de `audit_events` porque esa tabla cuelga de `decisions` —cada
-- evento referencia una decisión existente— y una creación de campaña no nace
-- de una decisión de la cola.
CREATE TABLE `ejecuciones` (
	`id` text PRIMARY KEY NOT NULL,
	`portfolio_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`campaign_name` text NOT NULL,
	`platforms` text NOT NULL,
	-- Cada paso con sus parámetros exactos y la respuesta cruda de la
	-- plataforma. Crudo a propósito: un resumen bonito pierde justo el detalle
	-- que se necesita cuando algo sale mal.
	`steps_json` text NOT NULL,
	`ok` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ejecuciones_portfolio` ON `ejecuciones` (`portfolio_id`);
