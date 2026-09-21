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

/** Periodos con nombre. Los de Meta Ads Manager más "Año en curso". */
export const RANGOS = [
  "hoy",
  "ayer",
  "hoy_ayer",
  "ultimos_7",
  "ultimos_14",
  "ultimos_28",
  "ultimos_30",
  "ultimos_90",
  "esta_semana",
  "semana_pasada",
  "mes_actual",
  "mes_anterior",
  "anio_actual",
] as const;

export type RangoNombrado = (typeof RANGOS)[number];

/** Rango a mano: `2026-09-01..2026-09-21` (desde..hasta, ambos incluidos). */
export type RangoPersonalizado =
  `${number}-${number}-${number}..${number}-${number}-${number}`;

export type RangoId = RangoNombrado | RangoPersonalizado;

export const RANGO_POR_DEFECTO: RangoId = "mes_actual";

export type Rango = {
  id: RangoId;
  label: string;
  desde: string;
  hasta: string;
  /** true: el periodo aún no termina, así que sus cifras van a seguir subiendo. */
  enCurso: boolean;
};

export const RANGO_LABELS: Record<RangoNombrado, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  hoy_ayer: "Hoy y ayer",
  ultimos_7: "Últimos 7 días",
  ultimos_14: "Últimos 14 días",
  ultimos_28: "Últimos 28 días",
  ultimos_30: "Últimos 30 días",
  ultimos_90: "Últimos 90 días",
  esta_semana: "Esta semana",
  semana_pasada: "La semana pasada",
  mes_actual: "Mes en curso",
  mes_anterior: "Mes anterior",
  anio_actual: "Año en curso",
};

const PATRON_PERSONALIZADO = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
/** Tope de un rango a mano: más allá, la lectura cold contra Windsor deja de ser razonable. */
const MAXIMO_DIAS_PERSONALIZADO = 366 * 3;

export function esRangoNombrado(valor: string): valor is RangoNombrado {
  return (RANGOS as readonly string[]).includes(valor);
}

function fechaValida(texto: string): boolean {
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && iso(fecha) === texto;
}

export function esRango(valor: string): valor is RangoId {
  if (esRangoNombrado(valor)) return true;
  const coincide = PATRON_PERSONALIZADO.exec(valor);
  if (!coincide) return false;
  const [, desde, hasta] = coincide;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) return false;
  const dias =
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) /
      86_400_000 +
    1;
  return dias <= MAXIMO_DIAS_PERSONALIZADO;
}

export function rangoPersonalizado(desde: string, hasta: string): RangoId {
  return `${desde}..${hasta}` as RangoPersonalizado;
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function dia(texto: string): Date {
  return new Date(`${texto}T00:00:00Z`);
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setUTCDate(copia.getUTCDate() + dias);
  return copia;
}

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "1 sep 2026" — el mismo formato corto que muestra Meta en su selector. */
export function fechaCorta(texto: string): string {
  const fecha = dia(texto);
  return `${fecha.getUTCDate()} ${MESES_CORTOS[fecha.getUTCMonth()]} ${fecha.getUTCFullYear()}`;
}

/** Fechas concretas de un periodo, calculadas en UTC como el resto del sistema. */
export function resolverRango(id: RangoId, ahora: Date): Rango {
  const hoy = iso(ahora);

  if (!esRangoNombrado(id)) {
    const coincide = PATRON_PERSONALIZADO.exec(id);
    if (coincide && esRango(id)) {
      // Nada de rangos que crucen el futuro: Windsor devuelve filas vacías y
      // se leerían como ceros.
      const hasta = coincide[2] > hoy ? hoy : coincide[2];
      const desde = coincide[1] > hasta ? hasta : coincide[1];
      return {
        id: rangoPersonalizado(desde, hasta),
        label: desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} – ${fechaCorta(hasta)}`,
        desde,
        hasta,
        enCurso: hasta >= hoy,
      };
    }
    return resolverRango(RANGO_POR_DEFECTO, ahora);
  }

  const anio = ahora.getUTCFullYear();
  const mes = ahora.getUTCMonth();
  const label = RANGO_LABELS[id];
  const hoyFecha = dia(hoy);
  // Lunes = 0 … domingo = 6, como arranca la semana en Meta.
  const diaSemana = (hoyFecha.getUTCDay() + 6) % 7;

  switch (id) {
    case "hoy":
      return { id, label, desde: hoy, hasta: hoy, enCurso: true };
    case "ayer": {
      const ayer = iso(sumarDias(hoyFecha, -1));
      return { id, label, desde: ayer, hasta: ayer, enCurso: false };
    }
    case "hoy_ayer":
      return { id, label, desde: iso(sumarDias(hoyFecha, -1)), hasta: hoy, enCurso: true };
    case "esta_semana":
      return { id, label, desde: iso(sumarDias(hoyFecha, -diaSemana)), hasta: hoy, enCurso: true };
    case "semana_pasada": {
      // Semana cerrada: lunes a domingo anteriores, sin depender del día de hoy.
      const lunes = sumarDias(hoyFecha, -diaSemana - 7);
      return { id, label, desde: iso(lunes), hasta: iso(sumarDias(lunes, 6)), enCurso: false };
    }
    case "mes_anterior":
      // El único periodo mensual completamente cerrado: del día 1 al último
      // día del mes pasado, sin depender de en qué día de hoy se mire.
      return {
        id,
        label,
        desde: iso(new Date(Date.UTC(anio, mes - 1, 1))),
        hasta: iso(new Date(Date.UTC(anio, mes, 0))),
        enCurso: false,
      };
    case "anio_actual":
      return { id, label, desde: iso(new Date(Date.UTC(anio, 0, 1))), hasta: hoy, enCurso: true };
    case "ultimos_7":
    case "ultimos_14":
    case "ultimos_28":
    case "ultimos_30":
    case "ultimos_90": {
      // La ventana incluye hoy, así que se restan ventana − 1 días. Restar la
      // ventana completa daría 8, 31 o 91 días.
      const ventana = Number(id.split("_")[1]);
      return { id, label, desde: iso(sumarDias(hoyFecha, -(ventana - 1))), hasta: hoy, enCurso: true };
    }
    default:
      return {
        id: "mes_actual",
        label: RANGO_LABELS.mes_actual,
        desde: iso(new Date(Date.UTC(anio, mes, 1))),
        hasta: hoy,
        enCurso: true,
      };
  }
}
