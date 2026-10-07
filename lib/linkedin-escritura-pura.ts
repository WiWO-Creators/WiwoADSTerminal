/**
 * Escritura en LinkedIn Ads (la parte pura: arma el plan exacto, sin red ni `env`, para poder probarlo solo).
 *
 * Traduce lo que la persona pide (renombrar, pausar, cambiar un presupuesto, crear un grupo de campañas o una campaña) en la
 * petición exacta que se enviaría a la API REST de LinkedIn. Las formas salen de la documentación de LinkedIn
 * («Create and Manage Campaign Groups» y «Create and Manage LinkedIn Campaigns», versión 202609). No están verificadas contra
 * una respuesta real: se comprueban en la cuenta de PRUEBA antes de usarse en ninguna otra.
 *
 * Vocabulario de WiWO.ADS ↔ LinkedIn: «campaña» = `adCampaignGroups` (grupo de campañas) y «conjunto» = `adCampaigns`
 * (campaña de LinkedIn). Aquí se usa el vocabulario de LinkedIn (grupo / campaña) porque son sus rutas.
 *
 * Todo lo que nace, nace en BORRADOR (`DRAFT`): LinkedIn solo permite crear en `ACTIVE` o `DRAFT`, y un borrador no sirve
 * anuncios ni gasta (equivale a «nace pausado» de Meta y Google).
 */
import { ErrorDeLinkedin, soloIds, urnCuenta, urnGrupo } from "@/lib/linkedin-nativo-pura";

/** `cuenta` es la cuenta publicitaria misma (solo se permite cambiar su organización de referencia). */
export type Nivel = "grupo" | "campana" | "cuenta";

/** Estados que LinkedIn deja fijar a mano. `CANCELLED` y `REMOVED` no se pueden fijar; borrar es otro camino y no se ofrece aquí. */
export const ESTADOS_EDITABLES = ["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"] as const;
export type EstadoEditable = (typeof ESTADOS_EDITABLES)[number];

export type Cambios = {
  nombre?: string;
  estado?: string;
  /** Solo campañas: el grupo comparte presupuesto solo en modo dinámico, que aquí no se maneja. */
  presupuestoDiario?: { monto: string | number; moneda: string };
  /** Solo en `cuenta`: la organización (`urn:li:organization:ID`) en cuyo nombre se anuncia. */
  referencia?: string;
};

export type PlanDeEscritura = {
  tipo: "actualizar" | "crear";
  nivel: Nivel;
  metodo: "POST";
  ruta: string;
  /** Cabeceras propias de esta operación (además de la autorización y la versión). */
  cabeceras: Record<string, string>;
  cuerpo: object;
  /** Lo que se verificará leyendo la entidad de vuelta: clave → valor esperado. */
  esperado: Record<string, string | number>;
  /** Una frase para la persona que va a aprobar. */
  resumen: string;
};

const MAX_NOMBRE_BYTES = 200;
const MONEDA = /^[A-Z]{3}$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const ENTIDAD_ASOCIADA = /^urn:li:(organization|person):[A-Za-z0-9_-]+$/;

function nombreValido(nombre: unknown, que: string): string {
  const n = typeof nombre === "string" ? nombre.trim() : "";
  if (n.length < 1) throw new ErrorDeLinkedin(`Falta el nombre de ${que}.`, 400);
  if (new TextEncoder().encode(n).length > MAX_NOMBRE_BYTES) throw new ErrorDeLinkedin(`El nombre de ${que} no puede pasar de ${MAX_NOMBRE_BYTES} bytes.`, 400);
  return n;
}

/** Un monto de LinkedIn va como texto: positivo, hasta 2 decimales. */
export function montoValido(monto: unknown, que: string): string {
  const texto = typeof monto === "number" ? String(monto) : typeof monto === "string" ? monto.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(texto) || Number(texto) <= 0) throw new ErrorDeLinkedin(`El monto de ${que} debe ser un número positivo con hasta 2 decimales.`, 400);
  return texto;
}

function monedaValida(moneda: unknown): string {
  const m = typeof moneda === "string" ? moneda.trim().toUpperCase() : "";
  if (!MONEDA.test(m)) throw new ErrorDeLinkedin(`Moneda inválida: ${String(moneda)}`, 400);
  return m;
}

