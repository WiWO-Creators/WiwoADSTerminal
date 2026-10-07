/**
 * Identificador de esta versión de la app (el commit con el que se construyó). Lo fija Vite al construir (`define` en
 * `vite.config.ts`): el navegador lleva el de la versión que cargó y el servidor responde el de la que corre ahora, y si
 * difieren es que se desplegó algo nuevo. En desarrollo vale «dev» y no se avisa nada.
 */
declare const __WIWO_BUILD__: string | undefined;

export const BUILD_ID: string = typeof __WIWO_BUILD__ !== "undefined" && __WIWO_BUILD__ ? __WIWO_BUILD__ : "dev";
