-- Auditoría unificada, 2026-10-07: una sola bitácora de todo lo que pasa en WiWO.ADS (qué se le pide al asistente, solicitudes,
-- decisiones, cambios con su antes y después, creaciones, reglas y equipo). Solo se escribe; no se edita ni se borra desde la app.
CREATE TABLE `auditoria` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	-- asistente | solicitud | decision | cambio | creacion | regla | equipo
	`categoria` text NOT NULL,
	-- Qué pasó, en una palabra: pregunta, herramienta, creada, aprobada, rechazada, retirada, descartada, aplicado…
	`accion` text NOT NULL,
	`actor_email` text NOT NULL,
	`actor_nombre` text,
	`portfolio_id` text,
	`portfolio_nombre` text,
	`plataforma` text,
	`entidad_tipo` text,
	`entidad_id` text,
	`entidad_nombre` text,
	-- La frase que lee una persona.
	`titulo` text NOT NULL,
	-- ok | error | pendiente | rechazado
	`resultado` text NOT NULL DEFAULT 'ok',
	-- normal | alta (presupuesto, rechazos, fallos)
	`importancia` text NOT NULL DEFAULT 'normal',
	-- presupuesto, titulo, contenido, estado, segmentacion… separadas por coma, para filtrar.
	`etiquetas` text NOT NULL DEFAULT '',
	-- Antes y después, texto del pedido, motivo, pasos… en JSON.
	`detalle_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_auditoria_creada` ON `auditoria` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_auditoria_categoria` ON `auditoria` (`categoria`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_auditoria_actor` ON `auditoria` (`actor_email`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_auditoria_cliente` ON `auditoria` (`portfolio_id`, `created_at`);
