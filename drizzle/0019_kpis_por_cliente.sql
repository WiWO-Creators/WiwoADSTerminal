-- KPIs por cliente: qué es "buen rendimiento" para CADA cliente, no un único
-- conjunto de métricas para todos.
--
-- Un CPA de $8.000 puede ser excelente para un cliente y pésimo para otro, y un
-- cliente de awareness se juzga por alcance y CPM, no por conversiones. La
-- 0013 ya trajo la meta de CPA y de ROAS; esto agrega el KPI principal (qué
-- se mira primero y qué columnas se muestran por defecto en las tablas) y tres
-- metas complementarias que sirven a los clientes que no compran por CPA.
--
-- Todo es opcional: un cliente sin metas simplemente no genera señales contra
-- meta (no es un error, es la ausencia del dato).
--
-- kpi_principal: 'leads' | 'ventas' | 'trafico' | 'alcance' | 'mensajes'.
-- target_cpm_micros: CPM objetivo, en micros como el resto del dinero.
-- target_ctr_bp: CTR mínimo esperado, en centésimas de punto porcentual
--   (150 = 1,50 %), como entero para no depender de floats en SQLite.
-- max_frequency_x10: frecuencia máxima tolerada, por diez (35 = 3,5 veces).
ALTER TABLE `portfolios` ADD `kpi_principal` text;
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `target_cpm_micros` integer;
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `target_ctr_bp` integer;
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `max_frequency_x10` integer;
