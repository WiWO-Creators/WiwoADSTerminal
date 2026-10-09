import { EVENTOS_NO_CONVERSION, INTERACCION, esEventoDeLead, type EventoGa4, type Hallazgo } from "./medicion";

/**
 * Los números del panel visual de Salud de medición. Puro: recibe los eventos ya leídos de GA4 y los reparte en grupos que se
 * entienden de un vistazo (qué parte de lo que se mide son leads, qué parte es navegación automática…). No inventa nada: todo sale
 * de los eventos reales de la propiedad.
 */

export type TipoDeEvento = "lead" | "clave" | "interaccion" | "navegacion" | "otro";

export const ETIQUETA_DE_TIPO: Record<TipoDeEvento, string> = {
  lead: "Leads y contactos",
  clave: "Otras conversiones",
  interaccion: "Interacción del sitio",
  navegacion: "Navegación automática",
  otro: "Otros eventos",
};

export function tipoDeEvento(e: EventoGa4): TipoDeEvento {
  if (EVENTOS_NO_CONVERSION.has(e.nombre)) return "navegacion";
  if (esEventoDeLead(e.nombre)) return "lead";
  if (e.clave > 0) return "clave";
  if (INTERACCION.test(e.nombre)) return "interaccion";
  return "otro";
}

export type PorTipo = { tipo: TipoDeEvento; etiqueta: string; eventos: number };

export type ResumenDePanel = {
  total: number;
  conversiones: number;
  distintos: number;
  porTipo: PorTipo[];
  /** Los de más volumen, con su tipo. */
  principales: Array<EventoGa4 & { tipo: TipoDeEvento }>;
  /** Solo lo que es lead o conversión, de más a menos. */
  leads: Array<EventoGa4 & { tipo: TipoDeEvento }>;
};

const ORDEN: TipoDeEvento[] = ["lead", "clave", "interaccion", "otro", "navegacion"];

export function resumenDePanel(eventos: EventoGa4[], maximo = 7): ResumenDePanel {
  const conTipo = eventos.filter((e) => e.eventos > 0).map((e) => ({ ...e, tipo: tipoDeEvento(e) }));
  const suma = new Map<TipoDeEvento, number>();
  for (const e of conTipo) suma.set(e.tipo, (suma.get(e.tipo) ?? 0) + e.eventos);
  const ordenados = [...conTipo].sort((a, b) => b.eventos - a.eventos);
  return {
    total: conTipo.reduce((s, e) => s + e.eventos, 0),
    conversiones: conTipo.reduce((s, e) => s + e.clave, 0),
    distintos: conTipo.length,
    porTipo: ORDEN.filter((t) => (suma.get(t) ?? 0) > 0).map((t) => ({ tipo: t, etiqueta: ETIQUETA_DE_TIPO[t], eventos: suma.get(t) ?? 0 })),
    principales: ordenados.slice(0, maximo),
    leads: ordenados.filter((e) => e.tipo === "lead" || e.tipo === "clave").slice(0, maximo),
  };
}

export type Tendencia = { porDia30: number; porDia7: number; cambio: number | null };

/** Eventos de lead y conversión por día: la última semana contra el promedio de 30 días. `null` si no hay base para comparar. */
export function tendenciaDeLeads(eventos30: EventoGa4[], eventos7: EventoGa4[] | null | undefined): Tendencia | null {
  if (!eventos7) return null;
  const leads = (lista: EventoGa4[]) => lista.filter((e) => ["lead", "clave"].includes(tipoDeEvento(e))).reduce((s, e) => s + e.eventos, 0);
  const porDia30 = leads(eventos30) / 30;
  const porDia7 = leads(eventos7) / 7;
  return { porDia30, porDia7, cambio: porDia30 > 0 ? ((porDia7 - porDia30) / porDia30) * 100 : null };
}

export type PorSeveridad = { clave: "alta" | "media" | "ok"; etiqueta: string; cantidad: number };

/** Hallazgos por severidad; sin hallazgos queda un solo grupo «en orden» para que el gráfico no quede vacío. */
export function hallazgosPorSeveridad(hallazgos: Hallazgo[]): PorSeveridad[] {
  const alta = hallazgos.filter((h) => h.severidad === "alta").length;
  const media = hallazgos.filter((h) => h.severidad === "media").length;
  if (alta + media === 0) return [{ clave: "ok", etiqueta: "Sin problemas", cantidad: 1 }];
  return [
    ...(alta > 0 ? [{ clave: "alta" as const, etiqueta: "Graves", cantidad: alta }] : []),
    ...(media > 0 ? [{ clave: "media" as const, etiqueta: "A revisar", cantidad: media }] : []),
  ];
}
