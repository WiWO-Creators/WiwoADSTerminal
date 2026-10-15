import { getSession } from "@/app/sesion";
import { CODIGOS_ERROR, fail } from "@/lib/api-respuestas";
import { registrarEscritura } from "@/lib/escrituras";
import { registrarEventoDeIntegracion } from "@/lib/integration-store";
import { planDeCreativo, rutaParaVerificarAnuncio } from "@/lib/linkedin-anuncios-pura";
import { referenciaDeCreativo, textoDeComentario } from "@/lib/linkedin-anuncios-lectura-pura";
import { accesoNativoLinkedin, lecturaNativaLinkedin } from "@/lib/linkedin-conexion";
import { diferenciasConLoEsperado, rutaDeEntidad } from "@/lib/linkedin-escritura-pura";
import { creativosDeLinkedin, enviarPlanALinkedin, leerDeLinkedin, publicacionesDeLinkedin } from "@/lib/linkedin-nativo";
import { ErrorDeLinkedin, idDeUrn } from "@/lib/linkedin-nativo-pura";
import { candidatasDePublicacion, compatibleConCampana, formatoDePublicacion, urnDePublicacionPegada } from "@/lib/linkedin-publicaciones-pura";
import { mismoOrigen } from "@/lib/origen-publico";
import { can, enAlcance } from "@/lib/permisos";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