/** Medianoche UTC de `AAAA-MM-DD`, en milisegundos (LinkedIn usa milisegundos desde 1970). */
export function milisegundosDeFecha(fecha: unknown, que: string): number {
  const m = FECHA.exec(typeof fecha === "string" ? fecha : "");
  if (!m) throw new ErrorDeLinkedin(`Fecha inválida para ${que}: use AAAA-MM-DD.`, 400);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(ms)) throw new ErrorDeLinkedin(`Fecha inválida para ${que}.`, 400);
  return ms;
}

const carpeta = (nivel: Nivel) => (nivel === "grupo" ? "adCampaignGroups" : "adCampaigns");

/** Ruta de una entidad concreta (para actualizarla o leerla de vuelta). */
export function rutaDeEntidad(nivel: Nivel, cuentaId: string, id: string): string {
  const [cuenta] = soloIds([cuentaId], "cuenta");
  if (nivel === "cuenta") return `/rest/adAccounts/${cuenta}`;
  const [entidad] = soloIds([id], nivel === "grupo" ? "grupo de campañas" : "campaña");
  return `/rest/adAccounts/${cuenta}/${carpeta(nivel)}/${entidad}`;
}

/**
 * Plan para cambiar nombre, estado y/o presupuesto diario de algo que ya existe. Solo viaja lo que cambió
 * (`PARTIAL_UPDATE` con `$set`), nunca el objeto entero.
 */
export function planDeActualizacion(datos: { nivel: Nivel; cuentaId: string; id: string; cambios: Cambios }): PlanDeEscritura {
  const { nivel, cambios } = datos;
  const ruta = rutaDeEntidad(nivel, datos.cuentaId, datos.id);
  const set: Record<string, unknown> = {};
  const esperado: Record<string, string | number> = {};
  const partes: string[] = [];

  if (cambios.nombre !== undefined) {
    const nombre = nombreValido(cambios.nombre, nivel === "grupo" ? "el grupo" : "la campaña");
    set.name = nombre;
    esperado.name = nombre;
    partes.push(`renombrar a «${nombre}»`);
  }
  if (cambios.estado !== undefined) {
    const estado = String(cambios.estado).trim().toUpperCase();
    if (!(ESTADOS_EDITABLES as readonly string[]).includes(estado)) {
      throw new ErrorDeLinkedin(`Estado no permitido: ${cambios.estado}. Permitidos: ${ESTADOS_EDITABLES.join(", ")}.`, 400);
    }
    set.status = estado;
    esperado.status = estado;
    partes.push(`pasar a ${estado}`);
  }
  if (cambios.presupuestoDiario !== undefined) {
    if (nivel === "grupo") throw new ErrorDeLinkedin("El presupuesto diario se cambia en la campaña, no en el grupo.", 400);
    const amount = montoValido(cambios.presupuestoDiario.monto, "el presupuesto diario");
    const currencyCode = monedaValida(cambios.presupuestoDiario.moneda);
    set.dailyBudget = { amount, currencyCode };
    esperado["dailyBudget.amount"] = Number(amount);
    partes.push(`presupuesto diario ${amount} ${currencyCode}`);
  }
  if (cambios.referencia !== undefined) {
    if (nivel !== "cuenta") throw new ErrorDeLinkedin("La referencia se cambia en la cuenta, no en el grupo ni en la campaña.", 400);
    const referencia = String(cambios.referencia).trim();
    if (!/^urn:li:organization:\d+$/.test(referencia)) throw new ErrorDeLinkedin("La referencia debe ser urn:li:organization:ID.", 400);
    set.reference = referencia;
    esperado.reference = referencia;
    partes.push(`referencia ${referencia}`);
  }
  if (nivel === "cuenta" && (cambios.nombre !== undefined || cambios.estado !== undefined || cambios.presupuestoDiario !== undefined)) {
    throw new ErrorDeLinkedin("En la cuenta solo se cambia la referencia.", 400);
  }
  if (Object.keys(set).length === 0) throw new ErrorDeLinkedin("No hay ningún cambio que aplicar.", 400);

  return {
    tipo: "actualizar",
    nivel,
    metodo: "POST",
    ruta,
    cabeceras: { "X-RestLi-Method": "PARTIAL_UPDATE" },
    cuerpo: { patch: { $set: set } },
    esperado,
    resumen: `${nivel === "grupo" ? "Grupo" : nivel === "campana" ? "Campaña" : "Cuenta"} ${nivel === "cuenta" ? datos.cuentaId : datos.id}: ${partes.join(", ")}.`,
  };
}

