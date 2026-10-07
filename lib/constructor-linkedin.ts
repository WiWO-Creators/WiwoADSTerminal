/**
 * LinkedIn en el Constructor: lo que el borrador necesita para crear un grupo de campañas y una campaña en LinkedIn Ads, y la
 * traducción del lenguaje del Constructor (objetivo, países, idiomas, presupuesto) al de LinkedIn.
 *
 * Es puro (sin red ni base de datos) para poder probarlo solo. `buildPlan` (lib/constructor.ts) lo usa para armar los pasos y
 * `validateDraft` para decir qué falta. Los pasos se ejecutan por la API directa de LinkedIn (`lib/constructor-ejecutar.ts`), no
 * por Windsor, que no puede crear nada en LinkedIn.
 *
 * Vocabulario: la «campaña» del Constructor es un GRUPO de campañas en LinkedIn y el «conjunto» es su CAMPAÑA. Aquí se crean los
 * dos (el grupo y la campaña dentro de él), siempre en BORRADOR: un borrador no sirve anuncios ni gasta, y LinkedIn no deja
 * activar una campaña sin anuncio. El anuncio (publicación + creativo) exige un rol sobre la página de empresa y todavía no se
 * crea desde aquí: el plan lo dice con un paso informativo.
 *
 * SIN VERIFICAR contra todos los casos: las combinaciones objetivo/costo/formato y los ids de ubicación salen de la
 * documentación y de campañas reales de Colbún; la primera creación real en la cuenta de prueba dirá cuáles no sirven.
 */

export const INTENCIONES_POLITICAS_LINKEDIN = ["POLITICAL", "NOT_POLITICAL", "NOT_DECLARED"] as const;
export type IntencionPolitica = (typeof INTENCIONES_POLITICAS_LINKEDIN)[number];

export type LinkedinDraft = {
  /**
   * Declaración legal del anunciante (campo obligatorio de LinkedIn). SIN valor por defecto: `""` significa que nadie la ha
   * elegido y bloquea la publicación. Para segmentar la UE, LinkedIn exige confirmar «no es publicidad política».
   */
  intencionPolitica: "" | IntencionPolitica;
  /** Id numérico de la página de empresa que firma la campaña. Vacío: se usa la de la cuenta (`CuentaCliente.pageId`). */
  organizacionId: string;
  /** Lo que se paga por clic o por mil impresiones (la puja). LinkedIn lo exige; no se inventa. */
  costoUnitario: number | null;
  /** `""`: según el objetivo (`OBJETIVO_LINKEDIN`). */
  tipoCosto: "" | "CPC" | "CPM";
  /** Ids de ubicación de LinkedIn que sustituyen a los países del borrador. Vacío: se usan los países. */
  ubicacionesGeo: string[];
};

export const LINKEDIN_POR_DEFECTO: LinkedinDraft = {
  intencionPolitica: "",
  organizacionId: "",
  costoUnitario: null,
  tipoCosto: "",
  ubicacionesGeo: [],
};

export function normalizarLinkedin(raw: unknown): LinkedinDraft {
  if (!raw || typeof raw !== "object") return { ...LINKEDIN_POR_DEFECTO };
  const v = raw as Record<string, unknown>;
  const intencion = String(v.intencionPolitica ?? "").trim().toUpperCase();
  const costo = typeof v.costoUnitario === "number" && Number.isFinite(v.costoUnitario) && v.costoUnitario > 0 ? v.costoUnitario : null;
  const tipo = String(v.tipoCosto ?? "").trim().toUpperCase();
  return {
    intencionPolitica: (INTENCIONES_POLITICAS_LINKEDIN as readonly string[]).includes(intencion) ? (intencion as IntencionPolitica) : "",
    organizacionId: /^\d{1,15}$/.test(String(v.organizacionId ?? "").trim()) ? String(v.organizacionId).trim() : "",
    costoUnitario: costo,
    tipoCosto: tipo === "CPC" || tipo === "CPM" ? tipo : "",
    ubicacionesGeo: (Array.isArray(v.ubicacionesGeo) ? v.ubicacionesGeo : []).map((id) => String(id).trim()).filter((id) => /^\d{1,15}$/.test(id)),
  };
}

