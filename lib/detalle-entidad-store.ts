import {
  CAMPOS_DETALLE,
  detalleAnuncioGaql,
  detalleAnuncioGoogle,
  detalleAnuncioLinkedin,
  detalleAnuncioMeta,
  detalleCampanaGaql,
  detalleCampanaGoogle,
  detalleCampanaLinkedin,
  detalleCampanaMeta,
  detalleConjuntoGaql,
  gruposDeRecursosGaql,
  detalleConjuntoGoogle,
  palabraClaveGaql,
  type PalabraClave,
  detalleConjuntoLinkedin,
  detalleConjuntoMeta,
  unicosPorId,
  type DetalleAnuncio,
  type DetalleCampana,
  type DetalleConjunto,
  type DetalleDeCuenta,
  type Row,
} from "@/lib/detalle-entidad";
import { versionDeEscrituras } from "@/lib/escrituras";
import { graphJson, leerEstructuraMeta, metaNativoConfigurado } from "@/lib/meta-nativo";
import { unidadesMenoresMeta } from "@/lib/monedas";
import {
  consultarGaql,
  GAQL_ANUNCIOS,
  GAQL_CAMPANAS,
  GAQL_EXTENSIONES,
  extensionesActualesDeFilas,
  GAQL_GRUPOS,
  GAQL_GRUPOS_DE_RECURSOS,
  GAQL_RECURSOS_DE_GRUPO,
  GAQL_PALABRAS,
  GoogleAdsNativoError,
  type CredencialesGoogle,
} from "@/lib/google-ads-nativo";
import { PLATFORM, type Platform } from "@/lib/plataformas";
import { entidadesRecientesDeCuenta } from "@/lib/publicaciones-pendientes";
import { requestWindsorConnector } from "@/lib/windsor";

/**
 * Lectura, bajo demanda y sin caché, de la configuración completa de una
 * cuenta: campañas, conjuntos y anuncios con todo lo que Windsor entrega para
 * editarlos. Sin caché a propósito: es el "antes" de una edición, y editar
 * sobre un dato de hace una hora es cómo se pisa un cambio ajeno.
 *
 * La API REST de Windsor solo devuelve entidades con actividad en el rango
 * pedido (ver `Catalogo` en `windsor.ts`), así que una campaña pausada hace más
 * tiempo que la ventana no aparece. Por eso la ventana es un parámetro y quien
 * llama debe tratar "no encontrada" como "no vista en esta ventana", no como
 * "no existe".
 */
export const VENTANA_DETALLE_DIAS = 90;
const TIMEOUT_DETALLE_MS = 60_000;

const AVISO_SOLO_ACTIVIDAD =
  "Windsor solo entrega lo que tuvo actividad en los últimos días: una campaña, conjunto o anuncio pausado o recién creado puede no aparecer.";

const AVISO_CONECTAR_GOOGLE =
  "Conecta tu cuenta de Google en Integraciones para ver también los anuncios sin actividad y poder editar su contenido.";

const ESTADOS_BORRADOS = new Set(["REMOVED", "DELETED"]);

function vigente(entidad: { estado: string | null }): boolean {
  return !ESTADOS_BORRADOS.has((entidad.estado ?? "").toUpperCase());
}

function ventana(dias: number): { desde: string; hasta: string } {
  const fin = new Date();
  const inicio = new Date(fin.getTime() - dias * 86_400_000);
  const iso = (fecha: Date) => fecha.toISOString().slice(0, 10);
  return { desde: iso(inicio), hasta: iso(fin) };
}

/**
 * La lectura de una cuenta entera (campañas, conjuntos y anuncios con su configuración) es lo que
 * más tarda al abrir el editor. Se recuerda unos minutos en memoria del proceso: abrir otra
 * campaña de la misma cuenta, o volver a abrir la misma, ya no vuelve a leer la plataforma. Cualquier
 * escritura (`lib/escrituras.ts`) invalida lo recordado, para que el editor no muestre lo anterior.
 */
const MEMORIA_DETALLE_MS = 3 * 60 * 1000;
const memoriaDeDetalle = new Map<string, { at: number; datos: Promise<DetalleDeCuenta> }>();

