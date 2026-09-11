-- Plataforma de cada cuenta como dato, no como deducción.
--
-- La columna `provider` existía desde 0005 y nunca se llenó: el sistema
-- deducía la plataforma mirando si la cuenta aparecía en las métricas. Eso
-- falla justo donde más duele — una cuenta recién creada, que todavía no ha
-- entregado nada, no aparece en ninguna métrica y por lo tanto queda "sin
-- plataforma" y desaparece del constructor.
--
-- El caso que lo destapó: Foundaxis tiene cuenta de Meta (1327585191742131)
-- conectada en Windsor, pero sin una sola impresión en tres años. El
-- constructor decía "este cliente no tiene cuentas de Meta Ads" cuando sí la
-- tiene. Meta conecta 20 cuentas y solo 18 tienen historial.
--
-- Los valores salen del listado de conectores de Windsor (cuenta
-- hola@wiwo.me), consultado el 11-09-2026. Es la única fuente que sabe a qué
-- plataforma pertenece una cuenta sin mirar si gastó.
UPDATE `portfolio_accounts` SET `provider` = 'google' WHERE `external_id` IN (
  '795-361-1860', '335-407-3572', '414-969-7360', '182-750-4429',
  '185-304-1133', '866-336-0598', '728-736-2856', '781-402-7498',
  '492-590-2029', '595-229-1307', '465-094-9852', '832-810-5693',
  '470-960-8868', '423-204-0466', '820-279-1929', '988-103-2709',
  '719-949-3611', '331-782-5860', '466-890-0970', '985-043-3091',
  '111-856-2413', '502-419-5795'
);
--> statement-breakpoint
UPDATE `portfolio_accounts` SET `provider` = 'meta' WHERE `external_id` IN (
  '2006250736667023', '453169699698594', '2737262463224930',
  '1553639595450932', '537158034988156', '1494126595605892',
  '25524676890466864', '346330089306398', '528836355882248',
  '792906527166172', '1327585191742131', '44274770',
  '1110358747560979', '1126066724775550', '898923521443041',
  '2195498387953258', '4252945408262033', '1271746788353880',
  '899439413222155', '985579737840293'
);