/**
 * País (ISO) → id de ubicación de LinkedIn (`urn:li:geo:ID`). Si un país no está aquí, el Constructor lo dice y pide el id a mano
 * (`LinkedinDraft.ubicacionesGeo`) en vez de segmentar a otro lugar: un id equivocado gasta dinero en el país equivocado.
 * Estados Unidos sale de la documentación de LinkedIn; los demás se contrastaron contra la API (ver `tests/constructor-linkedin.test.mjs`).
 */
export const LINKEDIN_GEO_IDS: Record<string, string> = {
  US: "103644278",
  CL: "104621616",
  PE: "102927786",
  CO: "100876405",
  MX: "103323778",
  AR: "100446943",
  ES: "105646813",
  EC: "106373116",
  PA: "100808673",
  BR: "106057199",
  UY: "100867946",
  PY: "104065273",
  CR: "101739942",
  VE: "101490751",
};

/**
 * Cómo se llama cada id según la propia API de LinkedIn (`GET /rest/geo`), comprobado el 2026-10-07. Es la prueba de que cada país
 * apunta de verdad a ese país: un id de memoria para Panamá resultó ser «Gatineau, Quebec» y los de Bolivia, Guatemala y Rep.
 * Dominicana apuntaban a Punjab, West Vancouver y Francia, por eso esos tres NO están en la tabla. Para agregar un país: pedir
 * su id con `/api/linkedin/ubicaciones?ids=` y comprobar el nombre ANTES de sumarlo aquí.
 */
export const NOMBRE_VERIFICADO_DE_UBICACION: Record<string, string> = {
  US: "United States",
  CL: "Chile",
  PE: "Peru",
  CO: "Colombia",
  MX: "Mexico",
  AR: "Argentina",
  ES: "Spain",
  EC: "Ecuador",
  PA: "Panama",
  BR: "Brazil",
  UY: "Uruguay",
  PY: "Paraguay",
  CR: "Costa Rica",
  VE: "Venezuela",
};

/** Objetivo del Constructor → objetivo de LinkedIn y tipo de costo habitual. */
export const OBJETIVO_LINKEDIN: Record<string, { objetivo: string; tipoCosto: "CPC" | "CPM" }> = {
  trafico: { objetivo: "WEBSITE_VISIT", tipoCosto: "CPC" },
  leads: { objetivo: "LEAD_GENERATION", tipoCosto: "CPM" },
  // Los valores de campaña (no los de grupo, que la documentación lista en plural) se comprobaron contra LinkedIn el 2026-10-07:
  // WEBSITE_VISIT, LEAD_GENERATION, BRAND_AWARENESS, ENGAGEMENT y WEBSITE_CONVERSION (singular; el plural es rechazado).
  ventas: { objetivo: "WEBSITE_CONVERSION", tipoCosto: "CPM" },
  alcance: { objetivo: "BRAND_AWARENESS", tipoCosto: "CPM" },
  interaccion: { objetivo: "ENGAGEMENT", tipoCosto: "CPM" },
};

/** Idioma de la interfaz de LinkedIn por cada idioma del Constructor. */
const LOCALES: Record<string, string> = { es: "es_ES", en: "en_US", pt: "pt_BR" };

export function localesLinkedin(idiomas: string[]): string[] {
  const locales = idiomas.map((i) => LOCALES[i]).filter((l): l is string => Boolean(l));
  return locales.length > 0 ? [...new Set(locales)] : [LOCALES.es];
}

export type EntradaLinkedin = {
  linkedin: LinkedinDraft;
  objetivo: string;
  mediaType: "image" | "video" | "none";
  /** Países elegidos (ISO). */
  paises: string[];
  /** Hay comunas, regiones o un radio: LinkedIn no los recibe y se avisa. */
  haySegmentacionFina: boolean;
  idiomas: string[];
  presupuesto: number | null;
  modo: "diaria" | "total";
  fin: string | null;
  moneda: string | null;
  paginaDeLaCuenta: string | null;
  /** Hoy, AAAA-MM-DD (UTC): arranque de la campaña. */
  hoy: string;
  /** Nombre ya compuesto con las siglas de objetivo y plataforma. */
  nombre: string;
};

export type ParametrosLinkedin =
  | {
      ok: true;
      grupo: { nombre: string; inicio: string; fin?: string };
      campana: {
        nombre: string;
        inicio: string;
        fin?: string;
        presupuestoDiario?: { monto: number; moneda: string };
        presupuestoTotal?: { monto: number; moneda: string };
        costoUnitario: { monto: number; moneda: string };
        ubicacionesGeo: string[];
        interfaceLocales: string[];
        objetivo: string;
        tipoDeCosto: string;
        formato: string;
        intencionPolitica: string;
        entidadAsociada: string;
      };
      avisos: string[];
    }
  | { ok: false; motivos: string[] };

