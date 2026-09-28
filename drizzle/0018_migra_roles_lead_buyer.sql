-- Se elimina el rol "lead" (fusionado en "supervisor": mismas capacidades —
-- ve todo, crea y aprueba, administra conexiones — pero ahora sin poder
-- modificar a nadie del equipo, solo sumar gente nueva) y "buyer" (fusionado
-- en "analyst": deja de poder publicar directo, pasa a poder sugerir vía IA,
-- ver todos los clientes en vez de solo los asignados, y dar de alta
-- clientes nuevos asignándoles su portafolio).
--
-- Nadie queda con un rol que ya no existe: `normalizeRole` (lib/permisos.ts)
-- cae a "analyst" ante cualquier valor no reconocido, así que sin esta
-- migración un "lead" o "buyer" viejo perdería silenciosamente sus permisos
-- en el primer login después del deploy en vez de mapear a su equivalente.
UPDATE `users` SET `role` = 'supervisor' WHERE `role` = 'lead';
--> statement-breakpoint
UPDATE `users` SET `role` = 'analyst' WHERE `role` = 'buyer';
