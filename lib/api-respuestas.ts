/**
 * Respuestas de error uniformes para las rutas de `app/api/*`.
 *
 * Antes cada ruta definía su propia función `fail`/`fallo`/`responseError`
 * (20 copias idénticas), y el mensaje era el único rastro de qué pasó — "Tu
 * cuenta no tiene acceso a WiWO.ADS" o "Origen no permitido" salían iguales
 * desde cualquiera de las 20 rutas, sin forma de saber cuál los devolvió sin
 * mirar el código. El `code` es justo para eso: un identificador estable que
 * no cambia aunque el texto del mensaje se traduzca o se reredacte, así que
 * sirve para buscar en los logs del VPS (`grep`) o para que la persona que
 * ve el error lo mencione al pedir ayuda ("me salió SEG_ORIGEN").
 *
 * No reemplaza el logging: `fail` no imprime nada por sí sola (la mayoría de
 * estos rechazos son parte normal del flujo — una sesión vencida, un rol sin
 * permiso — no un bug). Para un error real e inesperado, la ruta sigue
 * llamando a `console.error` como ya hacía antes de tener códigos.
 */

export function fail(message: string, status: number, code?: string): Response {
  return Response.json(
    { error: message, ...(code ? { code } : {}) },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Códigos de los rechazos compartidos por (casi) toda ruta que escribe:
 * sesión, permiso, origen y formato. Cada dominio (equipo, clientes,
 * constructor…) sigue usando sus propios mensajes de negocio sin código
 * ("Esa persona no existe", "Ese cliente no existe…") — agregarles uno es
 * la extensión natural de este catálogo cuando haga falta diagnosticarlos,
 * no algo que haya que hacer todo de una vez.
 */
export const CODIGOS_ERROR = {
  SIN_SESION: "AUTH_SIN_SESION",
  PERMISO_INSUFICIENTE: "AUTH_SIN_PERMISO",
  ORIGEN_NO_PERMITIDO: "SEG_ORIGEN",
  CONTENT_TYPE_INVALIDO: "SEG_CONTENT_TYPE",
} as const;