/** Todo lo que LinkedIn necesita para crear el grupo y la campaña, o lo que falta (en lenguaje de la persona). */
export function parametrosLinkedin(e: EntradaLinkedin): ParametrosLinkedin {
  const motivos: string[] = [];
  const avisos: string[] = [];

  if (!e.moneda) motivos.push("La cuenta de LinkedIn no tiene moneda conocida: no se puede fijar un presupuesto.");
  if (!(e.presupuesto !== null && e.presupuesto > 0)) motivos.push("Falta el presupuesto de LinkedIn.");
  if (e.modo === "total" && !e.fin) motivos.push("LinkedIn exige una fecha de término cuando el presupuesto es total.");

  if (!e.linkedin.intencionPolitica) {
    motivos.push(
      "Declara si es publicidad política (LinkedIn lo exige). Es una declaración legal: no se completa sola. Para segmentar la UE confirma «no es publicidad política».",
    );
  }
  const organizacion = e.linkedin.organizacionId || (e.paginaDeLaCuenta ?? "").trim();
  if (!/^\d{1,15}$/.test(organizacion)) {
    motivos.push("Falta la página de empresa de LinkedIn (su id numérico) que firma los anuncios. Pídela al administrador de la página.");
  }
  if (!(e.linkedin.costoUnitario !== null && e.linkedin.costoUnitario > 0)) {
    motivos.push("Define cuánto pagar por clic o por mil impresiones (la puja): LinkedIn lo exige y no se adivina.");
  }

  let geo: string[] = e.linkedin.ubicacionesGeo;
  if (geo.length === 0) {
    if (e.paises.length === 0) {
      motivos.push("Elige al menos un país para segmentar en LinkedIn.");
    } else {
      const sinId = e.paises.filter((p) => !LINKEDIN_GEO_IDS[p]);
      if (sinId.length > 0) {
        motivos.push(`No hay id de LinkedIn para ${sinId.join(", ")}: escríbelo a mano en «Ubicaciones de LinkedIn» (no se segmenta a ciegas).`);
      }
      geo = e.paises.map((p) => LINKEDIN_GEO_IDS[p]).filter((id): id is string => Boolean(id));
    }
  }
  const idiomas = localesLinkedin(e.idiomas);
  if (idiomas.length > 1) {
    avisos.push(`LinkedIn admite un solo idioma de interfaz por campaña: esta usa ${idiomas[0]} y se omiten ${idiomas.slice(1).join(", ")}. Crea otra campaña para cada idioma extra.`);
  }
  if (e.haySegmentacionFina) {
    avisos.push("LinkedIn segmenta por país en este formulario: las comunas, regiones o el radio del mapa no se envían a LinkedIn.");
  }

  if (motivos.length > 0 || !e.moneda || e.presupuesto === null) return { ok: false, motivos };

  const tipoDeCosto = e.linkedin.tipoCosto || OBJETIVO_LINKEDIN[e.objetivo]?.tipoCosto || "CPC";
  const campana = {
    nombre: e.nombre,
    inicio: e.hoy,
    ...(e.fin ? { fin: e.fin } : {}),
    ...(e.modo === "total" ? { presupuestoTotal: { monto: e.presupuesto, moneda: e.moneda } } : { presupuestoDiario: { monto: e.presupuesto, moneda: e.moneda } }),
    costoUnitario: { monto: e.linkedin.costoUnitario as number, moneda: e.moneda },
    ubicacionesGeo: geo,
    // LinkedIn admite UN idioma de interfaz por campaña (comprobado): se usa el primero y el resto se avisa.
    interfaceLocales: localesLinkedin(e.idiomas).slice(0, 1),
    objetivo: OBJETIVO_LINKEDIN[e.objetivo]?.objetivo ?? "WEBSITE_VISIT",
    tipoDeCosto,
    formato: e.mediaType === "video" ? "SINGLE_VIDEO" : "STANDARD_UPDATE",
    intencionPolitica: e.linkedin.intencionPolitica,
    entidadAsociada: `urn:li:organization:${organizacion}`,
  };
  return { ok: true, grupo: { nombre: e.nombre, inicio: e.hoy, ...(e.fin ? { fin: e.fin } : {}) }, campana, avisos };
}
