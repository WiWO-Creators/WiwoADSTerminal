/**
 * Anuncios de LinkedIn (la parte pura): la publicación patrocinada y el creativo que la enlaza a una campaña.
 *
 * En LinkedIn un anuncio NO lleva el contenido dentro: un creativo apunta a una publicación (`urn:li:share` o
 * `urn:li:ugcPost`). Aquí se arma la publicación «oculta» (Direct Sponsored Content: `feedDistribution: NONE`, no sale en el
 * feed de la página) y el creativo que la usa. Las formas salen de la documentación de LinkedIn («Posts API» y «Create and
 * Manage Creatives», versión 202609) y NO están verificadas contra una respuesta real todavía.
 *
 * Crear la publicación exige `w_organization_social` Y un rol sobre la página que la firma (administrador, publicador de
 * contenido patrocinado o administrador de contenido). Sin ese rol LinkedIn responde 403.
 */
import { ErrorDeLinkedin, soloIds, urnCuenta, urnCampana } from "@/lib/linkedin-nativo-pura";

export type PlanDeAnuncio = {
  tipo: "crear";
  nivel: "post" | "creativo";
  metodo: "POST";
  ruta: string;
  cabeceras: Record<string, string>;
  cuerpo: object;
  /** Lo que se comprobará leyendo lo creado de vuelta: clave → valor esperado. */
  esperado: Record<string, string | number>;
  resumen: string;
};

const ORGANIZACION = /^urn:li:organization:\d+$/;
const URN_DE_POST = /^urn:li:(share|ugcPost):\d+$/;
const MAX_TEXTO = 3000;

/**
 * Publicación patrocinada «oculta»: firmada por una página de empresa y ligada a la cuenta publicitaria que la usará (un DSC solo
 * sirve en la cuenta que lo creó). Solo texto: es lo mínimo para comprobar el permiso; imágenes, videos y artículos necesitan
 * subir el archivo antes.
 */
export function planDePostPatrocinado(datos: { cuentaId: string; organizacion: string; texto: string; nombre?: string }): PlanDeAnuncio {
  const [cuenta] = soloIds([datos.cuentaId], "cuenta");
  const organizacion = String(datos.organizacion ?? "").trim();
  if (!ORGANIZACION.test(organizacion)) throw new ErrorDeLinkedin("La página que firma la publicación debe ser urn:li:organization:ID.", 400);
  const texto = String(datos.texto ?? "").trim();
  if (texto.length < 1) throw new ErrorDeLinkedin("Falta el texto de la publicación.", 400);
  if (texto.length > MAX_TEXTO) throw new ErrorDeLinkedin(`El texto no puede pasar de ${MAX_TEXTO} caracteres.`, 400);
  const adContext: Record<string, string> = { dscAdAccount: urnCuenta(cuenta), dscStatus: "ACTIVE" };
  if (datos.nombre !== undefined && datos.nombre.trim()) adContext.dscName = datos.nombre.trim().slice(0, 255);
  return {
    tipo: "crear",
    nivel: "post",
    metodo: "POST",
    ruta: "/rest/posts",
    cabeceras: {},
    cuerpo: {
      author: organizacion,
      commentary: texto,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "NONE", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      adContext,
    },
    esperado: { commentary: texto, "distribution.feedDistribution": "NONE" },
    resumen: `Crear una publicación patrocinada oculta (solo texto) firmada por ${organizacion} para la cuenta ${cuenta}.`,
  };
}

/** Creativo en borrador: enlaza una publicación a una campaña. Nace en `DRAFT`, así que no se revisa ni se sirve. */
export function planDeCreativo(datos: { cuentaId: string; campanaId: string; postUrn: string; nombre?: string }): PlanDeAnuncio {
  const [cuenta] = soloIds([datos.cuentaId], "cuenta");
  const [campana] = soloIds([datos.campanaId], "campaña");
  const postUrn = String(datos.postUrn ?? "").trim();
  if (!URN_DE_POST.test(postUrn)) throw new ErrorDeLinkedin("La publicación debe ser urn:li:share:ID o urn:li:ugcPost:ID.", 400);
  const cuerpo: Record<string, unknown> = { campaign: urnCampana(campana), content: { reference: postUrn }, intendedStatus: "DRAFT" };
  if (datos.nombre !== undefined && datos.nombre.trim()) cuerpo.name = datos.nombre.trim().slice(0, 255);
  return {
    tipo: "crear",
    nivel: "creativo",
    metodo: "POST",
    ruta: `/rest/adAccounts/${cuenta}/creatives`,
    cabeceras: {},
    cuerpo,
    esperado: { intendedStatus: "DRAFT", "content.reference": postUrn },
    resumen: `Crear un anuncio en borrador en la campaña ${campana} con la publicación ${postUrn}.`,
  };
}

/** Dónde leer lo recién creado para comprobarlo. `id` es el que devolvió LinkedIn (un URN en publicaciones y creativos). */
export function rutaParaVerificarAnuncio(nivel: "post" | "creativo", cuentaId: string, id: string): string {
  if (nivel === "post") return `/rest/posts/${encodeURIComponent(id)}?viewContext=AUTHOR`;
  const [cuenta] = soloIds([cuentaId], "cuenta");
  return `/rest/adAccounts/${cuenta}/creatives/${encodeURIComponent(id)}`;
}
