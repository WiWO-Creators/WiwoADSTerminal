/**
 * Responsabilidad: definir el contrato entre la ventana emergente del acceso
 *   con Google y la ventana que la abrió, y construir la página que cierra la
 *   emergente avisando el resultado.
 * Usado por: app/api/acceso/google/callback/route.ts y
 *   app/api/acceso/google/route.ts (construyen la respuesta);
 *   app/acceso/boton-google.tsx (escucha el canal).
 * NO hace: validar la vuelta de Google ni crear la sesión — eso es del
 *   callback.
 *
 * Por qué un canal y no `window.opener`: las pantallas de Google viajan con
 * Cross-Origin-Opener-Policy, que puede cortar el vínculo entre la emergente y
 * su ventana madre. BroadcastChannel no depende de ese vínculo, solo de que
 * ambas ventanas compartan origen.
 */

export const CANAL_ACCESO = "wiwo-acceso";

/** Respaldo para navegadores sin BroadcastChannel: 'storage' avisa al resto. */
export const CLAVE_RESULTADO = "wiwo-acceso-resultado";

export type ResultadoAcceso =
  | { ok: true; destino: string }
  | { ok: false; error: string };

/**
 * Página mínima que anuncia el resultado y se cierra sola.
 *
 * Reemplaza a la redirección 302 del flujo clásico: en la emergente no hay a
 * dónde redirigir, porque quien tiene que moverse es la ventana de atrás.
 */
export function respuestaCierrePopup(resultado: ResultadoAcceso): Response {
  // `<` escapado: impide que un valor cierre la etiqueta <script> antes de tiempo.
  const datos = JSON.stringify(resultado).replace(/</g, "\u003c");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Acceso WiWO.ADS</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #292929; color: #F8FAD7;
         font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  p { font-size: 0.85rem; opacity: 0.62; }
</style>
</head>
<body>
<p id="aviso">Cerrando…</p>
<script>
(function () {
  var resultado = ${datos};
  try {
    var canal = new BroadcastChannel(${JSON.stringify(CANAL_ACCESO)});
    canal.postMessage(resultado);
    canal.close();
  } catch (e) {}
  try {
    localStorage.setItem(
      ${JSON.stringify(CLAVE_RESULTADO)},
      JSON.stringify({ resultado: resultado, ts: Date.now() })
    );
  } catch (e) {}
  window.close();
  // Si el navegador no deja cerrar por script, que no quede una ventana muda.
  setTimeout(function () {
    var aviso = document.getElementById("aviso");
    if (aviso) aviso.textContent = "Ya puedes cerrar esta ventana.";
  }, 600);
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
