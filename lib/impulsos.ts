import { paginaDeLaCuenta, paginaEInstagramDeLaCampana } from "@/lib/pagina-de-cuenta";
import { destinoDeLosAnunciosDelConjunto, type DestinoDeAnuncio } from "@/lib/meta-nativo";
import { piezasDelConjunto, validarRetiradas, type PiezaDeConjunto } from "@/lib/renovar-piezas";
/**
 * «Impulsa estos links en el conjunto o campaña X»: resuelve los links a publicaciones reales de la Página y de
 * Instagram del cliente, encuentra el destino por nombre y deja las solicitudes listas para que un supervisor las apruebe.
 * No publica nada por sí solo: todo queda en revisión y, al aprobarse, se crea pausado.
 *
 * Pensado para que la IA y las personas pidan poco: si dan solo la campaña, se elige su conjunto activo y se dice cuál.
 */
import type { CampaignDraft } from "@/lib/constructor";
import { fetchDetalleDeCuenta } from "@/lib/detalle-entidad-store";
import { buscarPorNombre, resolverLinks, type PostConLink } from "@/lib/links-meta-pura";
import { listarMediosInstagram, listarReglasMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { buscarReglaPorNombre, interpretarReglaMeta } from "@/lib/reglas-meta-pura";
import { enAlcance, type Actor } from "@/lib/permisos";
import { listPortfolios } from "@/lib/portafolios-store";
import { crearSolicitud, crearSolicitudDeInstagram, ErrorDeSolicitud, type ImpulsoDeInstagram, type Solicitud } from "@/lib/solicitudes";
import { fetchFacebookPosts, fetchInstagramMedia, type OrganicPost } from "@/lib/windsor";

const DIAS_ATRAS = 365;
const isoHaceDias = (dias: number): string => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
const activo = (estado: string | null): boolean => (estado ?? "").toUpperCase() === "ACTIVE";

export type ResultadoDeImpulsos = {
  /** Una solicitud para Facebook (por Windsor) y otra para Instagram (API directa de Meta), según lo que se pidió. */
  solicitudes: Solicitud[];
  /** Links que no se pudieron usar, con el motivo. */
  descartados: Array<{ link: string; motivo: string }>;
  /** Si el destino no quedó claro: entre qué hay que elegir. */
  conjuntosPosibles: string[];
  /** Qué se asumió (por ejemplo, el conjunto elegido dentro de una campaña). */
  supuestos: string[];
  mensaje: string;
  /** Solo con `soloVista`: lo que se publicaría, para revisarlo y corregirlo ANTES de enviar nada. */
  vista?: {
    destino: { cuenta: string; campana: string; conjunto: string };
    publicaciones: Array<{ red: string; formato: string; texto: string; enlace: string; fecha: string | null; nombreDelAnuncio: string }>;
    pagina: string;
    instagram: string | null;
    /** Botón y destino que llevará el anuncio (el de los demás del conjunto, o el pedido). */
    botonYDestino: string;
    /** Anuncios activos del conjunto (los más viejos primero): candidatos a retirar para no saturarlo. */
    piezasDelConjunto: PiezaDeConjunto[];
    /** Los que se retirarán (pausarán) al publicarse, si la persona los eligió. */
    seRetiran: Array<{ id: string; nombre: string }>;
  };
};

export type ConjuntoDeDestino = {
  objetivo: string | null;
  id: string;
  nombre: string | null;
  estado: string | null;
  campaignId: string | null;
  accountId: string;
  campaignName: string;
};

export type DestinoResuelto = { elegido: ConjuntoDeDestino & { campaignId: string }; supuestos: string[] } | { error: string; conjuntosPosibles: string[] };

/**
 * Encuentra, por nombre, el conjunto de Meta de destino entre todas las cuentas del cliente. Con solo la campaña elige su
 * primer conjunto activo y lo dice en `supuestos`. Si no queda claro, devuelve el motivo y entre qué hay que elegir.
 */
export async function resolverDestinoMeta(
  cliente: { name: string; accountIds: string[]; accountProviders: Record<string, string | null | undefined> },
  entrada: { conjunto?: string; campana?: string },
): Promise<DestinoResuelto> {
  const cuentasSinLeer: string[] = [];
  const falla = (error: string, conjuntosPosibles: string[] = []): DestinoResuelto => ({
    error: cuentasSinLeer.length > 0 ? `${error} (No pude leer las cuentas de Meta: ${cuentasSinLeer.join(", ")}.)` : error,
    conjuntosPosibles,
  });
  const cuentasMeta = cliente.accountIds.filter((id) => cliente.accountProviders[id] === "meta");
  if (cuentasMeta.length === 0) return falla("Este cliente no tiene cuentas de Meta conectadas.");
  const conjuntos: ConjuntoDeDestino[] = [];
  for (const cuenta of cuentasMeta) {
    // Una cuenta que no se pueda leer no tumba a las demás (SQM tiene varias): se salta y, si no aparece el destino, se dice cuál falló.
    const detalle = await fetchDetalleDeCuenta("meta", cuenta, {}).catch((error: unknown) => {
      console.error("WiWO.ADS impulsos: no se pudo leer la cuenta", cuenta, error instanceof Error ? error.message : "error");
      cuentasSinLeer.push(cuenta);
      return null;
    });
    if (!detalle) continue;
    for (const c of detalle.conjuntos) {
      conjuntos.push({
        objetivo: detalle.campanas.find((k) => k.id === c.campaignId)?.objetivo ?? null,
        id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        campaignId: c.campaignId,
        accountId: cuenta,
        campaignName: detalle.campanas.find((k) => k.id === c.campaignId)?.nombre ?? "",
      });
    }
  }
  const supuestos: string[] = [];
  let candidatos = conjuntos;
  if (entrada.campana?.trim()) {
    const porCampana = buscarPorNombre(
      conjuntos.map((c) => ({ ...c, nombre: c.campaignName })),
      entrada.campana,
    );
    const nombresDeCampana = [...new Set(porCampana.candidatos.map((c) => c.campaignName))];
    if (nombresDeCampana.length > 1) {
      return falla(`Hay ${nombresDeCampana.length} campañas que calzan con «${entrada.campana}»: dime cuál.`, nombresDeCampana.slice(0, 10));
    }
    candidatos = conjuntos.filter((c) => nombresDeCampana.includes(c.campaignName));
  }
  let elegido: ConjuntoDeDestino | null = null;
  const porId = entrada.conjunto && /^\d{6,}$/.test(entrada.conjunto.trim()) ? conjuntos.find((c) => c.id === entrada.conjunto!.trim()) : undefined;
  if (porId) {
    elegido = porId;
  } else if (entrada.conjunto?.trim()) {
    const { unico, candidatos: varios } = buscarPorNombre(candidatos, entrada.conjunto);
    if (!unico) {
      return falla(
        varios.length > 1
          ? `Hay ${varios.length} conjuntos que calzan con «${entrada.conjunto}»: dime cuál.`
          : `No encontré ningún conjunto de Meta de ${cliente.name} que se llame algo como «${entrada.conjunto}».`,
        varios.slice(0, 10).map((c) => `${c.nombre} (${c.campaignName})`),
      );
    }
    elegido = unico;
  } else {
    // Solo dieron la campaña: se usa su primer conjunto activo (o el primero que haya) y se dice cuál.
    const activos = candidatos.filter((c) => activo(c.estado));
    elegido = (activos.length > 0 ? activos : candidatos)[0] ?? null;
    if (!elegido) return falla(`No encontré conjuntos en la campaña «${entrada.campana}».`);
    supuestos.push(`No indicaste el conjunto: usé «${elegido.nombre}» de «${elegido.campaignName}»${candidatos.length > 1 ? ` (la campaña tiene ${candidatos.length} conjuntos)` : ""}.`);
  }
  if (!elegido.campaignId) return falla("Ese conjunto no tiene una campaña asociada en la lectura; no se puede añadir ahí.");
  return { elegido: { ...elegido, campaignId: elegido.campaignId }, supuestos };
}

export async function solicitarImpulsos(
  actor: Actor,
  entrada: { clienteId: string; links: string[]; conjunto?: string; campana?: string; regla?: string; soloVista?: boolean; destino?: DestinoDeAnuncio; retirar?: string[] },
): Promise<ResultadoDeImpulsos> {
  const vacio = (mensaje: string, extra: Partial<ResultadoDeImpulsos> = {}): ResultadoDeImpulsos => ({
    solicitudes: [],
    descartados: [],
    conjuntosPosibles: [],
    supuestos: [],
    mensaje,
    ...extra,
  });
  if (!enAlcance(actor, entrada.clienteId)) throw new ErrorDeSolicitud("Ese cliente no está en tu alcance.", 403);
  const cliente = (await listPortfolios()).find((p) => p.id === entrada.clienteId);
  if (!cliente) throw new ErrorDeSolicitud("Cliente no encontrado.", 404);
  const links = entrada.links.map((l) => l.trim()).filter(Boolean).slice(0, 20);
  if (links.length === 0) return vacio("No me pasaron ningún link.");
  if (!entrada.conjunto?.trim() && !entrada.campana?.trim()) return vacio("Falta indicar la campaña o el conjunto de destino.");

  // 1) Destino entre todas las cuentas de Meta del cliente.
  const destino = await resolverDestinoMeta(cliente, entrada);
  if ("error" in destino) return vacio(destino.error, { conjuntosPosibles: destino.conjuntosPosibles });
  const { elegido, supuestos } = destino;

  // 1b) Regla de Meta cuya condición se copia a una regla propia sobre el anuncio nuevo (la de Meta no se toca).
  let reglaPropia: ImpulsoDeInstagram["regla"];
  if (entrada.regla?.trim()) {
    const { moneda, reglas } = await listarReglasMeta(elegido.accountId);
    const interpretadas = reglas.map((r) => interpretarReglaMeta(r, moneda));
    const { unica, candidatas } = buscarReglaPorNombre(interpretadas, entrada.regla);
    if (!unica) {
      return vacio(
        candidatas.length > 1 ? `Hay ${candidatas.length} reglas que calzan con «${entrada.regla}»: dime cuál.` : `No encontré una regla de Meta llamada algo como «${entrada.regla}» en esa cuenta.`,
        { conjuntosPosibles: (candidatas.length > 0 ? candidatas : interpretadas).slice(0, 10).map((r) => r.nombre) },
      );
    }
    if (!unica.definicion || unica.motivo) return vacio(`No puedo copiar la regla «${unica.nombre}»: ${unica.motivo ?? "su condición no es traducible"}`);
    const d = unica.definicion;
    reglaPropia = { nombre: unica.nombre, reglaMetaId: unica.id, metrica: d.metrica, operador: d.operador, umbral: d.umbral, periodo: d.periodo, accion: d.accion, moneda: moneda };
    supuestos.push(`La regla «${unica.nombre}» de Meta no se modifica. Al aprobarse creo en Meta una copia de esa regla que vigila solo el anuncio nuevo (Meta la evalúa sola; si no se puede, queda una regla propia de WiWO.ADS con la misma condición): ${unica.descripcion}`);
  }

  // 2) Links → publicaciones reales de la Página y de Instagram del cliente.
  // Con varias páginas posibles en la cuenta (SQM: México, Global…) se toma la que ya usan los anuncios de esa campaña.
  const deLaCampana = elegido.campaignId ? await paginaEInstagramDeLaCampana(elegido.campaignId) : null;
  const pageId = (await paginaDeLaCuenta(cliente, elegido.accountId)) ?? deLaCampana?.pageId ?? null;
  const instagramId = deLaCampana?.instagramId ?? cliente.instagramId;
  if (!pageId) {
    return vacio("La cuenta de Meta puede promocionar varias Páginas (o ninguna) y la campaña no tiene anuncios que digan cuál usar: declara la Página de esa cuenta en Clientes → ficha del cliente y vuelve a intentarlo.");
  }
  const desde = isoHaceDias(DIAS_ATRAS);
  const hasta = isoHaceDias(0);
  // Solo se lee lo que los links piden. Instagram: directo de Meta (rápido); si no, Windsor.
  const piden = (re: RegExp) => links.some((l) => re.test(l));
  const [facebook, instagram] = await Promise.all([
    piden(/facebook.com|fb.watch|fb.com/i) ? fetchFacebookPosts(pageId, desde, hasta) : Promise.resolve<OrganicPost[]>([]),
    instagramId && piden(/instagram.com/i)
      ? (metaNativoConfigurado() ? listarMediosInstagram(instagramId).catch(() => fetchInstagramMedia(instagramId, desde, hasta)) : fetchInstagramMedia(instagramId, desde, hasta))
      : Promise.resolve<OrganicPost[]>([]),
  ]);
  const { encontrados, noEncontrados } = resolverLinks<OrganicPost & PostConLink>(links, [...facebook, ...instagram]);
  const descartados = [...noEncontrados];
  const deFacebook = encontrados.filter((e) => e.post.platform === "facebook");
  const deInstagram = encontrados.filter((e) => e.post.platform === "instagram");
  if (deFacebook.length + deInstagram.length === 0) return vacio("Ninguno de los links se pudo usar.", { descartados });

  // Botón y destino: el pedido por la persona o, si no, el que ya usan los demás anuncios del conjunto (así el nuevo no sale sin destino).
  const botonDestino: DestinoDeAnuncio | null = entrada.destino ?? (await destinoDeLosAnunciosDelConjunto(elegido.id).catch(() => null));
  const textoDeDestino = botonDestino ? (botonDestino.tipo === "whatsapp" ? "botón de WhatsApp" : `«${botonDestino.cta ?? "Más información"}» → ${botonDestino.url}`) : "sin botón (si el conjunto es de visitas al perfil, lleva «Visitar perfil»)";
  if (botonDestino && deInstagram.length > 0) supuestos.push(`El anuncio lleva el mismo destino que los demás del conjunto: ${textoDeDestino}.`);
  // Renovar piezas: los anuncios viejos que la persona eligió retirar (solo los activos de ESTE conjunto).
  let retirar: Array<{ id: string; nombre: string }> = [];
  if (entrada.retirar && entrada.retirar.length > 0) {
    const v = await validarRetiradas(elegido.id, entrada.retirar).catch(() => ({ validas: [], descartadas: entrada.retirar ?? [] }));
    retirar = v.validas;
    if (v.descartadas.length > 0) supuestos.push(`No retiro ${v.descartadas.length} anuncio(s) que no están activos en este conjunto: ${v.descartadas.join(", ")}.`);
    if (retirar.length > 0) supuestos.push(`Al publicarse, pauso estos anuncios viejos del conjunto: ${retirar.map((x) => `«${x.nombre}»`).join(", ")} (se pueden reactivar).`);
  }
  const solicitudes: Solicitud[] = [];
  const etiqueta = (e: { post: OrganicPost }) => (e.post.caption ?? "publicación").replace(/\s+/g, " ").slice(0, 40);

  // Con `soloVista` no se crea nada: se muestra lo que se publicaría para que la persona lo revise y lo corrija.
  if (entrada.soloVista) {
    const todas = [...deFacebook, ...deInstagram];
    return {
      solicitudes: [],
      descartados,
      conjuntosPosibles: [],
      supuestos,
      mensaje: `${todas.length} publicación${todas.length === 1 ? "" : "es"} lista${todas.length === 1 ? "" : "s"} para impulsar en «${elegido.nombre}»: revisa y confirma.`,
      vista: {
        destino: { cuenta: elegido.accountId, campana: elegido.campaignName, conjunto: elegido.nombre ?? "" },
        publicaciones: todas.map((e) => ({
          red: e.post.platform === "instagram" ? "Instagram" : "Facebook",
          formato: e.post.format,
          texto: (e.post.caption ?? "").replace(/\s+/g, " ").slice(0, 160),
          enlace: e.link,
          fecha: e.post.createdAt,
          nombreDelAnuncio: (e.post.platform === "instagram" ? `Impulso Instagram · ${etiqueta(e)}` : `Impulso Facebook · ${etiqueta(e)}`).slice(0, 80),
        })),
        pagina: pageId,
        instagram: instagramId ?? null,
        botonYDestino: textoDeDestino,
        piezasDelConjunto: await piezasDelConjunto(elegido.id).catch(() => [] as PiezaDeConjunto[]),
        seRetiran: retirar,
      },
    };
  }

  // 3a) Facebook en campañas de Interacción: boost_post (Windsor). En cualquier otra, anuncio pausado con la API directa.
  const esInteraccion = (elegido.objetivo ?? "").toUpperCase() === "OUTCOME_ENGAGEMENT";
  if (deFacebook.length > 0 && (!esInteraccion || reglaPropia)) {
    supuestos.push(esInteraccion ? `Las publicaciones de Facebook se crean como anuncio nuevo (pausado) en «${elegido.nombre}» para poder asignarles la regla.` : `La campaña no es de Interacción: las publicaciones de Facebook se crean como anuncio nuevo (pausado) en «${elegido.nombre}».`);
    const impulsos: ImpulsoDeInstagram[] = deFacebook.map((e) => ({
      __instagram: true,
      facebook: true,
      portfolioId: entrada.clienteId,
      accountId: elegido.accountId,
      campaignId: elegido.campaignId!,
      campaignName: elegido.campaignName,
      adsetId: elegido.id,
      adsetName: elegido.nombre ?? "",
      mediaId: e.post.id,
      nombre: `Impulso Facebook · ${etiqueta(e)}`.slice(0, 80),
      regla: reglaPropia,
      paginaId: pageId,
      instagramId: instagramId ?? undefined,
      enlace: e.link,
      texto: (e.post.caption ?? "").replace(/\s+/g, " ").slice(0, 300),
      formato: e.post.format,
    }));
    try {
      solicitudes.push(await crearSolicitudDeInstagram(actor, impulsos));
    } catch (error) {
      if (!(error instanceof ErrorDeSolicitud)) throw error;
      for (const e of deFacebook) descartados.push({ link: e.link, motivo: error.message });
    }
  } else if (deFacebook.length > 0) {
    const drafts: Array<Partial<CampaignDraft>> = deFacebook.map((e, i) => ({
      portfolioId: entrada.clienteId,
      platforms: ["meta"],
      name: `Impulso ${i + 1} · ${etiqueta(e)}`,
      existingCampaign: { platform: "meta", accountId: elegido.accountId, campaignId: elegido.campaignId!, campaignName: elegido.campaignName },
      existingAdset: { adsetId: elegido.id, adsetName: elegido.nombre ?? "" },
      boostPostId: e.post.id,
    }));
    try {
      solicitudes.push(await crearSolicitud(actor, drafts));
    } catch (error) {
      if (!(error instanceof ErrorDeSolicitud)) throw error;
      for (const e of deFacebook) descartados.push({ link: e.link, motivo: error.message });
    }
  }

  // 3b) Instagram: anuncio pausado con la API directa de Meta, al aprobarse.
  if (deInstagram.length > 0) {
    const impulsos: ImpulsoDeInstagram[] = deInstagram.map((e) => ({
      __instagram: true,
      portfolioId: entrada.clienteId,
      accountId: elegido.accountId,
      campaignId: elegido.campaignId!,
      campaignName: elegido.campaignName,
      adsetId: elegido.id,
      adsetName: elegido.nombre ?? "",
      mediaId: e.post.id,
      nombre: `Impulso Instagram · ${etiqueta(e)}`.slice(0, 80),
      regla: reglaPropia,
      paginaId: pageId,
      instagramId: instagramId ?? undefined,
      enlace: e.link,
      texto: (e.post.caption ?? "").replace(/\s+/g, " ").slice(0, 300),
      formato: e.post.format,
      destino: botonDestino ?? undefined,
    }));
    if (retirar.length > 0) impulsos[0].retirar = retirar;
    try {
      solicitudes.push(await crearSolicitudDeInstagram(actor, impulsos));
    } catch (error) {
      if (!(error instanceof ErrorDeSolicitud)) throw error;
      for (const e of deInstagram) descartados.push({ link: e.link, motivo: error.message });
    }
  }

  if (solicitudes.length === 0) return vacio("No se pudo preparar ningún impulso.", { descartados, supuestos });
  const total = deFacebook.length + deInstagram.length - descartados.filter((d) => !noEncontrados.includes(d)).length;
  return {
    solicitudes,
    descartados,
    conjuntosPosibles: [],
    supuestos,
    mensaje: `${total} publicación${total === 1 ? "" : "es"} lista${total === 1 ? "" : "s"} para impulsar en «${elegido.nombre}», enviada${total === 1 ? "" : "s"} a revisión.`,
  };
}
