/**
 * Las fechas de Meta llegan con la hora de la cuenta y su desfase (`2026-10-31T23:59:00-0300`). En pantalla se muestra y se edita
 * esa hora de la cuenta tal cual, como en Ads Manager (con «GMT-3»), y al guardar se devuelve con el mismo desfase. Parte pura.
 */
export type PartesDeFechaMeta = {
  /** `aaaa-mm-ddThh:mm`, la hora de la cuenta, lista para un campo `datetime-local`. */
  local: string;
  /** Desfase original sin dos puntos, por ejemplo `-0300`. */
  offset: string;
  /** Como lo muestra Meta: `GMT-3`, `GMT+5:30`. */
  gmt: string;
};

export function partesDeFechaMeta(iso: string | null | undefined): PartesDeFechaMeta | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec((iso ?? "").trim());
  if (!m) return null;
  const crudo = m[3] ?? "Z";
  const offset = crudo === "Z" ? "+0000" : crudo.replace(":", "");
  const signo = offset[0];
  const horas = Number(offset.slice(1, 3));
  const minutos = offset.slice(3, 5);
  const gmt = `GMT${signo}${horas}${minutos !== "00" ? `:${minutos}` : ""}`;
  return { local: `${m[1]}T${m[2]}`, offset, gmt };
}

/** Lo que escribió la persona (hora de la cuenta) → el valor que espera Meta, con el desfase de la cuenta. */
export function aFechaDeMeta(local: string, offset: string): string {
  const base = local.length === 16 ? `${local}:00` : local;
  return `${base}${/^[+-]\d{4}$/.test(offset) ? offset : "+0000"}`;
}

export const ETIQUETA_DE_OBJETIVO_META: Record<string, string> = {
  OUTCOME_AWARENESS: "Reconocimiento",
  OUTCOME_TRAFFIC: "Tráfico",
  OUTCOME_ENGAGEMENT: "Interacción",
  OUTCOME_LEADS: "Clientes potenciales",
  OUTCOME_SALES: "Ventas",
  OUTCOME_APP_PROMOTION: "Promoción de la app",
};

/** Cómo llama Ads Manager a lo que se optimiza («Objetivo de rendimiento»). */
export const OBJETIVO_DE_RENDIMIENTO_META: Record<string, string> = {
  THRUPLAY: "Maximizar las reproducciones ThruPlay",
  REACH: "Maximizar el alcance de los anuncios",
  IMPRESSIONS: "Maximizar el número de impresiones",
  LINK_CLICKS: "Maximizar la cantidad de clics en el enlace",
  LANDING_PAGE_VIEWS: "Maximizar la cantidad de visitas a la página de destino",
  POST_ENGAGEMENT: "Maximizar la interacción con la publicación",
  PROFILE_AND_PAGE_ENGAGEMENT: "Maximizar las visitas al perfil o la página",
  LEAD_GENERATION: "Maximizar el número de clientes potenciales",
  OFFSITE_CONVERSIONS: "Maximizar el número de conversiones",
  CONVERSATIONS: "Maximizar el número de conversaciones",
  VIDEO_VIEWS: "Maximizar las reproducciones de video de 2 segundos",
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "Maximizar las reproducciones de video de 2 segundos",
  ENGAGED_USERS: "Maximizar las interacciones con la página",
};
