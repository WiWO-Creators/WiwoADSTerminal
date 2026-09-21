-- Metas de rendimiento por cliente, para el motor de reglas.
--
-- Sin una meta explícita no hay "bueno" ni "malo" que evaluar: un CPA de
-- $8.000 puede ser excelente para un cliente y pésimo para otro. Estas dos
-- columnas son la única fuente de esas metas; el motor de reglas nunca
-- inventa un umbral por su cuenta. Un cliente sin meta simplemente no genera
-- recomendaciones de presupuesto — no es un error, es la ausencia del dato.
--
-- CPA en micros, igual que el resto del dinero en este sistema. ROAS como
-- entero en centésimas (350 = 3.50x) para no depender de floats en SQLite.
ALTER TABLE `portfolios` ADD `target_cpa_micros` integer;
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `target_roas_bp` integer;