/**
 * Plan para crear un grupo de campañas, siempre en borrador. Un presupuesto total exige fecha de término
 * (`runSchedule.end` es obligatorio si hay `totalBudget`, según LinkedIn).
 */
export function planDeGrupo(datos: {
  cuentaId: string;
  nombre: string;
  inicio: string;
  fin?: string;
  presupuestoTotal?: { monto: string | number; moneda: string };
}): PlanDeEscritura {
  const [cuenta] = soloIds([datos.cuentaId], "cuenta");
  const nombre = nombreValido(datos.nombre, "el grupo");
  const start = milisegundosDeFecha(datos.inicio, "el inicio");
  const runSchedule: { start: number; end?: number } = { start };
  if (datos.fin !== undefined) {
    runSchedule.end = milisegundosDeFecha(datos.fin, "el término");
    if (runSchedule.end <= start) throw new ErrorDeLinkedin("El término debe ser posterior al inicio.", 400);
  }
  const cuerpo: Record<string, unknown> = { account: urnCuenta(cuenta), name: nombre, runSchedule, status: "DRAFT" };
  const esperado: Record<string, string | number> = { name: nombre, status: "DRAFT" };
  if (datos.presupuestoTotal !== undefined) {
    if (runSchedule.end === undefined) throw new ErrorDeLinkedin("Un presupuesto total necesita fecha de término.", 400);
    cuerpo.totalBudget = { amount: montoValido(datos.presupuestoTotal.monto, "el presupuesto total"), currencyCode: monedaValida(datos.presupuestoTotal.moneda) };
  }
  return {
    tipo: "crear",
    nivel: "grupo",
    metodo: "POST",
    ruta: `/rest/adAccounts/${cuenta}/adCampaignGroups`,
    cabeceras: {},
    cuerpo,
    esperado,
    resumen: `Crear el grupo de campañas «${nombre}» en borrador (cuenta ${cuenta}).`,
  };
}

export type DatosDeCampana = {
  cuentaId: string;
  grupoId: string;
  nombre: string;
  inicio: string;
  fin?: string;
  presupuestoDiario: { monto: string | number; moneda: string };
  costoUnitario: { monto: string | number; moneda: string };
  /** Ids numéricos de ubicaciones de LinkedIn (`urn:li:geo:ID`). Se piden porque dependen del cliente y no se adivinan. */
  ubicacionesGeo: string[];
  idioma?: string;
  pais?: string;
  objetivo?: string;
  tipoDeCosto?: string;
  formato?: string;
  /**
   * Declaración de publicidad política (campo obligatorio de LinkedIn). Es una declaración legal del anunciante, así que
   * NO tiene valor por defecto: quien crea la campaña debe elegirla. Para segmentar la UE, LinkedIn exige mostrar al
   * anunciante la confirmación «no es publicidad política» y devolver su respuesta aquí.
   */
  intencionPolitica: string;
  /**
   * La entidad en cuyo nombre sale la campaña: `urn:li:organization:ID` (página de empresa) o `urn:li:person:XXXX`. LinkedIn
   * exige que coincida con la `reference` de la cuenta publicitaria (una cuenta de prueba creada sin organización queda
   * referida a la persona que la creó) y que quien llama tenga permiso sobre ella: no se adivina.
   */
  entidadAsociada: string;
};

export const INTENCIONES_POLITICAS = ["POLITICAL", "NOT_POLITICAL", "NOT_DECLARED"] as const;

/**
 * Plan para crear una campaña (la unidad que gasta, con segmentación y puja) dentro de un grupo, en borrador. Los valores por
 * defecto (objetivo, tipo de costo y formato) son un punto de partida razonable, NO una combinación verificada: LinkedIn solo
 * admite ciertas combinaciones objetivo/costo/formato y el primer intento real en la cuenta de prueba dirá cuáles.
 */
