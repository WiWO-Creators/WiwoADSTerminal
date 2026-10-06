/**
 * Solicitudes de publicación: guardado, aprobación y seguimiento. Las reglas puras (estados, mensajes) viven en
 * `solicitudes-pura.ts`.
 *
 * Quién puede qué:
 *  - Crear: cualquiera que pueda armar o sugerir campañas (analistas incluidos). Lo creado nace «pendiente».
 *  - Aprobar o rechazar: quien tiene `aprobar_cambios` (administrador y supervisor) y el cliente a su alcance.
 *  - Cancelar: quien la creó, mientras esté pendiente.
 * Aprobar publica de verdad, con el mismo plan y la misma regla de siempre: todo lo nuevo nace pausado.
 */
import { getRawDb } from "@/db";
import type { CampaignDraft } from "@/lib/constructor";
import { armarPlanDeBorrador, ejecutarPlanArmado, ErrorDeConstructor } from "@/lib/constructor-servicio";
import type { PasoEjecutado } from "@/lib/constructor-ejecutar";
import { fetchDetalleDeCuenta } from "@/lib/detalle-entidad-store";
import { copiarReglaMetaParaAnuncio, crearAnuncioDesdeInstagram } from "@/lib/meta-nativo";
import { crearRegla } from "@/lib/reglas-automaticas";
import { accountIndex, listPortfolios, normalizeAccountId } from "@/lib/portafolios-store";
import { enlaceDeCampana, type Enlace } from "@/lib/enlaces";
import { idDeResultado } from "@/lib/ids-de-resultado";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { can, enAlcance, puedeArmarCampanas, type Actor } from "@/lib/permisos";
import {
  ESTADOS_QUE_AVISAN,
  esEstadoDeSolicitud,
  mensajeParaElCreador,
  puedeTransicionar,
  tituloDeSolicitud,
  type EstadoDeSolicitud,
} from "@/lib/solicitudes-pura";

export class ErrorDeSolicitud extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Fila = {
  id: string; portfolio_id: string; portfolio_name: string; plataformas: string; titulo: string; destino: string;
  drafts_json: string; estado: string; creador_email: string; creador_nombre: string; revisor_email: string | null;
  revisor_nombre: string | null; nota_revision: string | null; error_texto: string | null; resultado_json: string | null;
  enlaces_json: string | null; avisada: number; created_at: number; resuelta_at: number | null; publicada_at: number | null;
  activa_at: number | null;
};

type AnuncioCreado = { provider: string; accountId: string; id: string };

export type Solicitud = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  plataformas: string[];
  titulo: string;
  destino: string;
  estado: EstadoDeSolicitud;
  creador: { email: string; nombre: string };
  revisor: { email: string; nombre: string } | null;
  notaDeRevision: string | null;
  error: string | null;
  enlaces: Enlace[];
  creada: number;
  resuelta: number | null;
  publicada: number | null;
  activa: number | null;
  /** Quien la creó todavía no vio su estado final. */
  sinLeer: boolean;
  /** Lo que lee quien la creó. */
  mensaje: string;
  /** Cuántos anuncios o piezas incluye. */
  piezas: number;
};

const supervisoresDe = async (): Promise<string[]> => {
  const { results } = await getRawDb()
    .prepare("SELECT display_name FROM users WHERE role IN ('supervisor', 'admin') AND is_active = 1 ORDER BY role DESC, display_name")
    .all<{ display_name: string }>();
  return (results ?? []).map((r) => r.display_name).filter(Boolean);
};

/** Quién puede revisar (para decírselo a quien envía). */
export async function nombresDeRevisores(): Promise<string[]> {
  return supervisoresDe().catch(() => []);
}

const puedeRevisar = (actor: Actor) => actor.isActive && can(actor, "aprobar_cambios");
const puedeCrear = (actor: Actor) => actor.isActive && puedeArmarCampanas(actor);