export function fetchDetalleDeCuenta(
  provider: Platform,
  accountId: string,
  opciones: { dias?: number; credencialesGoogle?: CredencialesGoogle | null } = {},
): Promise<DetalleDeCuenta> {
  const clave = `${provider}:${accountId}:${opciones.dias ?? VENTANA_DETALLE_DIAS}:${opciones.credencialesGoogle ? "nativa" : "windsor"}:${versionDeEscrituras()}`;
  const guardado = memoriaDeDetalle.get(clave);
  if (guardado && Date.now() - guardado.at < MEMORIA_DETALLE_MS) return guardado.datos;
  const datos = leerDetalleDeCuenta(provider, accountId, opciones).then(completarConNativoMeta).then(completarConRecientes);
  memoriaDeDetalle.set(clave, { at: Date.now(), datos });
  datos.catch(() => {
    if (memoriaDeDetalle.get(clave)?.datos === datos) memoriaDeDetalle.delete(clave);
  });
  if (memoriaDeDetalle.size > 12) memoriaDeDetalle.delete(memoriaDeDetalle.keys().next().value as string);
  return datos;
}

async function leerDetalleDeCuenta(
  provider: Platform,
  accountId: string,
  {
    dias = VENTANA_DETALLE_DIAS,
    credencialesGoogle = null,
  }: { dias?: number; credencialesGoogle?: CredencialesGoogle | null } = {},
): Promise<DetalleDeCuenta> {
  // Google con la API de la propia plataforma: trae todo lo que existe, no solo
  // lo que tuvo actividad. Si falla, se cae a Windsor y se dice por qué en vez
  // de dejar la pantalla sin datos.
  let avisoNativo: string | null = null;
  if (provider === "google" && credencialesGoogle) {
    try {
      return await fetchDetalleGoogleNativo(accountId, credencialesGoogle);
    } catch (error) {
      if (!(error instanceof GoogleAdsNativoError)) throw error;
      console.error("WiWO.ADS detalle Google nativo", error.status, error.detalle);
      avisoNativo = `${error.message} Se muestra lo que entrega Windsor.`;
    }
  }
  const detalle = await fetchDetalleWindsor(provider, accountId, dias);
  if (provider === "google") {
    detalle.avisos.push(avisoNativo ?? AVISO_CONECTAR_GOOGLE);
  }
  return detalle;
}

const SIN_CONTENIDO: DetalleAnuncio["contenido"] = {
  textoPrincipal: null, titulo: null, titulares: [], descripciones: [], urlDestino: null, urlsFinales: [], path1: null, path2: null,
  sufijoUrl: null, urlVisible: null, cta: null, imagenUrl: null, miniaturaUrl: null, imageHash: null, urlTags: null,
  creativeId: null, publicacionInstagram: null, vistaPreviaUrl: null,
};

const MOTIVO_RECIEN_CREADO =
  "Recién creado desde WiWO.ADS: la plataforma ya lo tiene, pero Windsor todavía no entrega su configuración. Se podrá editar en cuanto aparezca.";

/**
 * Windsor tarda horas en entregar lo recién creado. Mientras tanto, el árbol de edición se completa con lo que la bitácora
 * sabe que se creó (nombre, ids, presupuesto), marcado como no editable: así la campaña recién publicada se ve en el árbol
 * en vez de parecer que no se creó.
 */
/**
 * Meta: Windsor solo entrega lo que tuvo actividad. Con la conexión directa se suma lo que falta (campañas y conjuntos
 * pausados o recién creados), para poder verlos, editarlos y proponer cambios sobre ellos. Si la lectura falla, queda lo de Windsor.
 */