/**
 * Añadir un anuncio de LinkedIn con una publicación que YA existe (la de otro anuncio de la cuenta o una que se pega por su enlace).
 * No crea publicaciones: eso exige un rol en la página de empresa. Verificado el 2026-10-14 contra Colbún: con la conexión del
 * equipo (rw_ads) LinkedIn deja crear el anuncio sin ese rol.
 *
 *  - GET: las publicaciones que ya usan los anuncios de la cuenta, con su tipo y si calzan con el formato de la campaña.
 *  - POST: crea el anuncio (activo si la campaña está activa y se pide, en borrador si no), lo lee de vuelta y lo registra.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

type CampanaDeLinkedin = { format?: string; status?: string; account?: string };

async function cuentaEnAlcance(actor: Parameters<typeof can>[0], accountId: string): Promise<boolean> {
  const duenio = (await accountIndex()).get(normalizeAccountId(accountId));
  return Boolean(duenio && enAlcance(actor, duenio.id));
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const p = new URL(request.url).searchParams;
  const accountId = (p.get("accountId") ?? "").trim();
  const campaignId = (p.get("campaignId") ?? "").trim();
  if (!/^\d+$/.test(accountId) || !/^\d+$/.test(campaignId)) return fail("Faltan la cuenta o la campaña", 400);
  if (!(await cuentaEnAlcance(session.actor, accountId))) return fail("Esa cuenta no está en tu alcance", 403);
  try {
    const acceso = await lecturaNativaLinkedin(session.actor, accountId);
    if (!acceso) return Response.json({ conectado: false, candidatas: [], formatoDeLaCampana: null }, { headers: NO_STORE });
    const [campana, creativos] = await Promise.all([
      leerDeLinkedin(rutaDeEntidad("campana", accountId, campaignId), acceso.token) as Promise<CampanaDeLinkedin>,
      creativosDeLinkedin(accountId, acceso.token),
    ]);
    const referencias = creativos.map((c) => referenciaDeCreativo(c)).filter((u): u is string => Boolean(u));
    const publicaciones = await publicacionesDeLinkedin(referencias, acceso.token);
    const formato = campana.format ?? null;
    return Response.json(
      { conectado: true, formatoDeLaCampana: formato, estadoDeLaCampana: campana.status ?? null, candidatas: candidatasDePublicacion(referencias, publicaciones, formato, textoDeComentario) },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof ErrorDeLinkedin) return fail(error.message, error.status >= 400 && error.status < 600 ? error.status : 502);
    console.error("WiWO.ADS LinkedIn candidatas", error);
    return fail("No se pudieron leer las publicaciones de LinkedIn", 500);
  }
}

export async function POST(request: Request) {
  if (!mismoOrigen(request)) return fail("Origen no permitido", 403, CODIGOS_ERROR.ORIGEN_NO_PERMITIDO);
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403, CODIGOS_ERROR.SIN_SESION);
  const actor = session.actor;
  if (!can(actor, "aprobar_cambios")) return fail("Crear anuncios lo aprueba un Digital Lead o superior.", 403, CODIGOS_ERROR.PERMISO_INSUFICIENTE);

  const d = (await request.json().catch(() => ({}))) as { accountId?: string; campaignId?: string; publicacion?: string; nombre?: string; activar?: boolean; confirmacion?: string };
  const accountId = String(d.accountId ?? "").trim();
  const campaignId = String(d.campaignId ?? "").trim();
  if (!/^\d+$/.test(accountId) || !/^\d+$/.test(campaignId)) return fail("Faltan la cuenta o la campaña", 400);
  if (d.confirmacion !== "CREAR") return fail("Falta la confirmación explícita", 400);
  if (!(await cuentaEnAlcance(actor, accountId))) return fail("Esa cuenta no está en tu alcance", 403);
  const urn = urnDePublicacionPegada(d.publicacion);
  if (!urn) return fail("No reconozco esa publicación: pega su enlace de LinkedIn (el que dice «feed/update/urn:li:…») o su URN.", 400);

  try {
    const acceso = await accesoNativoLinkedin(actor, accountId);
    if (!acceso) return fail("Escribir en esta cuenta de LinkedIn no está habilitado (conexión del equipo o LINKEDIN_ESCRITURA_CLIENTES).", 403);

    const [campana, publicaciones] = await Promise.all([
      leerDeLinkedin(rutaDeEntidad("campana", accountId, campaignId), acceso.token) as Promise<CampanaDeLinkedin>,
      publicacionesDeLinkedin([urn], acceso.token),
    ]);
    if (idDeUrn(campana.account) !== accountId) return fail("Esa campaña no es de esa cuenta.", 400);
    const post = publicaciones.get(urn);
    if (!post) return fail("LinkedIn no deja leer esa publicación: revisa el enlace o que sea una publicación de página pública.", 422);
    const formato = formatoDePublicacion(post);
    const veredicto = compatibleConCampana(formato, campana.format ?? null);
    if (!veredicto.ok) return fail(veredicto.motivo, 422);

    // «Nace corriendo» solo si la campaña ya corre; en una campaña en borrador o pausada el anuncio queda en borrador.
    const estado = d.activar !== false && campana.status === "ACTIVE" ? "ACTIVE" : "DRAFT";
    const plan = planDeCreativo({ cuentaId: accountId, campanaId: campaignId, postUrn: urn, nombre: d.nombre, estado, contenido: formato.contenido });
    const enviado = await enviarPlanALinkedin(plan, acceso.token);
    registrarEscritura();
    if (!enviado.id) {
      await registrarEventoDeIntegracion(actor, "linkedin_write", `LinkedIn: ${plan.resumen}`, "Aceptado sin id devuelto: verificar en Campaign Manager");
      return fail("LinkedIn aceptó el anuncio pero no devolvió su id: revísalo en Campaign Manager antes de reintentar.", 502);
    }
    const actual = await leerDeLinkedin(rutaParaVerificarAnuncio("creativo", accountId, enviado.id), acceso.token);
    const diferencias = diferenciasConLoEsperado(plan.esperado, actual);
    await registrarEventoDeIntegracion(actor, "linkedin_write", `LinkedIn: ${plan.resumen}`, diferencias.length === 0 ? "Verificado en LinkedIn" : `NO verificado: ${diferencias.map((x) => x.campo).join(", ")}`);
    return Response.json(
      { aplicado: true, id: idDeUrn(enviado.id), estado, tipo: formato.etiqueta, verificado: diferencias.length === 0, diferencias },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof ErrorDeLinkedin) return fail(error.message, error.status >= 400 && error.status < 600 ? error.status : 502);
    console.error("WiWO.ADS LinkedIn anuncio desde publicación", error);
    return fail("No se pudo crear el anuncio en LinkedIn", 500);
  }
}