function aSolicitud(f: Fila, supervisores: string[]): Solicitud {
  const estado = esEstadoDeSolicitud(f.estado) ? f.estado : "pendiente";
  const drafts = JSON.parse(f.drafts_json) as unknown[];
  const base = {
    estado,
    creadorNombre: f.creador_nombre,
    revisorNombre: f.revisor_nombre,
    notaDeRevision: f.nota_revision,
    titulo: f.titulo,
    error: f.error_texto,
  };
  return {
    id: f.id,
    clienteId: f.portfolio_id,
    clienteNombre: f.portfolio_name,
    plataformas: f.plataformas.split(",").filter(Boolean),
    titulo: f.titulo,
    destino: f.destino,
    estado,
    creador: { email: f.creador_email, nombre: f.creador_nombre },
    revisor: f.revisor_email ? { email: f.revisor_email, nombre: f.revisor_nombre ?? f.revisor_email } : null,
    notaDeRevision: f.nota_revision,
    error: f.error_texto,
    enlaces: f.enlaces_json ? (JSON.parse(f.enlaces_json) as Enlace[]) : [],
    creada: f.created_at,
    resuelta: f.resuelta_at,
    publicada: f.publicada_at,
    activa: f.activa_at,
    sinLeer: f.avisada === 0 && ESTADOS_QUE_AVISAN.has(estado),
    mensaje: mensajeParaElCreador(base, supervisores),
    piezas: Array.isArray(drafts) ? drafts.length : 1,
  };
}

/** Un impulso de una publicación de Instagram dentro de un conjunto existente de Meta. */
export type ImpulsoDeInstagram = {
  __instagram: true;
  portfolioId: string;
  accountId: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  /** Instagram: id del medio. Facebook: id de la publicación (`pagina_publicacion`). */
  mediaId: string;
  nombre: string;
  /** La publicación es de Facebook (el anuncio se crea con la API directa, sin Windsor). */
  facebook?: boolean;
  /** Regla propia que se crea sobre el anuncio al publicarse (copia la condición de una regla de Meta, que no se toca). */
  regla?: { nombre: string; reglaMetaId?: string; metrica: string; operador: string; umbral: number; periodo: string; accion: string; moneda: string | null };
};

/** Crea una solicitud solo de publicaciones de Instagram (se crean pausadas al aprobarse). */
export async function crearSolicitudDeInstagram(actor: Actor, impulsos: ImpulsoDeInstagram[]): Promise<Solicitud> {
  if (!puedeCrear(actor)) throw new ErrorDeSolicitud("Tu rol no puede enviar creaciones a revisión.", 403);
  if (impulsos.length === 0 || impulsos.length > 20) throw new ErrorDeSolicitud("Una solicitud lleva entre 1 y 20 piezas.");
  const primero = impulsos[0];
  if (impulsos.some((i) => i.portfolioId !== primero.portfolioId)) throw new ErrorDeSolicitud("Todas las piezas deben ser del mismo cliente.");
  if (!enAlcance(actor, primero.portfolioId)) throw new ErrorDeSolicitud("Ese cliente no está en tu alcance.", 403);
  const cliente = (await listPortfolios()).find((p) => p.id === primero.portfolioId);
  if (!cliente) throw new ErrorDeSolicitud("Cliente no encontrado.", 404);
  if (!cliente.instagramId && impulsos.some((i) => !i.facebook)) throw new ErrorDeSolicitud("Este cliente no tiene su cuenta de Instagram declarada.", 409);
  const indice = await accountIndex();
  for (const i of impulsos) {
    const duenio = indice.get(normalizeAccountId(i.accountId));
    if (!duenio || duenio.id !== i.portfolioId) throw new ErrorDeSolicitud("Esa cuenta no pertenece a este cliente.", 403);
    if (!i.adsetId || !i.mediaId) throw new ErrorDeSolicitud("Falta el conjunto o la publicación.");
  }
  const id = crypto.randomUUID();
  const titulo = impulsos.length > 1 ? `${impulsos.length} publicaciones impulsadas` : "una publicación impulsada";
  await getRawDb()
    .prepare(
      `INSERT INTO solicitudes (id, portfolio_id, portfolio_name, plataformas, titulo, destino, drafts_json, estado,
         creador_email, creador_nombre, created_at)
       VALUES (?, ?, ?, 'meta', ?, ?, ?, 'pendiente', ?, ?, ?)`,
    )
    .bind(id, cliente.id, cliente.name, titulo, `${primero.adsetName} · ${primero.campaignName}`, JSON.stringify(impulsos), actor.email, nombreDe(actor), Date.now())
    .run();
  return (await obtener(actor, id))!;
}

