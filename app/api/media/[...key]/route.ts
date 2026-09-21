import { leerCreativo } from "@/lib/almacenamiento";

/**
 * Sirve los creativos subidos a R2. A propósito sin sesión: Google y Meta
 * tienen que poder buscar este archivo desde sus propios servidores, y no
 * traen ninguna cookie de WiWO.ADS cuando lo hacen.
 *
 * No es una forma de leer cualquier objeto de R2: `leerCreativo` solo
 * entrega lo que vive bajo el prefijo `creativos/`, que es exactamente lo
 * que esta misma app subió a través de `/api/creatividades/subir`.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const objeto = await leerCreativo(key.join("/"));
  if (!objeto) {
    return new Response("No encontrado", { status: 404 });
  }

  return new Response(objeto.body, {
    headers: {
      "content-type": objeto.httpMetadata?.contentType ?? "application/octet-stream",
      // La clave es un UUID que no se reutiliza: el mismo archivo para
      // siempre, así que el navegador (y el crawler de la plataforma) puede
      // quedárselo cacheado indefinidamente.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
