-- Empresa del grupo (MGC o WIWO) y archivado por cliente (2026-10-05).
-- Trabajan juntas: la empresa es solo un tema de orden (agrupa los selectores), no restringe nada.
-- Archivado = ya no es cliente: sale de los selectores, pero sus cuentas y su historial se conservan.
ALTER TABLE `portfolios` ADD `empresa` text;
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `archivado` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `portfolios` SET `empresa` = 'mgc'
  WHERE `id` IN ('valor', 'aima', 'agencia-palta', 'foundaxis', 'sqm', 'cornerstone', 'truecaller', 'colbun', 'primeros-pueblos', 'mgc');
--> statement-breakpoint
UPDATE `portfolios` SET `empresa` = 'wiwo'
  WHERE `id` IN ('anker-soundcore', 'alo-group', 'bodenor-flexcenter', 'maria-ayuda');
--> statement-breakpoint
-- Según el equipo, ya no son clientes.
UPDATE `portfolios` SET `archivado` = 1 WHERE `id` IN ('skydive-andes', 'amipass', 'wildsty');
