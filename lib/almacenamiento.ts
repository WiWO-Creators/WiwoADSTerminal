import { env } from "cloudflare:workers";

/**
 * Guarda archivos de creativos en R2 y arma la URL pública que Windsor le
 * pasa a Google y a Meta.
 *
 * Hasta ahora la única forma de poner una pieza en el Constructor era pegar
 * una URL ya pública: alguien tenía que subir el archivo a otro lado primero.
 * Esto cierra ese hueco, con una condición real que no depende de este
 * código: la URL que arma `subirCreativo` solo es alcanzable por Google o
 * Meta si el sitio mismo es público. En desarrollo local (`localhost`),
 * sirve para previsualizar dentro de la app, pero ni Google ni Meta van a
 * poder ir a buscarla — para publicar de verdad con un archivo subido acá,
 * el sitio necesita estar desplegado.
 */
export class AlmacenamientoError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

/** Verificado contra lo que Meta y Google realmente aceptan como creativo de imagen o video. */
const EXTENSION_POR_TIPO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

const TAMANO_MAXIMO_BYTES = 200 * 1024 * 1024;

export function r2Configurado(): boolean {
  return Boolean(env.MEDIA);
}

export async function subirCreativo(
  archivo: File,
  origin: string,
): Promise<{ url: string; key: string }> {
  if (!env.MEDIA) {
    throw new AlmacenamientoError(
      "El almacenamiento de creativos no está configurado en este entorno.",
      503,
    );
  }

  const extension = EXTENSION_POR_TIPO[archivo.type];
  if (!extension) {
    throw new AlmacenamientoError(
      `Formato no admitido (${archivo.type || "desconocido"}). Usa JPG, PNG, WEBP, GIF, MP4 o MOV.`,
    );
  }
  if (archivo.size === 0) {
    throw new AlmacenamientoError("El archivo llegó vacío.");
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    throw new AlmacenamientoError(
      `El archivo pesa demasiado (máximo ${TAMANO_MAXIMO_BYTES / (1024 * 1024)} MB).`,
    );
  }

  const key = `creativos/${crypto.randomUUID()}.${extension}`;
  await env.MEDIA.put(key, await archivo.arrayBuffer(), {
    httpMetadata: { contentType: archivo.type },
  });

  return { url: `${origin}/api/media/${key}`, key };
}

/** Lee un creativo ya subido. `null` si no existe o si la clave no es de este espacio. */
export async function leerCreativo(key: string): Promise<R2Object | null> {
  if (!env.MEDIA || !key.startsWith("creativos/")) return null;
  return env.MEDIA.get(key);
}
