-- Países de segmentación por cuenta, no solo por cliente.
--
-- ALO Group lo demuestra igual que SQM demostró la página: seis cuentas de
-- Google Ads, una por país (Chile, Panamá, Perú, Colombia, Ecuador,
-- Argentina). Un solo campo de países por cliente no puede describir eso —
-- "6 países" en el portafolio no dice cuál cuenta apunta a cuál.
ALTER TABLE `portfolio_accounts` ADD `countries` text;
