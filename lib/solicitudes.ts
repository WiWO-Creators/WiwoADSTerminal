import { marcarContenidoRenovado } from "@/lib/contenido-renovado";
import { paginaDeLaCuenta, paginaEInstagramDeLaCampana } from "@/lib/pagina-de-cuenta";
import { retirarPiezasMeta } from "@/lib/renovar-piezas";
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
import { creativoDeCarrusel, creativoDeImagen, tituloDeContenido, validarContenido, type DatosDeContenido } from "@/lib/anuncios-formato-pura";
import { copiarReglaMetaParaAnuncio, crearAnuncioConCreativo, crearAnuncioDesdeInstagram } from "@/lib/meta-nativo";
import { crearRegla } from "@/lib/reglas-automaticas";
import { accountIndex, listPortfolios, normalizeAccountId } from "@/lib/portafolios-store";
import { enlaceDeCampana, type Enlace } from "@/lib/enlaces";
import { idDeResultado } from "@/lib/ids-de-resultado";
import { accesoNativoGoogle } from "@/lib/integration-store";
import { registrarAuditoria } from "@/lib/auditoria";
import { etiquetasDeCambios, resumenDeCambios, type ResultadoDeAuditoria } from "@/lib/auditoria-pura";
import { ejecutarPasosDeEdicion } from "@/lib/edicion-ejecutar";
import { hayAlgoQueAplicar, tocaPresupuesto, type CambioVisible, type CambiosEdicion } from "@/lib/edicion-plan";
import { prepararEdicion } from "@/lib/edicion-servicio";
import { registrarEjecucion } from "@/lib/constructor-ejecutar";
import type { NivelEntidad, Platform } from "@/lib/plataformas";
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
  /** Es un cambio sobre algo que ya existe: lo que cambia, antes y después. */
  cambios: CambioVisible[] | null;
  /** El cambio toca presupuesto: lo aprueba un Director Digital o superior. */
  tocaPresupuesto: boolean;
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

/** Quién puede aprobar un cambio de presupuesto: solo administradores (Directores Digitales y jefes). */
async function nombresDeAdministradores(): Promise<string[]> {
  const { results } = await getRawDb()
    .prepare("SELECT display_name FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY display_name")
    .all<{ display_name: string }>()
    .catch(() => ({ results: [] as Array<{ display_name: string }> }));
  return (results ?? []).map((r) => r.display_name).filter(Boolean);
}

/** Los datos de un cambio propuesto, si la solicitud es de ese tipo. */
function edicionDe(f: Fila): EdicionPropuesta | null {
  try {
    const d = (JSON.parse(f.drafts_json) as Array<Partial<EdicionPropuesta>>)[0];
    return d && d.__edicion === true ? (d as EdicionPropuesta) : null;
  } catch {
    return null;
  }
}

const puedeRevisar = (actor: Actor) => actor.isActive && can(actor, "aprobar_cambios");
const puedeCrear = (actor: Actor) => actor.isActive && puedeArmarCampanas(actor);

