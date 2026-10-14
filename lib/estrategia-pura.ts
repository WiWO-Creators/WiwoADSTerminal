import type { CampaignDraft } from "@/lib/constructor";
import type { DatosDePublico } from "@/lib/meta-publicos-pura";

/**
 * Planes de estrategia: una estrategia aprobada (varias campañas, sus públicos y su calendario) convertida en borradores del
 * Constructor, en públicos por crear y en hitos para el calendario. Puro: lo usan la pantalla, el Orb y las pruebas.
 *
 * El primer plan es el de Colombia (Valor Development): Meta, clientes potenciales con formulario instantáneo, 8 semanas, USD 2.400.
 */

/**
 * Cómo se llama en Meta cada interés del plan, cuando no se busca igual en español (el catálogo de Meta mezcla nombres en español y en
 * inglés). Se prueba el nombre del plan y después estas alternativas; lo que no aparezca se dice, nunca se inventa un id.
 */
export const ALTERNATIVAS_DE_INTERES: Record<string, string[]> = {
  "Inversión inmobiliaria": ["Inversiones inmobiliarias", "Real estate investing"],
  "Gestión de patrimonio": ["Gestión patrimonial", "Wealth management"],
  "Clubes de campo": ["Club de campo", "Country club"],
  Golf: ["Golf (deporte)"],
};

/** Las búsquedas a probar para un interés del plan, en orden. */
export const consultasDeInteres = (nombre: string): string[] => [nombre, ...(ALTERNATIVAS_DE_INTERES[nombre] ?? [])];

export type CampanaDelPlan = {
  clave: string;
  /** Sin la sigla: el Constructor la agrega (`[LDS] Colombia | Bogotá`). */
  nombre: string;
  tipo: "prospeccion" | "retargeting";
  /** Total en medios para las 8 semanas, en USD. */
  presupuestoTotal: number;
  /** Semana (1 a 8) en que empieza a entregar. */
  desdeSemana: number;
  /** `home` = viven aquí, `recent` = estuvieron recientemente, `pais` = todo el país (retargeting). */
  ubicacion: "home" | "recent" | "pais";
  lugares: Array<{ nombre: string; radioKm: number }>;
  intereses: string[];
  edadMin: number;
  /** Claves de los públicos del plan que se excluyen / incluyen. */
  excluye: string[];
  incluye: string[];
  nota?: string;
};

export type PublicoDelPlan = { clave: string; nombre: string; descripcion: string; datos: (ctx: { formularioId: string }) => Omit<DatosDePublico, "nombre"> & { nombre?: string } };

export type PlanDeEstrategia = {
  id: string;
  nombre: string;
  clienteId: string;
  pais: string;
  moneda: string;
  semanas: number;
  campanas: CampanaDelPlan[];
  publicos: Array<{ clave: string; nombre: string; descripcion: string; tipo: "formulario" | "video" | "pagina" | "instagram"; quien?: "abrieron" | "abrieron_sin_enviar" | "enviaron"; porcentaje?: 25; dias: number }>;
};