async function completarConNativoMeta(detalle: DetalleDeCuenta): Promise<DetalleDeCuenta> {
  if (detalle.provider !== "meta" || !metaNativoConfigurado()) return detalle;
  try {
    const moneda = (await graphJson<{ currency?: string }>(`act_${detalle.accountId.replace(/^act_/, "")}`, "GET", { fields: "currency" })).currency ?? null;
    const { campanas, conjuntos } = await leerEstructuraMeta(detalle.accountId, unidadesMenoresMeta(moneda));
    const filas = (f: Record<string, unknown>) => ({ ...f, account_currency: moneda });
    const camp = new Set(detalle.campanas.map((c) => c.id));
    const conj = new Set(detalle.conjuntos.map((c) => c.id));
    const nuevasCampanas = campanas.map((f) => detalleCampanaMeta(filas(f))).filter((c): c is DetalleCampana => c !== null && !camp.has(c.id));
    const nuevosConjuntos = conjuntos.map((f) => detalleConjuntoMeta(filas(f))).filter((c): c is DetalleConjunto => c !== null && !conj.has(c.id));
    if (nuevasCampanas.length + nuevosConjuntos.length === 0) return detalle;
    return {
      ...detalle,
      campanas: [...detalle.campanas, ...nuevasCampanas.map((c) => ({ ...c, accountId: detalle.accountId }))],
      conjuntos: [...detalle.conjuntos, ...nuevosConjuntos.map((c) => ({ ...c, accountId: detalle.accountId }))],
      avisos: [...detalle.avisos, "Se sumaron campañas y conjuntos que Windsor no entrega (pausados o recién creados), leídos directo de Meta."],
    };
  } catch (error) {
    console.error("WiWO.ADS detalle Meta nativo", error instanceof Error ? error.message : "error");
    return detalle;
  }
}

async function completarConRecientes(detalle: DetalleDeCuenta): Promise<DetalleDeCuenta> {
  if (detalle.provider !== "meta" && detalle.provider !== "google") return detalle;
  try {
    const recientes = await entidadesRecientesDeCuenta(detalle.provider, detalle.accountId);
    const camp = new Set(detalle.campanas.map((c) => c.id));
    const conj = new Set(detalle.conjuntos.map((c) => c.id));
    const anun = new Set(detalle.anuncios.map((a) => a.id));
    const nuevasCampanas = recientes.campanas.filter((c) => !camp.has(c.id));
    const nuevosConjuntos = recientes.conjuntos.filter((c) => !conj.has(c.id));
    const nuevosAnuncios = recientes.anuncios.filter((a) => !anun.has(a.id));
    if (nuevasCampanas.length + nuevosConjuntos.length + nuevosAnuncios.length === 0) return detalle;
    const sinPresupuesto = { diario: null, total: null };
    const sinPuja = { estrategia: null, objetivoCpa: null, objetivoRoas: null };
    return {
      ...detalle,
      campanas: [
        ...detalle.campanas,
        ...nuevasCampanas.map((c): DetalleCampana => ({
          provider: detalle.provider, accountId: detalle.accountId, id: c.id, nombre: c.nombre, estado: "PAUSED", objetivo: c.objetivo,
          presupuesto: { diario: c.presupuestoDiario, total: c.presupuestoTotal },
          puja: sinPuja, inicio: null, fin: null, categoriasEspeciales: [], limiteGasto: null, redes: null, urlSeguimiento: null,
        })),
      ],
      conjuntos: [
        ...detalle.conjuntos,
        ...nuevosConjuntos.map((j): DetalleConjunto => ({
          provider: detalle.provider, accountId: detalle.accountId, campaignId: j.campaignId, id: j.id, nombre: j.nombre, estado: "ACTIVE",
          tipo: null, presupuesto: sinPresupuesto, puja: { ...sinPuja, monto: null }, optimizacion: null, cobroPor: null, destino: null,
          inicio: null, fin: null, objetoPromovido: null, segmentacion: null, segmentacionCruda: null, palabrasClave: null,
        })),
      ],
      anuncios: [
        ...detalle.anuncios,
        ...nuevosAnuncios.map((a): DetalleAnuncio => ({
          provider: detalle.provider, accountId: detalle.accountId, campaignId: a.campaignId, conjuntoId: a.conjuntoId, id: a.id,
          nombre: a.nombre, estado: "PAUSED", tipo: null, contenido: SIN_CONTENIDO,
          edicionDeContenido: { editable: false, via: "ninguna", motivo: MOTIVO_RECIEN_CREADO },
          publicacion: { id: null, existente: false },
        })),
      ],
      avisos: [...detalle.avisos, "Hay entidades recién creadas que Windsor todavía no entrega: se muestran con lo que se sabe de ellas."],
    };
  } catch (error) {
    console.error("WiWO.ADS detalle: no se pudieron sumar las entidades recientes", error instanceof Error ? error.message : "error");
    return detalle;
  }
}