function aSolicitud(f: Fila, supervisores: string[], administradores: string[] = []): Solicitud {
  const edicion = edicionDe(f);
  const estado = esEstadoDeSolicitud(f.estado) ? f.estado : "pendiente";
  const drafts = JSON.parse(f.drafts_json) as unknown[];
  const base = {
    estado,
    creadorNombre: f.creador_nombre,
    revisorNombre: f.revisor_nombre,
    notaDeRevision: f.nota_revision,
    titulo: f.titulo,
    error: f.error_texto,
    esEdicion: edicion !== null,
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
    mensaje: mensajeParaElCreador(base, edicion?.tocaPresupuesto ? administradores : supervisores),
    piezas: Array.isArray(drafts) ? drafts.length : 1,
    cambios: edicion?.diff ?? null,
    tocaPresupuesto: edicion?.tocaPresupuesto ?? false,
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
  /** Instagram y Página que usa esa campaña (en clientes con varios países la ficha trae solo uno): mandan sobre los de la ficha. */
  instagramId?: string;
  paginaId?: string;
  /** Para la auditoría: el link que pidieron, el texto y el formato de la publicación. */
  enlace?: string;
  texto?: string;
  formato?: string;
  /** Botón y destino del anuncio nuevo (WhatsApp o sitio web); sin esto el anuncio queda sin destino. */
  destino?: { tipo: "whatsapp" | "web"; url?: string; cta?: string };
  /** Renovar: anuncios viejos del mismo conjunto que se pausan al publicarse el nuevo, para no saturarlo. */
  retirar?: Array<{ id: string; nombre: string }>;
  /** Regla propia que se crea sobre el anuncio al publicarse (copia la condición de una regla de Meta, que no se toca). */
  regla?: { nombre: string; reglaMetaId?: string; metrica: string; operador: string; umbral: number; periodo: string; accion: string; moneda: string | null };
};

/** Un cambio propuesto sobre una campaña, conjunto o anuncio que ya existe. Nada se aplica hasta que alguien con permiso lo apruebe. */
export type EdicionPropuesta = {
  __edicion: true;
  portfolioId: string;
  provider: string;
  accountId: string;
  nivel: NivelEntidad;
  id: string;
  entidad: string;
  cambios: CambiosEdicion;
  /** Lo que cambiaría, antes y después, tal como se vio al proponerlo. */
  diff: CambioVisible[];
  tocaPresupuesto: boolean;
};

const ETIQUETA_NIVEL: Record<string, string> = { campana: "la campaña", conjunto: "el conjunto", anuncio: "el anuncio" };

/**
 * Guarda un cambio sobre algo que ya existe, sin aplicarlo. Quien lo aprueba lo ve con su antes y después; al aprobar
 * se vuelve a leer la plataforma y se aplica el plan de entonces. Si lo rechazan, todo queda como estaba.
 */
export async function crearSolicitudDeEdicion(
  actor: Actor,
  e: { provider: string; accountId: string; nivel: NivelEntidad; id: string; cambios: CambiosEdicion },
): Promise<Solicitud> {
  if (!puedeCrear(actor)) throw new ErrorDeSolicitud("Tu rol no puede enviar cambios a revisión.", 403);
  const prep = await prepararEdicion({ actor, provider: e.provider as Platform, accountId: e.accountId, nivel: e.nivel, id: e.id, cambios: e.cambios });
  const bloqueantes = prep.plan.problemas.filter((p) => p.bloqueante);
  if (bloqueantes.length > 0) throw new ErrorDeSolicitud(`Todavía no se puede enviar: ${[...new Set(bloqueantes.map((p) => p.mensaje))].join(" · ")}`, 422);
  if (!hayAlgoQueAplicar(prep.plan)) throw new ErrorDeSolicitud("No hay ningún cambio que enviar.", 422);
  const cliente = (await listPortfolios()).find((p) => p.id === prep.portfolioId);
  if (!cliente) throw new ErrorDeSolicitud("Cliente no encontrado.", 404);
  const nombre = prep.antes.entidad.nombre ?? e.id;
  const propuesta: EdicionPropuesta = {
    __edicion: true,
    portfolioId: prep.portfolioId,
    provider: e.provider,
    accountId: e.accountId,
    nivel: e.nivel,
    id: e.id,
    entidad: nombre,
    cambios: e.cambios,
    diff: prep.plan.diff,
    tocaPresupuesto: tocaPresupuesto(e.cambios),
  };
  const id = crypto.randomUUID();
  await getRawDb()
    .prepare(
      `INSERT INTO solicitudes (id, portfolio_id, portfolio_name, plataformas, titulo, destino, drafts_json, estado,
         creador_email, creador_nombre, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)`,
    )
    .bind(id, cliente.id, cliente.name, e.provider, `un cambio en ${ETIQUETA_NIVEL[e.nivel] ?? "la entidad"} «${nombre}»`, nombre, JSON.stringify([propuesta]), actor.email, nombreDe(actor), Date.now())
    .run();
  return auditada(actor, "creada", (await obtener(actor, id))!);
}

/** Contenido nuevo (imágenes sueltas o un carrusel) para un conjunto existente de Meta. Se crea al aprobarse y queda corriendo. */
export type ContenidoNuevo = {
  __contenido: true;
  portfolioId: string;
  accountId: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  nombre: string;
  datos: DatosDeContenido;
  /** Renovar: anuncios viejos del mismo conjunto que se pausan al publicarse lo nuevo. */
  retirar?: Array<{ id: string; nombre: string }>;
};

/** Crea una solicitud de contenido nuevo (imágenes o carrusel) dentro de conjuntos existentes de Meta. */
export async function crearSolicitudDeContenido(actor: Actor, piezas: ContenidoNuevo[]): Promise<Solicitud> {
  if (!puedeCrear(actor)) throw new ErrorDeSolicitud("Tu rol no puede enviar contenido a revisión.", 403);
  if (piezas.length === 0 || piezas.length > 10) throw new ErrorDeSolicitud("Una solicitud lleva entre 1 y 10 piezas de contenido.");
  const primero = piezas[0];
  if (piezas.some((p) => p.portfolioId !== primero.portfolioId)) throw new ErrorDeSolicitud("Todo debe ser del mismo cliente.");
  if (!enAlcance(actor, primero.portfolioId)) throw new ErrorDeSolicitud("Ese cliente no está en tu alcance.", 403);
  const cliente = (await listPortfolios()).find((p) => p.id === primero.portfolioId);
  if (!cliente) throw new ErrorDeSolicitud("Cliente no encontrado.", 404);
  const indice = await accountIndex();
  for (const p of piezas) {
    const duenio = indice.get(normalizeAccountId(p.accountId));
    if (!duenio || duenio.id !== p.portfolioId) throw new ErrorDeSolicitud("Esa cuenta no pertenece a este cliente.", 403);
    if (!p.adsetId) throw new ErrorDeSolicitud("Falta el conjunto de destino.");
    const errores = validarContenido(p.datos);
    if (errores.length > 0) throw new ErrorDeSolicitud(`Todavía no se puede enviar: ${errores.join(" · ")}`, 422);
    if (!(await paginaDeLaCuenta(cliente, p.accountId))) throw new ErrorDeSolicitud("Este cliente no tiene una Página de Facebook asociada para esa cuenta.", 409);
  }
  const id = crypto.randomUUID();
  const titulo = piezas.length === 1 ? tituloDeContenido(piezas[0].datos) : `${piezas.length} piezas de contenido nuevo`;
  await getRawDb()
    .prepare(
      `INSERT INTO solicitudes (id, portfolio_id, portfolio_name, plataformas, titulo, destino, drafts_json, estado,
         creador_email, creador_nombre, created_at)
       VALUES (?, ?, ?, 'meta', ?, ?, ?, 'pendiente', ?, ?, ?)`,
    )
    .bind(id, cliente.id, cliente.name, titulo, `${primero.adsetName} · ${primero.campaignName}`, JSON.stringify(piezas), actor.email, nombreDe(actor), Date.now())
    .run();
  return auditada(actor, "creada", (await obtener(actor, id))!);
}

/** Crea una solicitud solo de publicaciones de Instagram (se crean pausadas al aprobarse). */
export async function crearSolicitudDeInstagram(actor: Actor, impulsos: ImpulsoDeInstagram[]): Promise<Solicitud> {
  if (!puedeCrear(actor)) throw new ErrorDeSolicitud("Tu rol no puede enviar creaciones a revisión.", 403);
  if (impulsos.length === 0 || impulsos.length > 20) throw new ErrorDeSolicitud("Una solicitud lleva entre 1 y 20 piezas.");
  const primero = impulsos[0];
  if (impulsos.some((i) => i.portfolioId !== primero.portfolioId)) throw new ErrorDeSolicitud("Todas las piezas deben ser del mismo cliente.");
  if (!enAlcance(actor, primero.portfolioId)) throw new ErrorDeSolicitud("Ese cliente no está en tu alcance.", 403);
  const cliente = (await listPortfolios()).find((p) => p.id === primero.portfolioId);
  if (!cliente) throw new ErrorDeSolicitud("Cliente no encontrado.", 404);
  if (!cliente.instagramId && impulsos.some((i) => !i.facebook && !i.instagramId)) throw new ErrorDeSolicitud("Este cliente no tiene su cuenta de Instagram declarada.", 409);
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
  return auditada(actor, "creada", (await obtener(actor, id))!);
}

/** Crea una solicitud con uno o varios borradores. Todos deben poder publicarse (sin problemas bloqueantes). */
export async function crearSolicitud(actor: Actor, borradores: Array<Partial<CampaignDraft>>): Promise<Solicitud> {
  if (!puedeCrear(actor)) throw new ErrorDeSolicitud("Tu rol no puede enviar creaciones a revisión.", 403);
  if (borradores.length === 0 || borradores.length > 20) throw new ErrorDeSolicitud("Una solicitud lleva entre 1 y 20 piezas.");

  // Un cliente que no existe se dice así, no como «no tiene ninguna cuenta».
  for (const b of borradores) {
    if (b.portfolioId && !(await listPortfolios()).some((p) => p.id === b.portfolioId)) throw new ErrorDeSolicitud("Ese cliente no existe.", 404);
  }
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
  const faltas = [...new Set(armados.flatMap((a) => a.plan.issues.filter((i) => i.blocking).map((i) => i.message)))];
  if (faltas.length > 0) throw new ErrorDeSolicitud(`Todavía no se puede enviar: ${faltas.join(" · ")}`, 422);

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
  return auditada(actor, "creada", (await obtener(actor, id))!);
}

const nombreDe = (actor: Actor): string => {
  const antes = actor.email.split("@")[0] ?? actor.email;
  return antes.replace(/[._-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

/** Deja constancia en la auditoría de cada paso de una solicitud (creada, aprobada, rechazada, retirada, activa) y devuelve la solicitud. */
async function auditada(
  actor: Actor,
  accion: "creada" | "aprobada" | "rechazada" | "retirada" | "activa",
  s: Solicitud,
  extra: { nota?: string } = {},
): Promise<Solicitud> {
  const quien = nombreDe(actor);
  const destino = s.destino ? ` en ${s.destino}` : "";
  const que = s.cambios ? `${s.titulo}: ${resumenDeCambios(s.cambios)}` : `${s.titulo}${destino}`;
  const frase: Record<typeof accion, string> = {
    creada: `${quien} pidió ${que}`,
    aprobada: s.estado === "fallida" ? `${quien} aprobó ${s.titulo}${destino}, pero la plataforma falló` : `${quien} aprobó ${que}`,
    rechazada: `${quien} rechazó ${que}`,
    retirada: `${quien} retiró ${s.titulo}${destino}`,
    activa: `${quien} marcó como activa ${s.titulo}${destino}`,
  };
  const resultado: ResultadoDeAuditoria = accion === "rechazada" ? "rechazado" : accion === "creada" ? "pendiente" : s.estado === "fallida" ? "error" : "ok";
  await registrarAuditoria({
    categoria: "solicitud",
    accion,
    actorEmail: actor.email,
    actorNombre: quien,
    portfolioId: s.clienteId,
    portfolioNombre: s.clienteNombre,
    plataforma: s.plataformas.join(","),
    entidadTipo: "solicitud",
    entidadId: s.id,
    entidadNombre: s.titulo,
    titulo: frase[accion],
    resultado,
    etiquetas: s.cambios ? etiquetasDeCambios(s.cambios) : s.tocaPresupuesto ? ["presupuesto"] : [],
    detalle: {
      estado: s.estado,
      pidio: s.creador.nombre,
      reviso: s.revisor?.nombre ?? null,
      nota: extra.nota?.trim() || s.notaDeRevision || null,
      error: s.error,
      destino: s.destino || null,
      cambios: s.cambios,
      enlaces: s.enlaces,
    },
  });
  return s;
}

async function filaDe(id: string): Promise<Fila | null> {
  return (await getRawDb().prepare("SELECT * FROM solicitudes WHERE id = ? LIMIT 1").bind(id).first<Fila>()) ?? null;
}

/** Quién revisa esta solicitud: un cambio de presupuesto lo revisa solo quien puede aprobar presupuesto. */
function puedeRevisarEsta(actor: Actor, f: Fila): boolean {
  if (!puedeRevisar(actor) || !enAlcance(actor, f.portfolio_id)) return false;
  return !edicionDe(f)?.tocaPresupuesto || can(actor, "aprobar_presupuesto");
}

function puedeVer(actor: Actor, f: Fila): boolean {
  return f.creador_email === actor.email || puedeRevisarEsta(actor, f);
}

export async function obtener(actor: Actor, id: string): Promise<Solicitud | null> {
  const f = await filaDe(id);
  if (!f || !puedeVer(actor, f)) return null;
  return aSolicitud(f, await nombresDeRevisores(), await nombresDeAdministradores());
}

/** Las solicitudes que ve esta persona: las suyas y, si revisa, las pendientes de los clientes a su alcance. */
export async function listarSolicitudes(actor: Actor): Promise<{ porRevisar: Solicitud[]; mias: Solicitud[]; revisores: string[] }> {
  const revisores = await nombresDeRevisores();
  const administradores = await nombresDeAdministradores();
  const { results } = await getRawDb()
    .prepare("SELECT * FROM solicitudes ORDER BY created_at DESC LIMIT 300")
    .all<Fila>();
  const filas = (results ?? []).filter((f) => puedeVer(actor, f));
  // Ver directo en Meta Ads Manager o Google Ads: solo Directores y Administradores.
  const verEnPlataforma = can(actor, "aprobar_presupuesto");
  const todas = filas.map((f) => aSolicitud(f, revisores, administradores)).map((s) => (verEnPlataforma ? s : { ...s, enlaces: s.enlaces.filter((e) => !/^https:\/\/(adsmanager\.facebook\.com|business\.facebook\.com|ads\.google\.com)/i.test(e.url)) }));
  return {
    porRevisar: puedeRevisar(actor) ? todas.filter((s) => s.estado === "pendiente" && (!s.tocaPresupuesto || can(actor, "aprobar_presupuesto"))) : [],
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
  if (!puedeRevisarEsta(actor, f)) throw new ErrorDeSolicitud("Los cambios de presupuesto los aprueba un Director Digital o superior.", 403);
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
    // Contenido nuevo (imágenes o carrusel): se crea con la API directa de Meta.
    if ((d as { __contenido?: boolean }).__contenido) {
      const c = d as unknown as ContenidoNuevo;
      try {
        const cliente = (await listPortfolios()).find((p) => p.id === c.portfolioId);
        const deLaCampana = await paginaEInstagramDeLaCampana(c.campaignId);
        const paginaId = (cliente ? await paginaDeLaCuenta(cliente, c.accountId) : null) ?? deLaCampana?.pageId ?? null;
        if (!paginaId) throw new Error("Este cliente no tiene una Página de Facebook asociada.");
        const destinos = { paginaId, instagramUserId: deLaCampana?.instagramId ?? cliente?.instagramId };
        const creativos =
          c.datos.formato === "carrusel"
            ? [{ nombre: c.nombre, creativo: creativoDeCarrusel(c.datos, destinos, c.nombre) }]
            : c.datos.imagenes.map((im, i) => {
                const nombre = `${c.nombre} ${c.datos.imagenes.length > 1 ? i + 1 : ""}`.trim();
                return { nombre, creativo: creativoDeImagen(c.datos, im, destinos, nombre) };
              });
        for (const pieza of creativos) {
          const r = await crearAnuncioConCreativo(c.accountId, { nombre: pieza.nombre, conjuntoId: c.adsetId, creativo: pieza.creativo });
          anuncios.push({ provider: "meta", accountId: c.accountId, id: r.anuncioId });
          await marcarContenidoRenovado("meta", c.campaignId);
          pasosTotales.push({ platform: "meta", action: "ads:create_content", label: pieza.nombre, ok: true, error: null, raw: r } as PasoEjecutado);
        }
        if (c.retirar && c.retirar.length > 0) {
          for (const r of await retirarPiezasMeta(c.retirar)) {
            pasosTotales.push({ platform: "meta", action: "ads:retire_old", label: `Retirar (pausar) «${r.nombre}»`, ok: r.ok, error: r.error, raw: { id: r.id } } as PasoEjecutado);
          }
        }
        await registrarAuditoria({
          categoria: "creacion",
          accion: "publicada",
          actorEmail: actor.email,
          actorNombre: nombreDe(actor),
          portfolioId: c.portfolioId,
          plataforma: "meta",
          entidadTipo: "anuncio",
          entidadNombre: c.nombre,
          titulo: `Contenido aprobado por ${nombreDe(actor)}: ${tituloDeContenido(c.datos)} en «${c.adsetName}»`,
          detalle: {
            solicitudId: id,
            pidio: f.creador_nombre ?? f.creador_email,
            reviso: nombreDe(actor),
            formato: c.datos.formato,
            imagenes: c.datos.imagenes.map((im) => im.url).join("\n"),
            destino: `Conjunto «${c.adsetName}» (${c.adsetId}) · campaña «${c.campaignName}» (${c.campaignId}) · cuenta Meta ${c.accountId} · enlace del anuncio: ${c.datos.enlace}`,
            mensaje: c.datos.mensaje,
            enlaces: [{ etiqueta: "Revisar la campaña en Meta", url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${c.accountId}&selected_campaign_ids=${c.campaignId}` }],
          },
        });
        const url = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${c.accountId}&selected_campaign_ids=${c.campaignId}`;
        if (!enlaces.some((e) => e.url === url)) enlaces.push({ etiqueta: "Revisar la campaña en Meta", url });
      } catch (error) {
        fallo = error instanceof Error ? error.message : "No se pudo crear el contenido.";
        break;
      }
      continue;
    }
    // Cambio propuesto sobre algo existente: se vuelve a leer la plataforma y se aplica el plan de ahora.
    if ((d as { __edicion?: boolean }).__edicion) {
      const ed = d as unknown as EdicionPropuesta;
      try {
        const prep = await prepararEdicion({ actor, provider: ed.provider as Platform, accountId: ed.accountId, nivel: ed.nivel, id: ed.id, cambios: ed.cambios });
        const bloqueante = prep.plan.problemas.find((p) => p.bloqueante);
        if (bloqueante) throw new Error(bloqueante.mensaje);
        if (!hayAlgoQueAplicar(prep.plan)) throw new Error("Ya no hay nada que cambiar: la entidad cambió desde que se propuso.");
        const campaignId = "campaignId" in prep.antes.entidad ? prep.antes.entidad.campaignId : null;
        const r = await ejecutarPasosDeEdicion({
          provider: ed.provider as Platform,
          accountId: ed.accountId,
          nivel: ed.nivel,
          ids: { campaignId, conjuntoId: prep.antes.nivel === "anuncio" ? prep.antes.entidad.conjuntoId : null, id: ed.id },
          pasos: prep.plan.pasos,
          pausarAlFinal: prep.plan.pausaAlAplicar,
          activarAlFinal: prep.plan.activacionPedida === true,
          credencialesGoogle: prep.credencialesGoogle,
          credencialesLinkedin: prep.credencialesLinkedin,
        });
        await registrarEjecucion({ portfolioId: ed.portfolioId, name: `Cambio aprobado · ${ed.nivel} ${ed.id}`, platforms: [ed.provider as Platform] }, actor.email, r.pasos, r.ok);
        await registrarAuditoria({
          categoria: "cambio",
          accion: r.ok ? "aplicado" : "fallido",
          actorEmail: actor.email,
          actorNombre: nombreDe(actor),
          portfolioId: ed.portfolioId,
          plataforma: ed.provider,
          entidadTipo: ed.nivel,
          entidadId: ed.id,
          entidadNombre: ed.entidad,
          titulo: `Cambio aprobado por ${nombreDe(actor)} sobre «${ed.entidad}»: ${resumenDeCambios(prep.plan.diff)}${r.ok ? "" : " (falló)"}`,
          resultado: r.ok ? "ok" : "error",
          etiquetas: etiquetasDeCambios(prep.plan.diff),
          detalle: { cambios: prep.plan.diff, pasos: r.pasos.map((p) => ({ accion: p.action, ok: p.ok, error: p.error })), solicitudId: id },
        });
        pasosTotales.push(...(r.pasos as PasoEjecutado[]));
        const enlace = enlaceDeCampana(ed.provider as Platform, ed.accountId, campaignId ?? (ed.nivel === "campana" ? ed.id : null));
        if (enlace && !enlaces.some((x) => x.url === enlace.url)) enlaces.push(enlace);
        if (!r.ok) {
          fallo = r.pasos.find((p) => !p.ok)?.error ?? "Un paso falló.";
          break;
        }
      } catch (error) {
        fallo = error instanceof Error ? error.message : "No se pudo aplicar el cambio.";
        break;
      }
      continue;
    }
    // Impulso de una publicación de Instagram: se crea con la API directa de Meta.
    if ((d as { __instagram?: boolean }).__instagram) {
      const ig = d as unknown as ImpulsoDeInstagram;
      try {
        const cliente = (await listPortfolios()).find((p) => p.id === ig.portfolioId);
        const instagramUserId = ig.instagramId ?? cliente?.instagramId;
        if (!instagramUserId && !ig.facebook) throw new Error("Este cliente no tiene su cuenta de Instagram declarada.");
        const r = await crearAnuncioDesdeInstagram(ig.accountId, {
          nombre: ig.nombre,
          conjuntoId: ig.adsetId,
          instagramUserId,
          mediaId: ig.mediaId,
          facebook: ig.facebook,
          destino: ig.destino ?? null,
          paginaId: ig.paginaId ?? (cliente ? ((await paginaDeLaCuenta(cliente, ig.accountId)) ?? undefined) : undefined),
        });
        anuncios.push({ provider: "meta", accountId: ig.accountId, id: r.anuncioId });
        await marcarContenidoRenovado("meta", ig.campaignId);
        const retirados = ig.retirar && ig.retirar.length > 0 ? await retirarPiezasMeta(ig.retirar) : [];
        for (const x of retirados) {
          pasosTotales.push({ platform: "meta", action: "ads:retire_old", label: `Retirar (pausar) «${x.nombre}»`, ok: x.ok, error: x.error, raw: { id: x.id } } as PasoEjecutado);
        }
        await registrarAuditoria({
          categoria: "creacion",
          accion: "publicada",
          actorEmail: actor.email,
          actorNombre: nombreDe(actor),
          portfolioId: ig.portfolioId,
          plataforma: "meta",
          entidadTipo: "anuncio",
          entidadId: r.anuncioId,
          entidadNombre: ig.nombre,
          titulo: `Impulso aprobado por ${nombreDe(actor)}: «${ig.nombre}» en «${ig.adsetName}»`,
          detalle: {
            solicitudId: id,
            pidio: f.creador_nombre ?? f.creador_email,
            reviso: nombreDe(actor),
            destino: `Conjunto «${ig.adsetName}» (${ig.adsetId}) · campaña «${ig.campaignName}» (${ig.campaignId}) · cuenta Meta ${ig.accountId}`,
            publicacion: ig.enlace ?? null,
            formato: ig.formato ?? null,
            mensaje: ig.texto ?? null,
            anuncio: `${r.anuncioId} · creado activo; Meta lo revisa antes de entregarlo`,
            botonYDestino: ig.destino ? (ig.destino.tipo === "whatsapp" ? "Botón de WhatsApp" : `${ig.destino.cta ?? "Más información"} → ${ig.destino.url}`) : "El del conjunto (visita al perfil) o ninguno",
            identidad: [ig.paginaId ? `Página ${ig.paginaId}` : null, ig.instagramId ? `Instagram ${ig.instagramId}` : null].filter(Boolean).join(" · ") || null,
            conjuntoId: ig.adsetId,
            mediaId: ig.mediaId,
            anuncioId: r.anuncioId,
            regla: ig.regla?.nombre ?? null,
            retirados: retirados.length > 0 ? retirados.map((x) => `${x.ok ? "Pausado" : "No se pudo pausar"}: ${x.nombre} (${x.id})${x.error ? ` — ${x.error}` : ""}`).join("\n") : null,
            enlaces: [{ etiqueta: "Ver el anuncio en Meta Ads Manager", url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${ig.accountId}&selected_ad_ids=${r.anuncioId}` }],
          },
        });
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
      // Un anuncio nuevo dentro de una campaña que ya existía la deja con contenido renovado.
      if (r.ok && armado.draft.existingCampaign) await marcarContenidoRenovado(armado.draft.existingCampaign.platform, armado.draft.existingCampaign.campaignId);
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

  // El texto técnico queda en los pasos (resultado_json) y en la bitácora; quien creó la solicitud ve uno que entiende.
  if (fallo && /WINDSOR_API_KEY|META_SYSTEM_USER_TOKEN|ANTHROPIC_API_KEY|Falta conectar|no está configurad/i.test(fallo)) {
    fallo = "La conexión con la plataforma no está disponible ahora. Avisa a un administrador.";
  }
  await getRawDb()
    .prepare("UPDATE solicitudes SET estado = ?, error_texto = ?, resultado_json = ?, enlaces_json = ?, publicada_at = ?, avisada = 0 WHERE id = ?")
    .bind(fallo ? "fallida" : "publicada", fallo, JSON.stringify({ pasos: pasosTotales.map((p) => ({ platform: p.platform, action: p.action, ok: p.ok, error: p.error })), anuncios }), JSON.stringify(enlaces), Date.now(), id)
    .run();
  return auditada(actor, "aprobada", (await obtener(actor, id))!);
}

export async function rechazarSolicitud(actor: Actor, id: string, nota: string): Promise<Solicitud> {
  if (!puedeRevisar(actor)) throw new ErrorDeSolicitud("Solo un supervisor o administrador puede rechazar.", 403);
  const f = await filaDe(id);
  if (!f || !enAlcance(actor, f.portfolio_id)) throw new ErrorDeSolicitud("No encontré esa solicitud.", 404);
  if (!puedeRevisarEsta(actor, f)) throw new ErrorDeSolicitud("Los cambios de presupuesto los revisa un Director Digital o superior.", 403);
  if (!puedeTransicionar("rechazar", f.estado as EstadoDeSolicitud)) throw new ErrorDeSolicitud("Esa solicitud ya no está pendiente.", 409);
  // Quien creó la solicitud necesita saber qué cambiar: sin motivo no se rechaza.
  if (!nota.trim()) throw new ErrorDeSolicitud("Escribe el motivo del rechazo: quien la creó lo verá.", 400);
  await getRawDb()
    .prepare("UPDATE solicitudes SET estado = 'rechazada', revisor_email = ?, revisor_nombre = ?, nota_revision = ?, resuelta_at = ?, avisada = 0 WHERE id = ? AND estado = 'pendiente'")
    .bind(actor.email, nombreDe(actor), nota.trim().slice(0, 500) || null, Date.now(), id)
    .run();
  return auditada(actor, "rechazada", (await obtener(actor, id))!, { nota });
}

export async function cancelarSolicitud(actor: Actor, id: string): Promise<Solicitud> {
  const f = await filaDe(id);
  if (!f || f.creador_email !== actor.email) throw new ErrorDeSolicitud("No encontré esa solicitud.", 404);
  if (!puedeTransicionar("cancelar", f.estado as EstadoDeSolicitud)) throw new ErrorDeSolicitud("Ya no se puede retirar: alguien la revisó.", 409);
  await getRawDb().prepare("UPDATE solicitudes SET estado = 'cancelada', resuelta_at = ?, avisada = 1 WHERE id = ? AND estado = 'pendiente'").bind(Date.now(), id).run();
  return auditada(actor, "retirada", (await obtener(actor, id))!);
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
  return auditada(actor, "activa", (await obtener(actor, id))!);
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
