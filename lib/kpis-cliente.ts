/**
 * KPIs por cliente: qué se mira primero y contra qué meta se juzga a cada uno.
 *
 * Es puro y sin dependencias, para que lo compartan la base de datos, la
 * pantalla, las tablas y el asistente de IA sin arrastrar nada de servidor.
 */

export const KPIS_PRINCIPALES = ["leads", "ventas", "trafico", "alcance", "mensajes"] as const;
export type KpiPrincipal = (typeof KPIS_PRINCIPALES)[number];

export function esKpiPrincipal(valor: unknown): valor is KpiPrincipal {
  return typeof valor === "string" && (KPIS_PRINCIPALES as readonly string[]).includes(valor);
}

/** Columnas de la tabla de anuncios (ids de `COLUMNAS_METRICA` en `anuncios-view.tsx`). */
export type ColumnaId = string;

type DefinicionKpi = {
  etiqueta: string;
  /** Una línea para la ficha del cliente: qué significa elegirlo. */
  descripcion: string;
  /** Cómo se mide el éxito de este cliente, para el asistente. */
  comoSeMide: string;
  /** Columnas que conviene mostrar primero en las tablas de este cliente. */
  columnas: ColumnaId[];
};

export const DEFINICION_KPI: Record<KpiPrincipal, DefinicionKpi> = {
  leads: {
    etiqueta: "Leads",
    descripcion: "Se juzga por cuántos contactos consigue y a qué costo.",
    comoSeMide: "leads y costo por lead",
    columnas: ["invertido", "resultados", "costo", "clics", "ctr", "cpc"],
  },
  ventas: {
    etiqueta: "Ventas",
    descripcion: "Se juzga por compras, costo por compra y retorno (ROAS).",
    comoSeMide: "compras, costo por compra y ROAS",
    columnas: ["invertido", "compras", "resultados", "costo", "roas", "clics"],
  },
  trafico: {
    etiqueta: "Tráfico",
    descripcion: "Se juzga por visitas al sitio y su costo por clic.",
    comoSeMide: "clics, CPC, CTR y visitas a la página",
    columnas: ["invertido", "clics", "cpc", "ctr", "landingPageViews", "costoLandingPageView"],
  },
  alcance: {
    etiqueta: "Alcance / awareness",
    descripcion: "Se juzga por a cuánta gente llega y con qué frecuencia, no por conversiones.",
    comoSeMide: "alcance, CPM, frecuencia e interacciones",
    columnas: ["invertido", "alcance", "impresiones", "cpm", "frecuencia", "interacciones", "thruplays"],
  },
  mensajes: {
    etiqueta: "Mensajes",
    descripcion: "Se juzga por conversaciones iniciadas y su costo.",
    comoSeMide: "conversaciones iniciadas y costo por conversación",
    columnas: ["invertido", "resultados", "costo", "clics", "ctr", "impresiones"],
  },
};

export type MetasCliente = {
  cpaMicros: number | null;
  roas: number | null;
  cpmMicros: number | null;
  /** Fracción (0,015 = 1,5 %). */
  ctrMinimo: number | null;
  frecuenciaMaxima: number | null;
};

export const SIN_METAS: MetasCliente = {
  cpaMicros: null,
  roas: null,
  cpmMicros: null,
  ctrMinimo: null,
  frecuenciaMaxima: null,
};

/** Fila de la base → metas del cliente. Un `null` es "sin meta", nunca cero. */
export function metasDeFila(fila: {
  target_cpa_micros: number | null;
  target_roas_bp: number | null;
  target_cpm_micros?: number | null;
  target_ctr_bp?: number | null;
  max_frequency_x10?: number | null;
}): MetasCliente {
  return {
    cpaMicros: fila.target_cpa_micros,
    roas: fila.target_roas_bp === null ? null : fila.target_roas_bp / 100,
    cpmMicros: fila.target_cpm_micros ?? null,
    ctrMinimo: fila.target_ctr_bp == null ? null : fila.target_ctr_bp / 10_000,
    frecuenciaMaxima: fila.max_frequency_x10 == null ? null : fila.max_frequency_x10 / 10,
  };
}

/** Lo que se guarda en la base para cada meta, ya validado. */
export type ErrorDeMeta = string;

export function validarMetas(input: {
  targetCpmMicros?: number | null;
  targetCtr?: number | null;
  maxFrequency?: number | null;
}): ErrorDeMeta | null {
  const { targetCpmMicros, targetCtr, maxFrequency } = input;
  if (targetCpmMicros != null && !(targetCpmMicros > 0)) return "El CPM objetivo debe ser mayor a cero.";
  if (targetCtr != null && !(targetCtr > 0 && targetCtr <= 1)) {
    return "El CTR mínimo debe estar entre 0 y 100 % (como fracción: 0,015 es 1,5 %).";
  }
  if (maxFrequency != null && !(maxFrequency >= 1 && maxFrequency <= 20)) {
    return "La frecuencia máxima debe estar entre 1 y 20.";
  }
  return null;
}

/** Fracción → centésimas de punto porcentual (1,5 % → 150). */
export const ctrABp = (ctr: number): number => Math.round(ctr * 10_000);
/** Frecuencia → décimas (3,5 → 35). */
export const frecuenciaAX10 = (f: number): number => Math.round(f * 10);
