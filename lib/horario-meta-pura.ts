/**
 * Horario de entrega de un conjunto de Meta (dayparting): en qué días y horas se muestran los anuncios.
 * Meta solo lo admite con presupuesto TOTAL (no diario) y con fecha de término. Parte pura, sin red.
 */
export type TramoDeHorario = {
  /** 0 = domingo … 6 = sábado. */
  dias: number[];
  /** Hora de inicio, 0 a 23. */
  desde: number;
  /** Hora de término, 1 a 24 (exclusiva). */
  hasta: number;
};

export const DIAS_DE_LA_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** Problemas de un horario pedido (vacío = es válido). Una lista vacía de tramos significa «todo el día». */
export function problemasDeHorario(tramos: TramoDeHorario[]): string[] {
  const problemas: string[] = [];
  tramos.forEach((t, i) => {
    const n = i + 1;
    if (!Array.isArray(t.dias) || t.dias.length === 0 || t.dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      problemas.push(`Tramo ${n}: los días van de 0 (domingo) a 6 (sábado).`);
    }
    if (!Number.isInteger(t.desde) || t.desde < 0 || t.desde > 23) problemas.push(`Tramo ${n}: la hora de inicio va de 0 a 23.`);
    if (!Number.isInteger(t.hasta) || t.hasta < 1 || t.hasta > 24) problemas.push(`Tramo ${n}: la hora de término va de 1 a 24.`);
    if (Number.isInteger(t.desde) && Number.isInteger(t.hasta) && t.desde >= t.hasta) problemas.push(`Tramo ${n}: el inicio debe ser antes del término.`);
  });
  return problemas;
}

/** El `adset_schedule` de Meta, con la zona horaria de la cuenta. */
export function horarioParaMeta(tramos: TramoDeHorario[]): Array<{ start_minute: number; end_minute: number; days: number[]; timezone_type: "ADVERTISER" }> {
  return tramos.map((t) => ({ start_minute: t.desde * 60, end_minute: t.hasta * 60, days: [...new Set(t.dias)].sort(), timezone_type: "ADVERTISER" as const }));
}

export function textoDeHorario(tramos: TramoDeHorario[]): string {
  if (tramos.length === 0) return "Todo el día";
  return tramos
    .map((t) => `${[...new Set(t.dias)].sort().map((d) => DIAS_DE_LA_SEMANA[d].slice(0, 3)).join(", ")} ${String(t.desde).padStart(2, "0")}:00–${String(t.hasta).padStart(2, "0")}:00`)
    .join(" · ");
}
