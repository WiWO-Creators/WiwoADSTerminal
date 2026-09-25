import { getSession } from "@/app/sesion";
import { mismoOrigen } from "@/lib/origen-publico";
import {
  AlmacenamientoError,
  subirCreativo,
} from "@/lib/almacenamiento";
import { problemaDeUrlPublica } from "@/lib/constructor";
import {
  GeneradorCreativosError,
  generarVariante,
  type EstrategiaId,
  type ProporcionId,
  ESTRATEGIAS,
  PROPORCIONES,
} from "@/lib/generador-creativos";
import { can, enAlcance } from "@/lib/permisos";

/**
 * Genera una variante de formato de la pieza de Meta ya cargada en el
 * Constructor (`draft.mediaUrl`) y la deja subida a R2, lista para usar
 * exactamente igual que un archivo subido a mano.
 *
 * No recibe el archivo del cliente: lee `sourceUrl` (la pieza ya puesta en
 * el Constructor) desde acá mismo, así no hay que volver a subir el
 * original solo para generar una variante suya.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "crear_campanas")) {
    return fail("Tu rol no puede construir campañas", 403);
  }

  if (!mismoOrigen(request)) {
    return fail("Origen no permitido", 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415);
  }

  const body = (await request.json()) as {
    portfolioId?: string;
    sourceUrl?: string;
    proporcion?: string;
    estrategia?: string;
  };

  const portfolioId = body.portfolioId ?? "";
  if (!portfolioId || !enAlcance(session.actor, portfolioId)) {
    return fail("Ese cliente no está en tu alcance", 403);
  }
  if (!body.sourceUrl) return fail("Falta la pieza a adaptar", 400);
  // Mismo validador que ya protege `draft.mediaUrl` en el Constructor
  // (`problemaDeUrlPublica`): sin esto, cualquiera con permiso de crear
  // campañas podía pedirle a este Worker que hiciera un GET a una dirección
  // interna o de metadata en vez de una imagen pública real.
  const problemaUrl = problemaDeUrlPublica(body.sourceUrl);
  if (problemaUrl) return fail(problemaUrl, 400);
  if (!body.proporcion || !(body.proporcion in PROPORCIONES)) {
    return fail("Proporción no válida", 400);
  }
  if (!body.estrategia || !(body.estrategia in ESTRATEGIAS)) {
    return fail("Estrategia no válida", 400);
  }
  const proporcion = body.proporcion as ProporcionId;
  const estrategia = body.estrategia as EstrategiaId;

  try {
    // La pieza base puede ser una URL de R2 (recién subida) o cualquier URL
    // pública que alguien haya pegado a mano — de cualquiera se puede leer.
    const origen = await fetch(body.sourceUrl, { signal: AbortSignal.timeout(20_000) });
    if (!origen.ok) {
      return fail("No se pudo leer la pieza actual para generar la variante", 502);
    }
    const contentType = (origen.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!contentType.startsWith("image/")) {
      return fail("Solo se pueden generar variantes de una imagen, no de un video", 400);
    }
    const bytes = await origen.arrayBuffer();
    const base64 = arrayBufferABase64(bytes);

    const variante = await generarVariante({
      imagenBase: { data: base64, mimeType: contentType },
      proporcion,
      estrategia,
    });

    const resultado = await subirCreativo(
      { type: variante.mimeType, data: base64ABuffer(variante.data) },
      new URL(request.url).origin,
    );
    return Response.json(resultado, { headers: NO_STORE });
  } catch (error) {
    const mensaje =
      error instanceof AlmacenamientoError || error instanceof GeneradorCreativosError
        ? error.message
        : "No se pudo generar la variante";
    const status =
      error instanceof AlmacenamientoError || error instanceof GeneradorCreativosError
        ? error.status
        : 500;
    if (status === 500) console.error("WiWO.ADS generar variante", error);
    return fail(mensaje, status);
  }
}

function arrayBufferABase64(buffer: ArrayBuffer): string {
  let binario = "";
  const bytes = new Uint8Array(buffer);
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  }
  return btoa(binario);
}

function base64ABuffer(base64: string): ArrayBuffer {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
