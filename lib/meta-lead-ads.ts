import {
  cuerpoDeConjunto,
  cuerpoDeCreativo,
  problemasDelConjuntoDeFormulario,
  problemasDelCreativo,
  type CuerpoDeConjunto,
  type CreativoDeFormulario,
} from "@/lib/meta-lead-ads-pura";
import { ErrorDeMeta, graphJson } from "@/lib/meta-nativo";

/**
 * Crea con la API directa de Meta lo que Windsor no deja para un formulario instantáneo: el conjunto (destino «en el anuncio») y el
 * anuncio con el formulario en su botón. Con `validar: true` Meta valida todo SIN crear nada (`execution_options: validate_only`).
 */

const cuenta = (id: string) => `act_${id.replace(/^act_/, "").replace(/\D/g, "")}`;

type Resultado = { id: string | null; validado: boolean };

const validacion = (validar: boolean) => (validar ? { execution_options: ["validate_only"] } : {});

/** Crea (o valida) el conjunto de anuncios con destino «formulario instantáneo». */
export async function crearConjuntoDeFormulario(accountId: string, c: CuerpoDeConjunto, o: { validar?: boolean } = {}): Promise<Resultado> {
  const problemas = problemasDelConjuntoDeFormulario(c);
  if (problemas.length > 0) throw new ErrorDeMeta(problemas.join(" "), 422);
  const j = await graphJson<{ id?: string; success?: boolean }>(`${cuenta(accountId)}/adsets`, "POST", { ...cuerpoDeConjunto(c), ...validacion(o.validar === true) } as never);
  if (o.validar) return { id: null, validado: true };
  if (!j.id) throw new ErrorDeMeta("Meta no devolvió el conjunto de anuncios.");
  return { id: j.id, validado: false };
}

const MAXIMO_DE_IMAGEN = 8 * 1024 * 1024;

/** Sube una imagen a la cuenta (descargándola de su URL) y devuelve su hash, que es lo que pide el creativo. */
export async function subirImagenAMeta(accountId: string, url: string): Promise<string> {
  if (!/^https:\/\//i.test(url)) throw new ErrorDeMeta("La imagen debe ser una dirección https://.", 422);
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!r || !r.ok) throw new ErrorDeMeta("No se pudo descargar la imagen para subirla a Meta.", 422);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAXIMO_DE_IMAGEN) throw new ErrorDeMeta("La imagen está vacía o pesa más de 8 MB.", 422);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const j = await graphJson<{ images?: Record<string, { hash?: string }> }>(`${cuenta(accountId)}/adimages`, "POST", { bytes: btoa(binario) });
  const hash = Object.values(j.images ?? {})[0]?.hash;
  if (!hash) throw new ErrorDeMeta("Meta no devolvió el identificador de la imagen.");
  return hash;
}

/** La miniatura de un video ya subido (Meta tarda unos segundos en generarla). */
export async function miniaturaDeVideo(videoId: string): Promise<string | null> {
  if (!/^\d+$/.test(videoId)) return null;
  for (let i = 0; i < 6; i += 1) {
    const j = await graphJson<{ picture?: string }>(videoId, "GET", { fields: "picture" }).catch(() => ({ picture: undefined }));
    if (j.picture) return j.picture;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return null;
}

/**
 * Crea (o valida) el anuncio con el formulario en su botón. `imagenUrl` se sube a la cuenta antes (salvo al validar, donde se usa un
 * hash de prueba para no dejar nada subido).
 */
export async function crearAnuncioConFormulario(
  accountId: string,
  a: Omit<CreativoDeFormulario, "imageHash" | "video"> & { conjuntoId: string; imagenUrl?: string; videoId?: string; estado?: "ACTIVE" | "PAUSED" },
  o: { validar?: boolean } = {},
): Promise<{ anuncioId: string | null; creativeId: string | null; validado: boolean }> {
  if (!/^\d+$/.test(a.conjuntoId)) throw new ErrorDeMeta("Falta el conjunto de anuncios.", 422);
  let imageHash: string | undefined;
  let video: CreativoDeFormulario["video"];
  if (a.videoId) {
    const miniatura = await miniaturaDeVideo(a.videoId);
    video = { id: a.videoId, miniaturaUrl: miniatura ?? "" };
  } else if (a.imagenUrl) {
    imageHash = o.validar ? "0".repeat(32) : await subirImagenAMeta(accountId, a.imagenUrl);
  }
  const creativo: CreativoDeFormulario = { ...a, imageHash, video };
  const problemas = problemasDelCreativo(creativo);
  if (problemas.length > 0) throw new ErrorDeMeta(problemas.join(" "), 422);
  if (o.validar) {
    // Se valida el creativo entero. Un hash de prueba no es una imagen real, así que solo se comprueba lo que Meta valide sin ella.
    await graphJson(`${cuenta(accountId)}/adcreatives`, "POST", { ...cuerpoDeCreativo(creativo), ...validacion(true) } as never);
    return { anuncioId: null, creativeId: null, validado: true };
  }
  const c = await graphJson<{ id?: string }>(`${cuenta(accountId)}/adcreatives`, "POST", cuerpoDeCreativo(creativo) as never);
  if (!c.id) throw new ErrorDeMeta("Meta no devolvió el creativo.");
  const ad = await graphJson<{ id?: string }>(`${cuenta(accountId)}/ads`, "POST", {
    name: a.nombre.slice(0, 100),
    adset_id: a.conjuntoId,
    creative: { creative_id: c.id },
    status: a.estado ?? "ACTIVE",
  });
  if (!ad.id) throw new ErrorDeMeta("Meta no devolvió el anuncio.");
  return { anuncioId: ad.id, creativeId: c.id, validado: false };
}
