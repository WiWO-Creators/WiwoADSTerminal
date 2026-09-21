-- Página de Facebook por cuenta, no solo por cliente.
--
-- SQM lo demuestra: un mismo cliente factura Meta desde tres cuentas
-- distintas (SPN/México, España, LATAM) y cada una publica bajo su propia
-- página regional. El campo `page_id` de `portfolios` solo admitía una, así
-- que un cliente con varias identidades de Meta no tenía dónde guardar la
-- segunda y la tercera.
ALTER TABLE `portfolio_accounts` ADD `page_id` text;
