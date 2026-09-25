-- Sitio web del cliente, por cliente (no por cuenta): la URL base real a la
-- que apuntan sus campañas de tráfico.
--
-- Sin esto, cada campaña nueva dependía de que la persona la tipeara de
-- nuevo (o de que el Orb la inventara), aunque WiWO.ADS ya sabe qué cliente
-- está eligiendo la campaña. Con la URL guardada en la ficha del cliente,
-- abrir_constructor la completa sola cuando nadie da una URL explícita —
-- confirmado necesario con Colbún (2026-09-24): "el url base debe saber
-- siempre el del cliente, ej https://colbun.cl".
ALTER TABLE `portfolios` ADD `website` text;
