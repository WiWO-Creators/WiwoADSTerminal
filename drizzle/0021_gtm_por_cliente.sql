-- Google Tag Manager por cliente: ¿el sitio del cliente tiene GTM o no?
--
-- La medición de leads y conversiones depende de que el marcaje esté en un
-- contenedor de GTM. Hay clientes que directamente no lo tienen (o lo gestiona
-- otra persona), y eso tiene que verse: si un cliente está marcado como "sin
-- GTM", la plataforma muestra la alerta "NO cuenta con GTM".
--
-- gtm_estado: NULL (sin verificar) | 'tiene' | 'no_tiene'. NULL no genera
--   alerta: no se afirma que falte algo que nadie ha confirmado.
-- gtm_container_id: ID del contenedor (GTM-XXXXXXX), solo si tiene.
ALTER TABLE `portfolios` ADD `gtm_estado` text;
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `gtm_container_id` text;
