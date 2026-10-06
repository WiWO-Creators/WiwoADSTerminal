-- Reglas automáticas por campaña, conjunto o anuncio (ej. «si el gasto de hoy llega a 10 USD, pausar»).
CREATE TABLE `reglas_automaticas` (
	`id` text PRIMARY KEY NOT NULL,
	`portfolio_id` text NOT NULL,
	`provider` text NOT NULL,
	`account_id` text NOT NULL,
	`nivel` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_name` text NOT NULL,
	`campaign_id` text,
	`adset_id` text,
	`metrica` text NOT NULL,
	`operador` text NOT NULL,
	`umbral` real NOT NULL,
	`periodo` text NOT NULL,
	`accion` text NOT NULL,
	`moneda` text,
	`activa` integer NOT NULL DEFAULT 1,
	`creada_por` text NOT NULL,
	`created_at` integer NOT NULL,
	`disparada_clave` text,
	`disparada_at` integer,
	`ultimo_valor` real,
	`ultimo_resultado` text
);
--> statement-breakpoint
CREATE INDEX `idx_reglas_portfolio` ON `reglas_automaticas` (`portfolio_id`);