async function fetchDetalleGoogleNativo(
  accountId: string,
  cred: CredencialesGoogle,
): Promise<DetalleDeCuenta> {
  // Los grupos de recursos son de Performance Max: si la lectura falla (cuenta sin PMax, permisos) no se cae el resto.
  const sinGrupos = (): Promise<Array<Record<string, unknown>>> => Promise.resolve([]);
  const [campanas, conjuntos, anuncios, palabras, gruposRecursos, recursos, filasExtensiones] = await Promise.all([
    consultarGaql(cred, accountId, GAQL_CAMPANAS),
    consultarGaql(cred, accountId, GAQL_GRUPOS),
    consultarGaql(cred, accountId, GAQL_ANUNCIOS),
    consultarGaql(cred, accountId, GAQL_PALABRAS),
    consultarGaql(cred, accountId, GAQL_GRUPOS_DE_RECURSOS).catch(sinGrupos),
    consultarGaql(cred, accountId, GAQL_RECURSOS_DE_GRUPO).catch(sinGrupos),
    // Extensiones: si la lectura falla (permisos), la campaña se muestra igual, sin ellas.
    consultarGaql(cred, accountId, GAQL_EXTENSIONES).catch(sinGrupos),
  ]);
  // Con la API nativa se leyeron TODAS las palabras clave: un grupo sin
  // ninguna queda con lista vacía (no `null`, que significaría "sin leer").
  const porGrupo = new Map<string, PalabraClave[]>();
  for (const fila of palabras) {
    const k = palabraClaveGaql(fila);
    if (!k) continue;
    porGrupo.set(k.grupoId, [...(porGrupo.get(k.grupoId) ?? []), k.palabra]);
  }
  const gruposDeRecursos = gruposDeRecursosGaql(gruposRecursos, recursos);
  return {
    provider: "google",
    accountId,
    campanas: unicosPorId(nonNull(campanas.map((f) => detalleCampanaGaql(f, accountId)))).map((c) => {
      const ext = extensionesActualesDeFilas(filasExtensiones, c.id);
      const conExtensiones = {
        ...c,
        extensiones: {
          sitelinks: ext.filter((e) => e.tipo === "SITELINK").map((e) => ({ texto: e.texto, url: e.url, descripcion1: e.descripcion1, descripcion2: e.descripcion2 })),
          destacados: ext.filter((e) => e.tipo === "CALLOUT").map((e) => e.texto),
        },
      };
      return c.objetivo === "PERFORMANCE_MAX" ? { ...conExtensiones, gruposDeRecursos: gruposDeRecursos.filter((g) => g.campaignId === c.id) } : conExtensiones;
    }),
    conjuntos: unicosPorId(nonNull(conjuntos.map((f) => detalleConjuntoGaql(f, accountId)))).map(
      (g) => ({ ...g, palabrasClave: porGrupo.get(g.id) ?? [] }),
    ),
    anuncios: unicosPorId(nonNull(anuncios.map((f) => detalleAnuncioGaql(f, accountId)))),
    gruposDeRecursos,
    fuente: "nativa",
    avisos: [],
  };
}

