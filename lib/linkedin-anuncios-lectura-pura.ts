/**
 * Anuncios de LinkedIn (creatives) leídos directo de la API, sin Windsor: todos los de la cuenta (también pausados o sin actividad),
 * con el texto de su publicación y sus vistas previas reales. Puro (sin red): rutas, traducción y vistas previas. Verificado el
 * 2026-10-14 contra Colbún con la conexión del equipo (rw_ads + r_organization_social): los anuncios, las publicaciones (aun sin rol
 * en la página) y las vistas previas se leen bien.
 */
import type { DetalleAnuncio } from "@/lib/detalle-entidad";
import { idDeUrn, urnCampana, urnCuenta } from "@/lib/linkedin-nativo-pura";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const codificar = (urn: string): string => encodeURIComponent(urn);

/** Anuncios de la cuenta, de a 100. Con `siguiente` (el `nextPageToken` de la respuesta anterior) pide la página que sigue. */
export function rutaDeCreativos(cuentaId: string, siguiente?: string | null): string {
  return `/rest/adAccounts/${encodeURIComponent(cuentaId)}/creatives?q=criteria&pageSize=100${siguiente ? `&pageToken=${encodeURIComponent(siguiente)}` : ""}`;
}

/** Publicaciones en lote. Rest.li exige los URN codificados dentro de `List(...)`. */
export function rutaDePublicaciones(urns: string[]): string {
  return `/rest/posts?ids=List(${urns.map(codificar).join(",")})`;
}

export function rutaDeVistaPrevia(cuentaId: string, creativoUrn: string): string {
  return `/rest/adPreviews?q=creative&account=${codificar(urnCuenta(cuentaId))}&creative=${codificar(creativoUrn)}`;
}

export const urnDeCreativo = (id: string): string => `urn:li:sponsoredCreative:${id}`;

/** La publicación (o documento) que muestra el anuncio. Los anuncios de texto o de formulario sin publicación devuelven `null`. */
export function referenciaDeCreativo(creativo: Obj): string | null {
  const c = obj(creativo.content);
  return texto(c.reference) ?? texto(obj(c.documentAd).reference) ?? texto(obj(c.carousel).reference) ?? texto(obj(c.spotlight).reference) ?? null;
}

/** El texto de una publicación de LinkedIn trae los hashtags como `{hashtag|\#|Tema}`: se vuelven `#Tema`. */
export function textoDeComentario(comentario: unknown): string | null {
  const t = texto(comentario);
  if (!t) return null;
  return t.replace(/\{hashtag\|\\?#\|([^}]+)\}/g, "#$1").replace(/\\([\\()\[\]{}<>@#*_~|])/g, "$1");
}

function nombreDeAnuncio(creativo: Obj, comentario: string | null, id: string): string {
  const propio = texto(creativo.name);
  if (propio) return propio;
  const primera = comentario?.split("\n").map((l) => l.trim()).find(Boolean);
  if (primera) return primera.length > 70 ? `${primera.slice(0, 69)}…` : primera;
  return id;
}

/** Estado que entiende el editor: lo que se pidió (`intendedStatus`), salvo que LinkedIn lo haya rechazado o aún lo revise. */
export function estadoDeCreativo(creativo: Obj): string | null {
  const pedido = texto(creativo.intendedStatus);
  const revision = texto(obj(creativo.review).status);
  if (revision === "REJECTED") return "DISAPPROVED";
  if (revision === "PENDING" && pedido === "ACTIVE") return "PENDING_REVIEW";
  return pedido;
}

/** Un anuncio de LinkedIn leído de la API, con el texto de su publicación. */
export function detalleAnuncioNativoLinkedin(creativo: Obj, publicacion: Obj | null, cuentaId: string, grupoPorCampana: Map<string, string | null>): DetalleAnuncio | null {
  const id = idDeUrn(creativo.id);
  if (!id) return null;
  const campanaId = idDeUrn(creativo.campaign) || null;
  const comentario = textoDeComentario(publicacion?.commentary);
  const articulo = obj(obj(publicacion?.content).article);
  const destino = texto(articulo.source);
  return {
    provider: "linkedin",
    accountId: cuentaId,
    campaignId: campanaId ? (grupoPorCampana.get(campanaId) ?? null) : null,
    conjuntoId: campanaId,
    id,
    nombre: nombreDeAnuncio(creativo, comentario, id),
    estado: estadoDeCreativo(creativo),
    tipo: null,
    contenido: {
      textoPrincipal: comentario,
      titulo: texto(articulo.title),
      titulares: [],
      descripciones: [],
      urlDestino: destino,
      urlsFinales: destino ? [destino] : [],
      path1: null,
      path2: null,
      sufijoUrl: null,
      urlVisible: null,
      cta: null,
      imagenUrl: null,
      miniaturaUrl: null,
      imageHash: null,
      urlTags: null,
      creativeId: id,
      publicacionInstagram: null,
      vistaPreviaUrl: null,
    },
    edicionDeContenido: {
      editable: false,
      via: "ninguna",
      motivo:
        "Un anuncio de LinkedIn muestra una publicación de la página: su texto y su pieza no se cambian desde el anuncio. Aquí se puede pausar o activar; para cambiar el contenido hay que crear un anuncio nuevo con otra publicación.",
    },
    publicacion: { id: referenciaDeCreativo(creativo), existente: true },
  };
}

export type VistaPreviaDeLinkedin = { formato: "escritorio" | "movil"; url: string; ancho: number; alto: number };

/** Las vistas previas que LinkedIn arma de un anuncio (feed de escritorio y de celular): solo direcciones de LinkedIn. */
export function vistasPreviasDe(cuerpo: unknown): VistaPreviaDeLinkedin[] {
  const lista = Array.isArray(obj(cuerpo).elements) ? (obj(cuerpo).elements as unknown[]) : [];
  const salida: VistaPreviaDeLinkedin[] = [];
  for (const el of lista) {
    const e = obj(el);
    const html = texto(e.preview) ?? "";
    const src = /src=['"]([^'"]+)['"]/.exec(html)?.[1]?.replace(/&amp;/g, "&");
    if (!src || !/^https:\/\/www\.linkedin\.com\//i.test(src)) continue;
    const tipo = texto(obj(obj(e.placement).linkedin).contentPresentationType) ?? "";
    const ancho = Number(/width=['"]?(\d+)/.exec(html)?.[1] ?? 0) || 650;
    const alto = Number(/height=['"]?(\d+)/.exec(html)?.[1] ?? 0) || 580;
    salida.push({ formato: /MOBILE/i.test(tipo) ? "movil" : "escritorio", url: src, ancho, alto });
  }
  return salida;
}

/** `campaña (conjunto) → grupo`, para colgar cada anuncio de su campaña de la interfaz. */
export function grupoPorCampana(campanas: Obj[]): Map<string, string | null> {
  const mapa = new Map<string, string | null>();
  for (const c of campanas) {
    const id = texto(c.id) ?? (c.id !== undefined ? String(c.id) : null);
    if (!id) continue;
    const grupo = texto(c.campaignGroup);
    mapa.set(id, grupo ? idDeUrn(grupo) : null);
  }
  return mapa;
}

export const _paraPruebas = { urnCampana };
