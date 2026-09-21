import { getSession } from "@/app/sesion";
import {
  AlmacenamientoError,
  subirCreativo,
  TAMANO_MAXIMO_BYTES,
} from "@/lib/almacenamiento";
import { can, enAlcance } from "@/lib/permisos";

/**
 * Sube un archivo de creativo a R2 y devuelve la URL pública que el resto
 * del Constructor usa exactamente igual que una URL pegada a mano.
 *
 * Mismo alcance por permisos que el resto del Constructor: no es una subida
 * de archivos genérica, es parte del mismo flujo de armar un anuncio.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "crear_campanas")) {
    return fail("Tu rol no puede construir campañas", 403);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fail("Origen no permitido", 403);
  }

  // El archivo llega como cuerpo crudo, con su tipo en `content-type` y el
  // cliente en `x-portfolio-id` — no como multipart. vinext trata todo POST
  // multipart sin id de acción como una acción de servidor y le aplica el
  // tope de 1 MB de esas acciones, incluso en rutas de /api: con multipart,
  // cualquier imagen de más de 1 MB volvía como "Payload Too Large" en texto
  // plano.
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > TAMANO_MAXIMO_BYTES) {
    return fail(
      `El archivo pesa demasiado (máximo ${TAMANO_MAXIMO_BYTES / (1024 * 1024)} MB). Si es un video, pega su URL en vez de subirlo.`,
      413,
    );
  }

  try {
    const portfolioId = decodeURIComponent(
      request.headers.get("x-portfolio-id") ?? "",
    );
    if (!portfolioId || !enAlcance(session.actor, portfolioId)) {
      return fail("Ese cliente no está en tu alcance", 403);
    }

    const resultado = await subirCreativo(
      { type: contentType, data: await request.arrayBuffer() },
      new URL(request.url).origin,
    );
    return Response.json(resultado, { headers: NO_STORE });
  } catch (error) {
    const mensaje =
      error instanceof AlmacenamientoError
        ? error.message
        : "No se pudo subir el archivo";
    const status = error instanceof AlmacenamientoError ? error.status : 500;
    if (status === 500) console.error("WiWO.ADS subir creativo", error);
    return fail(mensaje, status);
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
