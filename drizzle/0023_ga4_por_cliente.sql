-- Propiedad de Google Analytics 4 por cliente: con ella la plataforma vigila la
-- salud de la medición (eventos clave mal marcados, leads que no cuentan o que
-- dejaron de llegar, eventos duplicados).
--
-- ga4_property_id: ID numérico de la propiedad de GA4 (por ejemplo 307451372).
--   Es el mismo que Windsor usa como cuenta del conector de Google Analytics 4.
--   Opcional: sin él, el cliente simplemente no tiene vigilancia de medición.
ALTER TABLE `portfolios` ADD `ga4_property_id` text;