export function planDeCampana(datos: DatosDeCampana): PlanDeEscritura {
  const [cuenta] = soloIds([datos.cuentaId], "cuenta");
  const [grupo] = soloIds([datos.grupoId], "grupo de campañas");
  const nombre = nombreValido(datos.nombre, "la campaña");
  const entidad = String(datos.entidadAsociada ?? "").trim();
  if (!ENTIDAD_ASOCIADA.test(entidad)) throw new ErrorDeLinkedin("La entidad asociada debe ser urn:li:organization:ID o urn:li:person:ID.", 400);
  const geo = soloIds(datos.ubicacionesGeo ?? [], "ubicación");
  if (geo.length === 0) throw new ErrorDeLinkedin("Falta al menos una ubicación para la segmentación.", 400);
  const idioma = (datos.idioma ?? "en").trim().toLowerCase();
  const pais = (datos.pais ?? "US").trim().toUpperCase();
  if (!/^[a-z]{2}$/.test(idioma) || !/^[A-Z]{2}$/.test(pais)) throw new ErrorDeLinkedin("Idioma y país deben ser códigos de 2 letras (por ejemplo en / US).", 400);
  const start = milisegundosDeFecha(datos.inicio, "el inicio");
  const runSchedule: { start: number; end?: number } = { start };
  if (datos.fin !== undefined) {
    runSchedule.end = milisegundosDeFecha(datos.fin, "el término");
    if (runSchedule.end <= start) throw new ErrorDeLinkedin("El término debe ser posterior al inicio.", 400);
  }
  const diario = { amount: montoValido(datos.presupuestoDiario.monto, "el presupuesto diario"), currencyCode: monedaValida(datos.presupuestoDiario.moneda) };
  const unitario = { amount: montoValido(datos.costoUnitario.monto, "el costo unitario"), currencyCode: monedaValida(datos.costoUnitario.moneda) };
  const politicalIntent = String(datos.intencionPolitica ?? "").trim().toUpperCase();
  if (!(INTENCIONES_POLITICAS as readonly string[]).includes(politicalIntent)) {
    throw new ErrorDeLinkedin(`Falta declarar la intención política: ${INTENCIONES_POLITICAS.join(", ")}.`, 400);
  }
  const costType = (datos.tipoDeCosto ?? "CPC").trim().toUpperCase();
  const objectiveType = (datos.objetivo ?? "WEBSITE_VISIT").trim().toUpperCase();
  const format = (datos.formato ?? "STANDARD_UPDATE").trim().toUpperCase();

  const cuerpo = {
    account: urnCuenta(cuenta),
    campaignGroup: urnGrupo(grupo),
    name: nombre,
    type: "SPONSORED_UPDATES",
    objectiveType,
    costType,
    format,
    locale: { language: idioma, country: pais },
    runSchedule,
    status: "DRAFT",
    politicalIntent,
    associatedEntity: entidad,
    audienceExpansionEnabled: false,
    offsiteDeliveryEnabled: false,
    creativeSelection: "ROUND_ROBIN",
    dailyBudget: diario,
    unitCost: unitario,
    targetingCriteria: {
      include: {
        and: [
          { or: { "urn:li:adTargetingFacet:interfaceLocales": [`urn:li:locale:${idioma}_${pais}`] } },
          { or: { "urn:li:adTargetingFacet:locations": geo.map((id) => `urn:li:geo:${id}`) } },
        ],
      },
    },
  };
  return {
    tipo: "crear",
    nivel: "campana",
    metodo: "POST",
    ruta: `/rest/adAccounts/${cuenta}/adCampaigns`,
    cabeceras: {},
    cuerpo,
    esperado: { name: nombre, status: "DRAFT", "dailyBudget.amount": Number(diario.amount) },
    resumen: `Crear la campaña «${nombre}» en borrador dentro del grupo ${grupo} (${objectiveType}, ${costType}, ${diario.amount} ${diario.currencyCode} al día).`,
  };
}

/** Lee `a.b` de un objeto anidado. */
function valorEn(objeto: unknown, camino: string): unknown {
  return camino.split(".").reduce<unknown>((actual, clave) => (typeof actual === "object" && actual !== null ? (actual as Record<string, unknown>)[clave] : undefined), objeto);
}

/** Compara lo que LinkedIn tiene ahora con lo que se pidió. Devuelve lo que NO coincide (vacío = verificado). */
export function diferenciasConLoEsperado(esperado: Record<string, string | number>, actual: unknown): { campo: string; esperado: string | number; actual: unknown }[] {
  const faltan: { campo: string; esperado: string | number; actual: unknown }[] = [];
  for (const [campo, valor] of Object.entries(esperado)) {
    const encontrado = valorEn(actual, campo);
    const igual = typeof valor === "number" ? Number(encontrado) === valor : encontrado === valor;
    if (!igual) faltan.push({ campo, esperado: valor, actual: encontrado ?? null });
  }
  return faltan;
}
