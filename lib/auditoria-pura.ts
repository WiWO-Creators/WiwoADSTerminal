/**
 * Auditoría: qué se registra y cómo se lee. Parte pura, sin base de datos: categorías, etiquetas, importancia y la frase de
 * cada cambio con su antes y después.
 */
export const CATEGORIAS_DE_AUDITORIA = ["asistente", "solicitud", "decision", "cambio", "creacion", "regla", "equipo"] as const;
export type CategoriaDeAuditoria = (typeof CATEGORIAS_DE_AUDITORIA)[number];

export const ETIQUETA_CATEGORIA: Record<CategoriaDeAuditoria, string> = {
  asistente: "Pedidos al bot",
  solicitud: "Solicitudes",
  decision: "Decisiones",
  cambio: "Cambios",
  creacion: "Creaciones",
  regla: "Reglas",
  equipo: "Equipo",
};

export type ResultadoDeAuditoria = "ok" | "error" | "pendiente" | "rechazado";
export type ImportanciaDeAuditoria = "normal" | "alta";

/** Lo que un cambio tocó, para filtrar: presupuesto, títulos, contenido, estado… */
export const ETIQUETAS_DE_CAMBIO = ["presupuesto", "titulo", "contenido", "estado", "segmentacion", "puja", "fechas", "otros"] as const;
export type EtiquetaDeCambio = (typeof ETIQUETAS_DE_CAMBIO)[number];

export const ETIQUETA_DE_CAMBIO_TEXTO: Record<EtiquetaDeCambio, string> = {
  presupuesto: "Presupuesto",
  titulo: "Títulos y nombres",
  contenido: "Contenido y gráficas",
  estado: "Pausar / activar",
  segmentacion: "Segmentación",
  puja: "Puja",
  fechas: "Fechas",
  otros: "Otros",
};

export type CambioDeAuditoria = { campo: string; etiqueta: string; antes: string; despues: string };

const CAMPOS_DE_CONTENIDO = new Set(["textoPrincipal", "descripcion", "descripciones", "urlDestino", "urlsFinales", "imagenUrl", "cta", "urlTags", "palabrasClave", "path1", "path2", "sufijoUrl", "dominioConversion", "mensajeBienvenida", "plantillaSeguimiento"]);
const CAMPOS_DE_SEGMENTACION = new Set(["generos", "interesesIds", "audienciasIncluir", "audienciasExcluir", "edadMin", "edadMax", "paises", "plataformas", "presencia", "redes", "atribucion", "optimizacion", "categoriaEspecial"]);

/** A qué etiqueta pertenece el campo de un cambio. */
export function etiquetaDeCampo(campo: string): EtiquetaDeCambio {
  if (campo === "presupuesto" || campo === "limiteGasto") return "presupuesto";
  if (campo === "nombre" || campo === "titulo" || campo === "titulares") return "titulo";
  if (campo === "estado" || campo === "pausar" || campo === "activar") return "estado";
  if (campo === "puja" || campo === "pujaGoogle" || campo === "estrategiaPuja") return "puja";
  if (campo === "fin" || campo === "inicio") return "fechas";
  if (CAMPOS_DE_CONTENIDO.has(campo)) return "contenido";
  if (CAMPOS_DE_SEGMENTACION.has(campo)) return "segmentacion";
  return "otros";
}

/** A qué etiqueta pertenece una acción de plataforma (`set_campaign_budget`, `rename_campaign`, `pause_ad`…). */
export function etiquetaDeAccion(accion: string): EtiquetaDeCambio {
  const a = accion.toLowerCase();
  if (/budget|presupuesto/.test(a)) return "presupuesto";
  if (/rename|_name/.test(a)) return "titulo";
  if (/creative|image|asset|headline|description|copy|keyword/.test(a)) return "contenido";
  if (/pause|enable|resume|status/.test(a)) return "estado";
  if (/target|geo|audience|language/.test(a)) return "segmentacion";
  if (/bid|cpc|roas|cpa/.test(a)) return "puja";
  if (/date|schedule/.test(a)) return "fechas";
  return "otros";
}

export function etiquetasDeCambios(cambios: CambioDeAuditoria[]): EtiquetaDeCambio[] {
  return [...new Set(cambios.map((c) => etiquetaDeCampo(c.campo)))];
}

/** «Presupuesto diario: $10.000 → $8.000 · Nombre: A → B» */
export function resumenDeCambios(cambios: CambioDeAuditoria[], maximo = 3): string {
  if (cambios.length === 0) return "sin cambios visibles";
  const partes = cambios.slice(0, maximo).map((c) => `${c.etiqueta}: ${c.antes} → ${c.despues}`);
  return partes.join(" · ") + (cambios.length > maximo ? ` · y ${cambios.length - maximo} más` : "");
}

/** Qué se marca como importante: tocar presupuesto, rechazar, fallar o pedirle al bot que cree o cambie algo. */
export function importanciaDe(e: { categoria: CategoriaDeAuditoria; accion: string; resultado: ResultadoDeAuditoria; etiquetas: string[] }): ImportanciaDeAuditoria {
  if (e.resultado === "error" || e.resultado === "rechazado") return "alta";
  if (e.etiquetas.includes("presupuesto")) return "alta";
  if (e.categoria === "equipo") return "alta";
  if (e.categoria === "decision" && e.accion === "descartada") return "alta";
  return "normal";
}

export type EventoDeAuditoria = {
  categoria: CategoriaDeAuditoria;
  accion: string;
  actorEmail: string;
  actorNombre?: string | null;
  portfolioId?: string | null;
  portfolioNombre?: string | null;
  plataforma?: string | null;
  entidadTipo?: string | null;
  entidadId?: string | null;
  entidadNombre?: string | null;
  titulo: string;
  resultado?: ResultadoDeAuditoria;
  etiquetas?: string[];
  detalle?: unknown;
};

/** Los textos largos (un pedido al bot, una respuesta de plataforma) se cortan: la auditoría guarda lo que hace falta, no todo. */
export function recortar(texto: string, largo = 600): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > largo ? `${limpio.slice(0, largo)}…` : limpio;
}

/** Entradas de una herramienta del asistente, resumidas y sin nada que parezca un secreto. */
export function resumenDeEntrada(entrada: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entrada)) {
    if (/token|secret|clave|password|key/i.test(k)) continue;
    if (typeof v === "string") salida[k] = recortar(v, 200);
    else if (Array.isArray(v)) salida[k] = v.length > 6 ? `${v.length} elementos` : v.map((x) => (typeof x === "string" ? recortar(x, 80) : x));
    else if (v !== null && typeof v === "object") salida[k] = recortar(JSON.stringify(v), 200);
    else salida[k] = v;
  }
  return salida;
}
