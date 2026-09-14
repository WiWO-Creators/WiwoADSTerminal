import { getSession } from "@/app/sesion";
import { AlmacenamientoError, subirCreativo } from "@/lib/almacenamiento";
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

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return fail("Formato de solicitud no válido", 415);
  }

  try {
    const form = await request.formData();
    const portfolioId = String(form.get("portfolioId") ?? "");
    if (!portfolioId || !enAlcance(session.actor, portfolioId)) {
      return fail("Ese cliente no está en tu alcance", 403);
    }

    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) {
      return fail("Falta el archivo", 400);
    }

    const resultado = await subirCreativo(
      archivo,
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
