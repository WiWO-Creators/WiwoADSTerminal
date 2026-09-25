/**
 * Responsabilidad: traducir los códigos de error del flujo de acceso al
 *   mensaje en español que se le muestra a la persona.
 * Usado por: app/acceso/page.tsx (cuando el error llega por query string, en
 *   el flujo clásico de redirección) y app/acceso/boton-google.tsx (cuando
 *   llega por el canal de la ventana emergente).
 * NO hace: decidir quién puede entrar — eso vive en las rutas de
 *   /api/acceso/google y en lib/equipo.ts.
 */

export const ERRORES_ACCESO: Record<string, string> = {
  google_no_configurado:
    "Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.",
  google_cancelado: "Cancelaste el inicio de sesión con Google.",
  google_estado_invalido:
    "La vuelta desde Google no se pudo verificar. Inténtalo otra vez.",
  google_token_rechazado: "Google rechazó la credencial. Revisa el secreto.",
  google_perfil_rechazado: "No pudimos leer tu perfil de Google.",
  google_sin_correo: "Esa cuenta de Google no expone un correo verificado.",
  google_dominio_no_permitido:
    "Esta app es solo para el equipo — entra con tu correo @mgcglobalgroup.com o @wiwo.me.",
  google_falla_red: "No pudimos hablar con Google. Revisa la conexión.",
};

/**
 * Devuelve el mensaje de un código de error, o `null` si no hay error.
 *
 * Un código desconocido cae en un mensaje genérico en vez de quedar vacío:
 * sin esto, un código nuevo pintaría un recuadro de alerta sin texto.
 */
export function mensajeDeError(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return (
    ERRORES_ACCESO[codigo] ?? "No pudimos iniciar sesión. Inténtalo otra vez."
  );
}