/** Crea una solicitud con uno o varios borradores. Todos deben poder publicarse (sin problemas bloqueantes). */
export async function crearSolicitud(actor: Actor, borradores: Array<Partial<CampaignDraft>>): Promise<Solicitud> {
  if (!puedeCrear(actor)) throw new ErrorDeSolicitud("Tu rol no puede enviar creaciones a revisión.", 403);
  if (borradores.length === 0 || borradores.length > 20) throw new ErrorDeSolicitud("Una solicitud lleva entre 1 y 20 piezas.");

  const armados = [];
  for (const b of borradores) {
    try {
      armados.push(await armarPlanDeBorrador(actor, b));
    } catch (error) {
      if (error instanceof ErrorDeConstructor) throw new ErrorDeSolicitud(error.message, error.status);
      throw error;
    }
  }
  const clienteId = armados[0].draft.portfolioId;
  if (armados.some((a) => a.draft.portfolioId !== clienteId)) throw new ErrorDeSolicitud("Todas las piezas deben ser del mismo cliente.");
  for (const a of armados) {
    const bloqueante = a.plan.issues.find((i) => i.blocking);
    if (bloqueante) throw new ErrorDeSolicitud(`Todavía no se puede enviar: ${bloqueante.message}`, 422);
  }

  const primero = armados[0].draft;
  const titulo = tituloDeSolicitud(primero, armados.length);
  const destino = primero.existingAdset
    ? `${primero.existingAdset.adsetName} · ${primero.existingCampaign?.campaignName ?? ""}`.replace(/ · $/, "")
    : primero.existingCampaign
      ? primero.existingCampaign.campaignName
      : "";
  const plataformas = [...new Set(armados.flatMap((a) => a.draft.platforms))].join(",");
  const id = crypto.randomUUID();
  await getRawDb()
    .prepare(
      `INSERT INTO solicitudes (id, portfolio_id, portfolio_name, plataformas, titulo, destino, drafts_json, estado,
         creador_email, creador_nombre, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)`,
    )
    .bind(id, clienteId, armados[0].clienteNombre, plataformas, titulo, destino, JSON.stringify(armados.map((a) => a.draft)), actor.email, nombreDe(actor), Date.now())
    .run();
  return (await obtener(actor, id))!;
}