async function fetchDetalleWindsor(
  provider: Platform,
  accountId: string,
  dias: number,
): Promise<DetalleDeCuenta> {
  const { desde, hasta } = ventana(dias);
  const conector = PLATFORM[provider].connector;
  const pedir = (campos: readonly string[]): Promise<Row[]> =>
    requestWindsorConnector(conector, [...campos], desde, hasta, {
      timeoutMs: TIMEOUT_DETALLE_MS,
      selectAccounts: accountId,
    });

  if (provider === "google") {
    const [campanas, conjuntos, anuncios] = await Promise.all([
      pedir(CAMPOS_DETALLE.google.campana),
      pedir(CAMPOS_DETALLE.google.conjunto),
      pedir(CAMPOS_DETALLE.google.anuncio),
    ]);
    return {
      provider,
      accountId,
      campanas: unicosPorId(nonNull(campanas.map(detalleCampanaGoogle))).filter(vigente),
      conjuntos: unicosPorId(nonNull(conjuntos.map(detalleConjuntoGoogle))).filter(vigente),
      anuncios: unicosPorId(nonNull(anuncios.map(detalleAnuncioGoogle))).filter(vigente),
      fuente: "windsor",
      avisos: [AVISO_SOLO_ACTIVIDAD],
    };
  }

  if (provider === "meta") {
    const [campanas, conjuntosYAnuncios] = await Promise.all([
      pedir(CAMPOS_DETALLE.meta.campana),
      pedir(CAMPOS_DETALLE.meta.conjuntoYAnuncio),
    ]);
    return {
      provider,
      accountId,
      campanas: unicosPorId(nonNull(campanas.map(detalleCampanaMeta))).filter(vigente),
      conjuntos: unicosPorId(nonNull(conjuntosYAnuncios.map(detalleConjuntoMeta))).filter(vigente),
      anuncios: unicosPorId(nonNull(conjuntosYAnuncios.map(detalleAnuncioMeta))).filter(vigente),
      fuente: "windsor",
      avisos: [AVISO_SOLO_ACTIVIDAD],
    };
  }

  if (provider === "linkedin") {
    const [campanas, conjuntos, anuncios] = await Promise.all([
      pedir(CAMPOS_DETALLE.linkedin.campana),
      pedir(CAMPOS_DETALLE.linkedin.conjunto),
      pedir(CAMPOS_DETALLE.linkedin.anuncio),
    ]);
    return {
      provider,
      accountId,
      campanas: unicosPorId(nonNull(campanas.map(detalleCampanaLinkedin))),
      conjuntos: unicosPorId(nonNull(conjuntos.map(detalleConjuntoLinkedin))),
      anuncios: unicosPorId(nonNull(anuncios.map(detalleAnuncioLinkedin))),
      fuente: "windsor",
      avisos: [AVISO_SOLO_ACTIVIDAD],
    };
  }

  // Plataformas declaradas pero sin lectura implementada: vacío, no un error
  // que hunda una pantalla que las recorre todas.
  return { provider, accountId, campanas: [], conjuntos: [], anuncios: [], fuente: "windsor", avisos: [] };
}

function nonNull<T>(items: Array<T | null>): T[] {
  return items.filter((item): item is T => item !== null);
}

export type EntidadPedida = {
  campana: DetalleCampana | null;
  conjunto: DetalleConjunto | null;
  anuncio: DetalleAnuncio | null;
};

/** Una entidad con sus padres, para mostrar el contexto completo al editarla. */
export function entidadConAncestros(
  detalle: DetalleDeCuenta,
  nivel: "campana" | "conjunto" | "anuncio",
  id: string,
): EntidadPedida {
  const vacio: EntidadPedida = { campana: null, conjunto: null, anuncio: null };
  if (nivel === "campana") {
    return { ...vacio, campana: detalle.campanas.find((c) => c.id === id) ?? null };
  }
  if (nivel === "conjunto") {
    const conjunto = detalle.conjuntos.find((c) => c.id === id) ?? null;
    const campana = conjunto?.campaignId
      ? (detalle.campanas.find((c) => c.id === conjunto.campaignId) ?? null)
      : null;
    return { ...vacio, campana, conjunto };
  }
  const anuncio = detalle.anuncios.find((a) => a.id === id) ?? null;
  const conjunto = anuncio?.conjuntoId
    ? (detalle.conjuntos.find((c) => c.id === anuncio.conjuntoId) ?? null)
    : null;
  const campanaId = anuncio?.campaignId ?? conjunto?.campaignId ?? null;
  const campana = campanaId ? (detalle.campanas.find((c) => c.id === campanaId) ?? null) : null;
  return { campana, conjunto, anuncio };
}
