-- Sugerencias por cliente: cada recomendación de `decisions` ahora sabe a QUÉ
-- entidad se refiere (cliente, plataforma, cuenta, campaña) y qué cambio
-- concreto propone.
--
-- Hasta acá la tabla guardaba solo texto para mostrar (título, diagnóstico,
-- "antes"/"después") y el cliente por nombre. Eso alcanza para leer, no para
-- filtrar por cliente con seguridad ni para abrir la campaña en el editor con
-- el cambio ya cargado.
--
-- Todo es opcional: las filas viejas quedan como estaban y se siguen
-- mostrando (por nombre de cliente) hasta que venzan.
--
-- action_json: cambio propuesto, un JSON con `tipo`:
--   {"tipo":"pausar"} | {"tipo":"presupuesto","monto":N,"actual":N} | {"tipo":"revisar"}
ALTER TABLE `decisions` ADD `portfolio_id` text;
--> statement-breakpoint
ALTER TABLE `decisions` ADD `provider` text;
--> statement-breakpoint
ALTER TABLE `decisions` ADD `account_id` text;
--> statement-breakpoint
ALTER TABLE `decisions` ADD `entity_level` text;
--> statement-breakpoint
ALTER TABLE `decisions` ADD `entity_id` text;
--> statement-breakpoint
ALTER TABLE `decisions` ADD `entity_name` text;
--> statement-breakpoint
ALTER TABLE `decisions` ADD `action_json` text;
--> statement-breakpoint
CREATE INDEX `idx_decisions_portfolio_status` ON `decisions` (`portfolio_id`,`status`);