const nombreDe = (actor: Actor): string => {
  const antes = actor.email.split("@")[0] ?? actor.email;
  return antes.replace(/[._-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

async function filaDe(id: string): Promise<Fila | null> {
  return (await getRawDb().prepare("SELECT * FROM solicitudes WHERE id = ? LIMIT 1").bind(id).first<Fila>()) ?? null;
}

function puedeVer(actor: Actor, f: Fila): boolean {
  return f.creador_email === actor.email || (puedeRevisar(actor) && enAlcance(actor, f.portfolio_id));
}

export async function obtener(actor: Actor, id: string): Promise<Solicitud | null> {
  const f = await filaDe(id);
  if (!f || !puedeVer(actor, f)) return null;
  return aSolicitud(f, await nombresDeRevisores());
}

/** Las solicitudes que ve esta persona: las suyas y, si revisa, las pendientes de los clientes a su alcance. */
export async function listarSolicitudes(actor: Actor): Promise<{ porRevisar: Solicitud[]; mias: Solicitud[]; revisores: string[] }> {
  const revisores = await nombresDeRevisores();
  const { results } = await getRawDb()
    .prepare("SELECT * FROM solicitudes ORDER BY created_at DESC LIMIT 300")
    .all<Fila>();
  const filas = (results ?? []).filter((f) => puedeVer(actor, f));
  const todas = filas.map((f) => aSolicitud(f, revisores));
  return {
    porRevisar: puedeRevisar(actor) ? todas.filter((s) => s.estado === "pendiente") : [],
    mias: todas.filter((s) => s.creador.email === actor.email),
    revisores,
  };
}

/** Los números para el aviso del menú: pendientes por revisar y novedades que quien envió todavía no vio. */
export async function resumenDeSolicitudes(actor: Actor): Promise<{ porRevisar: number; novedades: number }> {
  const { porRevisar, mias } = await listarSolicitudes(actor);
  return { porRevisar: porRevisar.length, novedades: mias.filter((s) => s.sinLeer).length };
}

function idsDeAnunciosCreados(pasos: PasoEjecutado[], ids: Partial<Record<string, string>>): AnuncioCreado[] {
  const evitar = new Set(Object.values(ids).filter((v): v is string => Boolean(v)));
  const salida: AnuncioCreado[] = [];
  for (const p of pasos) {
    if (!p.ok) continue;
    let id: string | null = null;
    if (p.action === "boost_post" || p.action === "create_ad") id = idDeResultado(p.raw, ["ad_id", "adId", "id"], evitar);
    else if (p.action === "create_responsive_search_ad") {
      const m = /(\d+)~(\d+)/.exec(JSON.stringify(p.raw ?? ""));
      id = m ? m[2] : null;
    } else if (p.action === "ads:create_display_ad") {
      const anuncio = (p.raw as { anuncio?: string } | null)?.anuncio ?? "";
      id = anuncio.split("~")[1] ?? null;
    }
    if (id) salida.push({ provider: p.platform, accountId: "", id });
  }
  return salida;
}

/** Aprueba: publica cada pieza de verdad (pausada) y deja los enlaces para revisarlo en la plataforma. */
export async function aprobarSolicitud(actor: Actor, id: string): Promise<Solicitud> {
  if (!puedeRevisar(actor)) throw new ErrorDeSolicitud("Solo un supervisor o administrador puede aprobar.", 403);
  const f = await filaDe(id);
  if (!f || !enAlcance(actor, f.portfolio_id)) throw new ErrorDeSolicitud("No encontré esa solicitud.", 404);
  if (!puedeTransicionar("aprobar", f.estado as EstadoDeSolicitud)) throw new ErrorDeSolicitud("Esa solicitud ya no está pendiente.", 409);

  // Se toma antes de publicar: dos supervisores aprobando a la vez no deben publicar dos veces.
  const tomada = await getRawDb()
    .prepare("UPDATE solicitudes SET estado = 'publicada', revisor_email = ?, revisor_nombre = ?, resuelta_at = ? WHERE id = ? AND estado = 'pendiente'")
    .bind(actor.email, nombreDe(actor), Date.now(), id)
    .run();
  if ((tomada.meta?.changes ?? 1) === 0) throw new ErrorDeSolicitud("Otra persona ya la revisó.", 409);

  const drafts = JSON.parse(f.drafts_json) as Array<Partial<CampaignDraft>>;
  const pasosTotales: PasoEjecutado[] = [];
  const anuncios: AnuncioCreado[] = [];
  const enlaces: Enlace[] = [];
  let fallo: string | null = null;

  for (const d of drafts) {
    // Impulso de una publicación de Instagram: se crea con la API directa de Meta, siempre pausado.
    if ((d as { __instagram?: boolean }).__instagram) {
      const ig = d as unknown as ImpulsoDeInstagram;
      try {
        const cliente = (await listPortfolios()).find((p) => p.id === ig.portfolioId);
        if (!cliente?.instagramId && !ig.facebook) throw new Error("Este cliente no tiene su cuenta de Instagram declarada.");
        const r = await crearAnuncioDesdeInstagram(ig.accountId, {
          nombre: ig.nombre,
          conjuntoId: ig.adsetId,
          instagramUserId: cliente?.instagramId,
          mediaId: ig.mediaId,
          facebook: ig.facebook,
          paginaId: cliente?.accountPages[ig.accountId] ?? cliente?.pageId,
        });
        anuncios.push({ provider: "meta", accountId: ig.accountId, id: r.anuncioId });
        // Primero, la regla DENTRO de Meta (copia de la original, que no se toca): Meta la evalúa sola. Si no se puede, la propia.
        let reglaEnMeta = false;
        if (ig.regla?.reglaMetaId) {
          try {
            const reglaId = await copiarReglaMetaParaAnuncio(ig.accountId, ig.regla.reglaMetaId, r.anuncioId, `${ig.regla.nombre} · ${ig.nombre}`);
            pasosTotales.push({ platform: "meta", action: "rules:create_native_copy", label: `Regla ${ig.regla.nombre} (copia en Meta)`, ok: true, error: null, raw: { reglaId } } as PasoEjecutado);
            reglaEnMeta = true;
          } catch (error) {
            const motivo = error instanceof Error ? error.message : "No se pudo crear la regla en Meta.";
            pasosTotales.push({ platform: "meta", action: "rules:create_native_copy", label: `Regla ${ig.regla.nombre} (copia en Meta)`, ok: false, error: motivo, raw: null } as PasoEjecutado);
          }
        }
        if (ig.regla && !reglaEnMeta) {
          try {
            const regla = await crearRegla(actor, {
              clienteId: ig.portfolioId, plataforma: "meta", cuenta: ig.accountId, nivel: "anuncio", entidadId: r.anuncioId,
              entidad: `${ig.nombre} · regla ${ig.regla.nombre}`, campaignId: ig.campaignId, adsetId: ig.adsetId,
              metrica: ig.regla.metrica, operador: ig.regla.operador, umbral: ig.regla.umbral, periodo: ig.regla.periodo, accion: ig.regla.accion, moneda: ig.regla.moneda,
            });
            pasosTotales.push({ platform: "meta", action: "rules:create_own", label: regla.texto, ok: true, error: null, raw: { reglaId: regla.id } } as PasoEjecutado);
          } catch (error) {
            const motivo = error instanceof Error ? error.message : "No se pudo crear la regla.";
            pasosTotales.push({ platform: "meta", action: "rules:create_own", label: `Regla ${ig.regla.nombre}`, ok: false, error: motivo, raw: null } as PasoEjecutado);
          }
        }
        const url = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${ig.accountId}&selected_ad_ids=${r.anuncioId}`;
        if (!enlaces.some((e) => e.url === url)) enlaces.push({ etiqueta: "Revisar el anuncio en Meta", url });
        pasosTotales.push({ platform: "meta", action: "ads:create_from_instagram", label: ig.nombre, ok: true, error: null, raw: r } as PasoEjecutado);
      } catch (error) {
        fallo = error instanceof Error ? error.message : "No se pudo crear el anuncio de Instagram.";
        break;
      }
      continue;
    }
    try {
      const armado = await armarPlanDeBorrador(actor, d);
      const r = await ejecutarPlanArmado(actor, armado);
      pasosTotales.push(...r.pasos);
      const cuentaMeta = armado.draft.existingCampaign?.accountId ?? armado.cuentas.find((c) => c.provider === armado.draft.platforms[0])?.externalId ?? "";
      for (const a of idsDeAnunciosCreados(r.pasos, r.ids)) anuncios.push({ ...a, accountId: a.provider === armado.draft.existingCampaign?.platform ? armado.draft.existingCampaign.accountId : cuentaMeta });
      const campaignId = armado.draft.existingCampaign?.campaignId ?? r.ids.campaign ?? null;
      const enlace = enlaceDeCampana(armado.draft.platforms[0], cuentaMeta, campaignId);
      if (enlace && !enlaces.some((e) => e.url === enlace.url)) enlaces.push(enlace);
      if (!r.ok) {
        fallo = r.pasos.find((p) => !p.ok)?.error ?? "Un paso falló.";
        break;
      }
    } catch (error) {
      fallo = error instanceof Error ? error.message : "Un paso falló.";
      break;
    }
  }

  await getRawDb()
    .prepare("UPDATE solicitudes SET estado = ?, error_texto = ?, resultado_json = ?, enlaces_json = ?, publicada_at = ?, avisada = 0 WHERE id = ?")
    .bind(fallo ? "fallida" : "publicada", fallo, JSON.stringify({ pasos: pasosTotales.map((p) => ({ platform: p.platform, action: p.action, ok: p.ok, error: p.error })), anuncios }), JSON.stringify(enlaces), Date.now(), id)
    .run();
  return (await obtener(actor, id))!;
}

export async function rechazarSolicitud(actor: Actor, id: string, nota: string): Promise<Solicitud> {
  if (!puedeRevisar(actor)) throw new ErrorDeSolicitud("Solo un supervisor o administrador puede rechazar.", 403);
  const f = await filaDe(id);
  if (!f || !enAlcance(actor, f.portfolio_id)) throw new ErrorDeSolicitud("No encontré esa solicitud.", 404);
  if (!puedeTransicionar("rechazar", f.estado as EstadoDeSolicitud)) throw new ErrorDeSolicitud("Esa solicitud ya no está pendiente.", 409);
  await getRawDb()
    .prepare("UPDATE solicitudes SET estado = 'rechazada', revisor_email = ?, revisor_nombre = ?, nota_revision = ?, resuelta_at = ?, avisada = 0 WHERE id = ? AND estado = 'pendiente'")
    .bind(actor.email, nombreDe(actor), nota.trim().slice(0, 500) || null, Date.now(), id)
    .run();
  return (await obtener(actor, id))!;
}

export async function cancelarSolicitud(actor: Actor, id: string): Promise<Solicitud> {
  const f = await filaDe(id);
  if (!f || f.creador_email !== actor.email) throw new ErrorDeSolicitud("No encontré esa solicitud.", 404);
  if (!puedeTransicionar("cancelar", f.estado as EstadoDeSolicitud)) throw new ErrorDeSolicitud("Ya no se puede retirar: alguien la revisó.", 409);
  await getRawDb().prepare("UPDATE solicitudes SET estado = 'cancelada', resuelta_at = ?, avisada = 1 WHERE id = ? AND estado = 'pendiente'").bind(Date.now(), id).run();
  return (await obtener(actor, id))!;
}

/** Marca como vistas las novedades de quien creó las solicitudes. */
export async function marcarComoLeidas(actor: Actor): Promise<void> {
  await getRawDb().prepare("UPDATE solicitudes SET avisada = 1 WHERE creador_email = ? AND avisada = 0").bind(actor.email).run();
}

/** Marca a mano como activa (cuando no se pudo comprobar sola). Solo quien revisa. */
export async function marcarActiva(actor: Actor, id: string): Promise<Solicitud> {
  if (!puedeRevisar(actor)) throw new ErrorDeSolicitud("Solo un supervisor o administrador puede marcarla.", 403);
  const f = await filaDe(id);
  if (!f || !enAlcance(actor, f.portfolio_id)) throw new ErrorDeSolicitud("No encontré esa solicitud.", 404);
  if (!puedeTransicionar("marcar_activa", f.estado as EstadoDeSolicitud)) throw new ErrorDeSolicitud("Esa solicitud no está esperando activarse.", 409);
  await getRawDb().prepare("UPDATE solicitudes SET estado = 'activa', activa_at = ?, avisada = 0 WHERE id = ?").bind(Date.now(), id).run();
  return (await obtener(actor, id))!;
}

/**
 * Revisa en la plataforma las solicitudes publicadas: cuando el anuncio ya está activo, pasan a «activa» y recién
 * ahí se le avisa a quien las envió. Mejor esfuerzo: si no se puede leer, sigue «publicada».
 */
export async function revisarActivaciones(actor: Actor): Promise<number> {
  const { results } = await getRawDb().prepare("SELECT * FROM solicitudes WHERE estado = 'publicada' LIMIT 50").all<Fila>();
  let activadas = 0;
  for (const f of (results ?? []).filter((x) => puedeVer(actor, x))) {
    const anuncios = ((f.resultado_json ? JSON.parse(f.resultado_json) : {}) as { anuncios?: AnuncioCreado[] }).anuncios ?? [];
    if (anuncios.length === 0) continue;
    let todosActivos = true;
    for (const a of anuncios) {
      try {
        const credenciales = a.provider === "google" ? await accesoNativoGoogle(actor, a.accountId) : null;
        const detalle = await fetchDetalleDeCuenta(a.provider as "meta" | "google", a.accountId, { credencialesGoogle: credenciales });
        const ad = detalle.anuncios.find((x) => x.id === a.id);
        const estado = (ad?.estado ?? "").toUpperCase();
        if (!(estado === "ACTIVE" || estado === "ENABLED")) todosActivos = false;
      } catch {
        todosActivos = false;
      }
    }
    if (todosActivos) {
      await getRawDb().prepare("UPDATE solicitudes SET estado = 'activa', activa_at = ?, avisada = 0 WHERE id = ? AND estado = 'publicada'").bind(Date.now(), f.id).run();
      activadas += 1;
    }
  }
  return activadas;
}
