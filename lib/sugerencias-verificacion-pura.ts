/**
 * Verifica las decisiones de Meta contra lo que hay hoy en la plataforma: una decisión sobre una campaña que ya no existe,
 * o que ya está en otro estado, no se muestra (Windsor va horas atrás de lo que pasa en Meta). Parte pura, sin red.
 */
export type CampanaViva = { nombre: string | null; estado: string | null; /** Si gastó o tuvo impresiones en los últimos 30 días según Meta; `undefined`: no se leyó. */ conEntrega?: boolean; /** La campaña (o todos sus conjuntos) ya pasó su fecha de término. */ finalizada?: boolean };
/** Campañas vivas por cuenta de Meta (clave: id de cuenta sin `act_`); una cuenta ausente es «no se pudo leer». */
export type CampanasVivasPorCuenta = Map<string, Map<string, CampanaViva>>;

type Verificable = {
  provider: string | null;
  accountId: string | null;
  entityId: string | null;
  entityLevel: string | null;
  rule?: string | null;
  accion: { tipo: string };
};

export const idDeCuentaMeta = (accountId: string): string => accountId.trim().replace(/^act_/i, "");

/** Si la decisión sigue siendo cierta según lo que hay hoy en Meta. Sin lectura de la cuenta, se conserva. */
export function sigueVigente(s: Verificable, vivas: CampanasVivasPorCuenta): boolean {
  if (s.provider !== "meta" || s.entityLevel !== "campana" || !s.entityId || !s.accountId) return true;
  const cuenta = vivas.get(idDeCuentaMeta(s.accountId));
  if (!cuenta) return true;
  const campana = cuenta.get(s.entityId);
  if (!campana) return false;
  const activa = campana.estado === "ACTIVE";
  // «Activa pero no entrega»: si Meta muestra que sí entregó en el período, la decisión es falsa (Windsor iba atrás o la tenía con otro nombre).
  if (s.rule === "sin_actividad" && campana.conEntrega === true) return false;
  // Una campaña cuyo período terminó no se propone reactivar: se queda apagada.
  if (s.accion.tipo === "reactivar" && campana.finalizada === true) return false;
  return s.accion.tipo === "reactivar" ? !activa && campana.estado !== "DELETED" && campana.estado !== "ARCHIVED" : activa;
}

export function soloVigentes<T extends Verificable>(candidatas: T[], vivas: CampanasVivasPorCuenta): T[] {
  return candidatas.filter((s) => sigueVigente(s, vivas));
}
