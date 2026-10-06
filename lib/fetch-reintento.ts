/**
 * fetch con reintentos para lecturas que a veces fallan por un corte de red o un arranque en frío del servidor
 * (el «Network connection lost» de la primera carga).
 *
 * - Reintenta fallos de RED, y en GET también 429/502/503/504 (respuestas que dicen «inténtalo otra vez»).
 * - Una respuesta de error normal (400, 403, 404, 500…) se devuelve tal cual: repetirla no la arregla.
 * - Si quien llama cancela (AbortController), no se reintenta.
 * - Sin señal propia, cada intento tiene su tope de tiempo para que un servidor que no responde no
 *   bloquee los reintentos siguientes.
 */
const REINTENTABLES = new Set([429, 502, 503, 504]);

export async function fetchConReintento(
  input: string,
  init: RequestInit = {},
  intentos = 3,
  timeoutMs = 20_000,
): Promise<Response> {
  const esGet = (init.method ?? "GET").toUpperCase() === "GET";
  let ultimoError: unknown;
  let ultimaRespuesta: Response | null = null;

  for (let intento = 0; intento < intentos; intento += 1) {
    if (init.signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    try {
      const respuesta = await fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
      if (!(esGet && REINTENTABLES.has(respuesta.status)) || intento === intentos - 1) return respuesta;
      ultimaRespuesta = respuesta;
    } catch (error) {
      if (init.signal?.aborted) throw error;
      ultimoError = error;
    }
    if (intento < intentos - 1) await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** intento));
  }
  if (ultimaRespuesta) return ultimaRespuesta;
  throw ultimoError;
}