export const PLAN_COLOMBIA: PlanDeEstrategia = {
  id: "colombia-valor",
  nombre: "Colombia · Valor Development",
  clienteId: "valor",
  pais: "CO",
  moneda: "USD",
  semanas: 8,
  campanas: [
    {
      clave: "bogota",
      nombre: "Colombia | Bogotá",
      tipo: "prospeccion",
      presupuestoTotal: 950,
      desdeSemana: 1,
      ubicacion: "home",
      lugares: [
        { nombre: "Chicó, Bogotá", radioKm: 2 },
        { nombre: "Rosales, Bogotá", radioKm: 2 },
        { nombre: "Country Club, Bogotá", radioKm: 2 },
        { nombre: "Usaquén, Bogotá", radioKm: 3 },
        { nombre: "Chía, Cundinamarca", radioKm: 3 },
        { nombre: "Cajicá, Cundinamarca", radioKm: 3 },
      ],
      intereses: ["Inversión inmobiliaria", "Banca privada", "Gestión de patrimonio"],
      edadMin: 35,
      excluye: ["leads_formulario"],
      incluye: [],
      nota: "Verifica el solapamiento entre Chicó y Rosales: a 2 km pueden fundirse en un solo polígono.",
    },
    {
      clave: "clubes",
      nombre: "Colombia | Clubes",
      tipo: "prospeccion",
      presupuestoTotal: 630,
      desdeSemana: 1,
      ubicacion: "recent",
      lugares: [
        { nombre: "Club El Rancho, Bogotá", radioKm: 2 },
        { nombre: "Los Lagartos, Bogotá", radioKm: 2 },
        { nombre: "Club Llanogrande, Rionegro", radioKm: 2 },
        { nombre: "Club El Rodeo, Medellín", radioKm: 2 },
        { nombre: "Club El Nogal, Bogotá", radioKm: 2 },
        { nombre: "Gun Club, Bogotá", radioKm: 2 },
        { nombre: "Centro Comercial Andino, Bogotá", radioKm: 2 },
        { nombre: "Club El Tesoro, Medellín", radioKm: 2 },
      ],
      intereses: [],
      edadMin: 35,
      excluye: ["leads_formulario"],
      incluye: [],
      nota: "Sin capa de intereses: el lugar ya es el filtro. El radio mínimo de Meta es 2 km (no 1 km).",
    },
    {
      clave: "medellin",
      nombre: "Colombia | Medellín",
      tipo: "prospeccion",
      presupuestoTotal: 600,
      desdeSemana: 1,
      ubicacion: "home",
      lugares: [
        { nombre: "El Poblado, Medellín", radioKm: 3 },
        { nombre: "Envigado, Antioquia", radioKm: 3 },
        { nombre: "Llanogrande, Rionegro", radioKm: 3 },
      ],
      intereses: ["Inversión inmobiliaria", "Banca privada", "Gestión de patrimonio", "Golf", "Clubes de campo"],
      edadMin: 35,
      excluye: ["leads_formulario"],
      incluye: [],
    },
    {
      clave: "retargeting",
      nombre: "Colombia | Retargeting",
      tipo: "retargeting",
      presupuestoTotal: 220,
      desdeSemana: 5,
      ubicacion: "pais",
      lugares: [],
      intereses: [],
      edadMin: 35,
      excluye: ["leads_formulario"],
      incluye: ["abrieron_sin_enviar", "video_25", "interaccion_pagina", "interaccion_instagram"],
      nota: "Se activa en la semana 5. Necesita al menos un video publicado para que exista el público de video.",
    },
  ],
  publicos: [
    { clave: "leads_formulario", nombre: "COL – Leads formulario", descripcion: "Quienes enviaron el formulario. Se excluye de las tres campañas de prospección.", tipo: "formulario", quien: "enviaron", dias: 90 },
    { clave: "abrieron_sin_enviar", nombre: "COL – Abrieron form sin enviar", descripcion: "Abrieron el formulario y no lo enviaron (30 días).", tipo: "formulario", quien: "abrieron_sin_enviar", dias: 30 },
    { clave: "video_25", nombre: "COL – Video 25%", descripcion: "Vieron al menos el 25 % de los videos de la página (30 días).", tipo: "video", porcentaje: 25, dias: 30 },
    { clave: "interaccion_pagina", nombre: "COL – Interacción FB", descripcion: "Interactuaron con la página de Facebook (30 días).", tipo: "pagina", dias: 30 },
    { clave: "interaccion_instagram", nombre: "COL – Interacción IG", descripcion: "Interactuaron con el perfil de Instagram (30 días).", tipo: "instagram", dias: 30 },
  ],
};

/** El total del plan en medios: debe coincidir con lo aprobado (USD 2.400). */
export const totalDelPlan = (p: PlanDeEstrategia): number => p.campanas.reduce((s, c) => s + c.presupuestoTotal, 0);

const DIA = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA);

/** La fecha `YYYY-MM-DD` en que empieza la semana `n` (1 = la semana de inicio). */
export function inicioDeSemana(inicio: string, n: number): string {
  return iso(sumarDias(new Date(`${inicio}T00:00:00Z`), (n - 1) * 7));
}

/** El último día del plan: el fin de la semana `semanas`. */
export function finDelPlan(inicio: string, semanas: number): string {
  return iso(sumarDias(new Date(`${inicio}T00:00:00Z`), semanas * 7 - 1));
}

export type Hito = { clave: string; fecha: string; titulo: string; detalle: string };

