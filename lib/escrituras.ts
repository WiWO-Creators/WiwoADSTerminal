/**
 * Contador de escrituras hechas desde la app (Windsor o la API de Google Ads).
 * Las lecturas que se recuerdan unos minutos en memoria lo incluyen en su clave:
 * cualquier escritura las invalida, para que un editor o una tabla nunca
 * muestren lo anterior a un cambio recién aplicado.
 */
let escrituras = 0;
export const registrarEscritura = (): void => {
  escrituras += 1;
};
export const versionDeEscrituras = (): number => escrituras;
