/**
 * Periodos de consulta.
 *
 * Hasta ahora todo el sistema miraba el mes en curso y nada más. Eso basta
 * para saber cómo va el mes, pero no para lo que realmente se decide: si una
 * cuenta mejoró o empeoró, si conviene subir o bajar inversión, si un cambio
 * de la semana pasada sirvió. Para eso hay que poder comparar periodos.
 *
 * Reglas que se respetan acá:
 *
 * - **El mes en curso está incompleto y se dice.** Comparar un mes a medias
 *   contra uno cerrado y presentarlo como caída es el error clásico de los
 *   reportes de medios.
 * - **Nada de rangos que crucen el futuro.** Windsor devuelve filas vacías y
 *   se leerían como ceros.
 * - Las etiquetas nombran las fechas exactas, no solo "últimos 30 días", para
 *   que un pantallazo siga siendo interpretable mañana.
 */

export const RANGOS = [
  "mes_actual",
  "mes_anterior",
  "ultimos_7",
  "ultimos_30",
  "ultimos_90",
  "anio_actual",
] as const;

export type RangoId = (typeof RANGOS)[number];

export const RANGO_POR_DEFECTO: RangoId = "mes_actual";

export type Rango = {
  id: RangoId;
  label: string;
  desde: string;
  hasta: string;
  /** true: el periodo aún no termina, así que sus cifras van a seguir subiendo. */
  enCurso: boolean;
};

export const RANGO_LABELS: Record<RangoId, string> = {
  mes_actual: "Mes en curso",
  mes_anterior: "Mes anterior",
  ultimos_7: "Últimos 7 días",
  ultimos_30: "Últimos 30 días",
  ultimos_90: "Últimos 90 días",
  anio_actual: "Año en curso",
};

export function esRango(valor: string): valor is RangoId {
  return (RANGOS as readonly string[]).includes(valor);
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Fechas concretas de un periodo, calculadas en UTC como el resto del sistema. */
export function resolverRango(id: RangoId, ahora: Date): Rango {
  const hoy = iso(ahora);
  const anio = ahora.getUTCFullYear();
  const mes = ahora.getUTCMonth();
  const label = RANGO_LABELS[id];

  if (id === "mes_anterior") {
    // El único periodo completamente cerrado de la lista: del día 1 al último
    // día del mes pasado, sin depender de en qué día de hoy se mire.
    return {
      id,
      label,
      desde: iso(new Date(Date.UTC(anio, mes - 1, 1))),
      hasta: iso(new Date(Date.UTC(anio, mes, 0))),
      enCurso: false,
    };
  }

  if (id === "anio_actual") {
    return {
      id,
      label,
      desde: iso(new Date(Date.UTC(anio, 0, 1))),
      hasta: hoy,
      enCurso: true,
    };
  }

  const dias: Partial<Record<RangoId, number>> = {
    ultimos_7: 7,
    ultimos_30: 30,
    ultimos_90: 90,
  };
  const ventana = dias[id];
  if (ventana) {
    // La ventana incluye hoy, así que se restan ventana − 1 días. Restar la
    // ventana completa daría 8, 31 o 91 días.
    const inicio = new Date(ahora);
    inicio.setUTCDate(inicio.getUTCDate() - (ventana - 1));
    return { id, label, desde: iso(inicio), hasta: hoy, enCurso: true };
  }

  return {
    id: "mes_actual",
    label: RANGO_LABELS.mes_actual,
    desde: iso(new Date(Date.UTC(anio, mes, 1))),
    hasta: hoy,
    enCurso: true,
  };
}