/** Los momentos del plan, con su fecha (todos «todo el día»). */
export function hitosDelPlan(inicio: string, semanas = 8): Hito[] {
  const fin = finDelPlan(inicio, semanas);
  const enSemana = (n: number) => inicioDeSemana(inicio, n);
  return [
    { clave: "pre", fecha: iso(sumarDias(new Date(`${inicio}T00:00:00Z`), -3)), titulo: "Pre-lanzamiento: confirmar que los leads llegan a destino", detalle: "Públicos, formulario y campañas construidas. Antes de publicar: integración al CRM activa o responsable de descarga designado." },
    { clave: "inicio", fecha: inicio, titulo: "Lanzamiento: las campañas empiezan a entregar", detalle: "Desde hoy y durante dos semanas NO se toca nada: cada cambio reinicia la calibración de Meta." },
    { clave: "corte3", fecha: enSemana(3), titulo: "Semana 3: primer corte con datos propios", detalle: "Reporte y reunión del mes 1. Ya se puede tocar. Acordar el umbral numérico para escalar." },
    { clave: "retargeting", fecha: enSemana(5), titulo: "Semana 5: se activa el retargeting", detalle: "Verifica que los públicos de retargeting tengan gente y que la campaña esté programada." },
    { clave: "aviso-fin", fecha: iso(sumarDias(new Date(`${fin}T00:00:00Z`), -7)), titulo: "Falta una semana para el fin del presupuesto", detalle: "Las campañas se detienen solas en la fecha de fin: decidir si se extienden o se cierran." },
    { clave: "cierre", fecha: fin, titulo: "Cierre de la semana 8: informe final y recomendación", detalle: "Reporte y reunión del mes 2." },
  ];
}

const escapar = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Un archivo `.ics` con los hitos como eventos de día completo y un aviso el día anterior. Se abre en cualquier calendario. */
export function icsDeHitos(nombreDelPlan: string, hitos: Hito[]): string {
  const sello = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WiWO.ADS//Estrategia//ES", "CALSCALE:GREGORIAN"];
  for (const h of hitos) {
    const dia = h.fecha.replace(/-/g, "");
    const siguiente = iso(sumarDias(new Date(`${h.fecha}T00:00:00Z`), 1)).replace(/-/g, "");
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${nombreDelPlan.replace(/\W+/g, "-").toLowerCase()}-${h.clave}-${dia}@wiwo.ads`,
      `DTSTAMP:${sello}`,
      `DTSTART;VALUE=DATE:${dia}`,
      `DTEND;VALUE=DATE:${siguiente}`,
      `SUMMARY:${escapar(`${nombreDelPlan} · ${h.titulo}`)}`,
      `DESCRIPTION:${escapar(h.detalle)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapar(h.titulo)}`,
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lineas.push("END:VCALENDAR");
  return lineas.join("\r\n");
}

export type ContextoDeBorrador = {
  /** `YYYY-MM-DD`: el día en que arranca el plan. */
  inicio: string;
  formularioId: string;
  urlDestino: string;
  /** Los ids de los públicos del plan ya creados, por clave. */
  publicos: Record<string, string>;
  /** Textos del anuncio (se completan en el Constructor). */
  mensaje?: string;
};

/**
 * El borrador del Constructor para una campaña del plan. Presupuesto TOTAL a nivel conjunto (ABO) con fecha de fin, un conjunto,
 * categoría especial ninguna, Advantage+ apagado, solo Facebook e Instagram (sin Audience Network) y el formulario instantáneo.
 * Los lugares y los intereses se resuelven en el Constructor (necesitan buscar su ubicación o su id): se devuelven aparte.
 */
export function borradorDeCampana(plan: PlanDeEstrategia, clave: string, ctx: ContextoDeBorrador): { borrador: Partial<CampaignDraft>; lugares: CampanaDelPlan["lugares"]; intereses: string[]; faltan: string[] } | null {
  const c = plan.campanas.find((x) => x.clave === clave);
  if (!c) return null;
  const faltan: string[] = [];
  const ids = (claves: string[]) =>
    claves.flatMap((k) => {
      const id = ctx.publicos[k];
      if (!id) faltan.push(plan.publicos.find((p) => p.clave === k)?.nombre ?? k);
      return id ? [id] : [];
    });
  const borrador: Partial<CampaignDraft> = {
    platforms: ["meta"],
    name: c.nombre,
    objective: "leads",
    conversionLocation: "formulario",
    metaLeadFormId: ctx.formularioId,
    landingUrl: ctx.urlDestino,
    message: ctx.mensaje ?? "",
    specialAdCategory: "ninguna",
    budgetMode: "total",
    dailyBudget: c.presupuestoTotal,
    endDate: finDelPlan(ctx.inicio, plan.semanas),
    metaStartDate: c.desdeSemana > 1 ? inicioDeSemana(ctx.inicio, c.desdeSemana) : "",
    metaBudgetLevel: "conjunto",
    metaAdvantageAudience: false,
    metaLocationType: c.ubicacion === "pais" ? "" : c.ubicacion,
    metaPlacements: ["facebook", "instagram"],
    targetCountries: [plan.pais],
    ageMin: c.edadMin,
    ageMax: 65,
    metaExcludedAudiences: ids(c.excluye),
    metaCustomAudiences: ids(c.incluye),
  };
  return { borrador, lugares: c.lugares, intereses: c.intereses, faltan };
}
