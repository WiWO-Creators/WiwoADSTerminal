/**
 * Cookie de sesión firmada.
 *
 * Antes la cookie era el correo en texto plano: cualquiera podía escribir
 * `wiwo-dev-user=admin@empresa.com` en su navegador y entrar como esa persona.
 * Ahora el valor lleva una firma HMAC-SHA256 y una fecha de vencimiento, y sin
 * el secreto del servidor no se puede fabricar ni alargar una sesión.
 *
 * Formato: `<correo en base64url>.<vence en segundos>.<firma>`.
 * Código puro (WebCrypto, sin dependencias de la plataforma) para probarlo solo.
 */

export const SESION_SEGUNDOS = 60 * 60 * 12;

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

function aBase64Url(bytes: Uint8Array): string {
  let texto = "";
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(valor: string): Uint8Array | null {
  try {
    const base64 = valor.replace(/-/g, "+").replace(/_/g, "/");
    const binario = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return Uint8Array.from(binario, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function firmar(secreto: string, dato: string): Promise<Uint8Array> {
  const llave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(`wiwo-sesion:${secreto}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", llave, codificador.encode(dato)));
}

/** Comparación en tiempo constante: no filtra cuántos bytes de la firma acertó. */
function iguales(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

export async function firmarSesion(
  correo: string,
  secreto: string,
  ahora = Date.now(),
): Promise<string> {
  const cuerpo = `${aBase64Url(codificador.encode(correo.trim().toLowerCase()))}.${
    Math.floor(ahora / 1000) + SESION_SEGUNDOS
  }`;
  return `${cuerpo}.${aBase64Url(await firmar(secreto, cuerpo))}`;
}

/** El correo de la sesión, o `null` si la firma no cuadra o ya venció. */
export async function verificarSesion(
  valor: string | undefined | null,
  secreto: string,
  ahora = Date.now(),
): Promise<string | null> {
  if (!valor || !secreto) return null;
  const partes = valor.split(".");
  if (partes.length !== 3) return null;
  const [correoB64, vence, firmaRecibida] = partes;

  const recibida = deBase64Url(firmaRecibida);
  if (!recibida || !iguales(recibida, await firmar(secreto, `${correoB64}.${vence}`))) {
    return null;
  }
  if (!Number.isFinite(Number(vence)) || Number(vence) * 1000 < ahora) return null;

  const bytes = deBase64Url(correoB64);
  return bytes ? decodificador.decode(bytes) : null;
}
