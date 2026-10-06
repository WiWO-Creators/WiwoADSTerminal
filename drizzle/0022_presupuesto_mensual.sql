-- Presupuesto mensual por cliente: cuánto se acordó invertir en el mes.
--
-- Con este dato la plataforma calcula cuánto queda, a qué ritmo se está
-- gastando y si el mes va a cerrar pasado o corto. Es opcional: un cliente sin
-- presupuesto mensual simplemente no muestra la tarjeta (no se inventa un tope).
--
-- monthly_budget_micros: monto en micros de la moneda, como el resto del dinero.
-- monthly_budget_currency: código ISO (CLP, USD…). Un cliente puede facturar en
--   más de una moneda; el presupuesto se compara solo con el gasto de esa moneda.
ALTER TABLE `portfolios` ADD `monthly_budget_micros` integer;
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `monthly_budget_currency` text;
