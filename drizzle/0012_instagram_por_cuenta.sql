-- Cuenta de Instagram por cliente, para poder leer su contenido publicado.
--
-- La columna `portfolios.instagram_id` existía desde 0006 y nunca se llenó:
-- nadie la necesitaba hasta ahora, que el Constructor empieza a ofrecer
-- "elegir una publicación existente" como pieza del anuncio. Sin este dato no
-- hay forma de saber qué cuenta de Instagram leer para cada cliente.
--
-- Los valores salen del listado de conectores de Windsor (cuenta hola@wiwo.me),
-- consultado el 14-09-2026, cruzado por nombre con los portafolios ya
-- declarados. Igual que en 0010, un cliente sin match acá simplemente no
-- ofrece contenido de Instagram en el selector — no es un error, solo falta el
-- dato.
--
-- `anker-soundcore` es el único caso dudoso: el portafolio junta las cuentas
-- de Anker Chile, Anker Argentina y Soundcore bajo un mismo cliente, pero solo
-- hay una cuenta de Instagram que calza con claridad (Anker Chile). Revisar
-- con el equipo si conviene separar el portafolio en vez de forzar un único
-- Instagram para los tres.
UPDATE `portfolios` SET `instagram_id` = '17841404014792364' WHERE `id` = 'colbun';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841400616667208' WHERE `id` = 'mgc';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841456603118033' WHERE `id` = 'primeros-pueblos';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841416482186531' WHERE `id` = 'maria-ayuda';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841454542105398' WHERE `id` = 'cornerstone';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841400430144802' WHERE `id` = 'skydive-andes';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841457406880239' WHERE `id` = 'agencia-palta';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841406822541373' WHERE `id` = 'alo-group';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841470822601087' WHERE `id` = 'foundaxis';
--> statement-breakpoint
UPDATE `portfolios` SET `instagram_id` = '17841466251443913' WHERE `id` = 'anker-soundcore';
