-- Colbún vuelve a ser UN cliente, con dos segmentos: Comunicaciones (Google y Meta) y Marketing (LinkedIn).
-- Las cuentas de LinkedIn pasan del cliente «Colbún Marketing» (creado en 0024) al de Colbún, y ese cliente
-- aparte se elimina.
UPDATE OR IGNORE `portfolio_accounts`
   SET `portfolio_id` = 'colbun', `id` = 'colbun::' || `external_id`
 WHERE `portfolio_id` = 'colbun-marketing';
--> statement-breakpoint

DELETE FROM `portfolio_accounts` WHERE `portfolio_id` = 'colbun-marketing';
--> statement-breakpoint

DELETE FROM `portfolios` WHERE `id` = 'colbun-marketing' AND `created_by` = 'migracion';
--> statement-breakpoint

UPDATE `portfolios`
   SET `name` = 'Colbún',
       `segments` = '[{"id":"comunicaciones","nombre":"Comunicaciones","plataformas":["google","meta"]},{"id":"marketing","nombre":"Marketing (LinkedIn)","plataformas":["linkedin"]}]'
 WHERE `id` = 'colbun' AND `name` IN ('Colbún Comunicaciones', 'Colbún Energía');
