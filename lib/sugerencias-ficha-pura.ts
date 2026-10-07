import { semanaDe, VENCE_EN_MS, type AccionSugerida, type Sugerencia, type SeveridadSugerencia } from "@/lib/sugerencias";

/**
 * Decisiones sobre la ficha del cliente: datos que faltan y que impiden evaluar, boostear o medir bien. Salen solo de lo que la
 * ficha tiene (o no tiene), nunca de supuestos sobre el rendimiento. Las de medición llevan el prefijo `medicion_`, así que
 * solo las ven Directores y Admins. Parte pura, sin base de datos.
 */
export type EntradaDeFicha = {
  cliente: { id: string; nombre: string };
  tieneMeta: boolean;
  pageId: string | null;
  instagramId: string | null;
  kpiPrincipal: string | null;
  presupuestoMensual: boolean;
  metaDeCpaORoas: boolean;
  ga4: boolean;
  gtmEstado: string | null;
};

type Hueco = {
  rule: string;
  severity: SeveridadSugerencia;
  plataforma: string;
  title: string;
  diagnosis: string;
  proposedAction: string;
  impact: string;
  before: string;
  after: string;
  metric: string;
};

const DONDE = "Cliente → Ficha del cliente (la completa un administrador).";

function huecosDe(e: EntradaDeFicha): Hueco[] {
  const h: Hueco[] = [];
  if (!e.presupuestoMensual) {
    h.push({
      rule: "ficha_sin_presupuesto",
      severity: "medium",
      plataforma: "Cliente",
      title: "El cliente no tiene presupuesto mensual",
      diagnosis: "Sin presupuesto del mes no se puede saber si el gasto va bien ni avisar cuando se excede o queda corto.",
      proposedAction: `Registrar el presupuesto mensual acordado en ${DONDE}`,
      impact: "Activa las alertas de ritmo de gasto y la vista de Inversión.",
      before: "Sin presupuesto",
      after: "Presupuesto mensual definido",
      metric: "Ficha del cliente",
    });
  }
  if (!e.kpiPrincipal) {
    h.push({
      rule: "ficha_sin_kpi",
      severity: "medium",
      plataforma: "Cliente",
      title: "El cliente no tiene KPI principal",
      diagnosis: "Sin saber qué importa (leads, ventas, alcance…) las recomendaciones usan criterios genéricos.",
      proposedAction: `Elegir el KPI principal en ${DONDE}`,
      impact: "Las decisiones, alertas y la IA se ajustan a lo que este cliente busca.",
      before: "Sin KPI",
      after: "KPI principal definido",
      metric: "Ficha del cliente",
    });
  }
  if (!e.metaDeCpaORoas) {
    h.push({
      rule: "ficha_sin_metas",
      severity: "info",
      plataforma: "Cliente",
      title: "El cliente no tiene meta de CPA ni de ROAS",
      diagnosis: "Sin una meta no se puede decir si una campaña rinde bien o mal; solo se comparan entre sí.",
      proposedAction: `Registrar la meta de CPA o de ROAS en ${DONDE}`,
      impact: "Permite pausar o escalar con un criterio claro.",
      before: "Sin meta",
      after: "Meta definida",
      metric: "Ficha del cliente",
    });
  }
  if (e.tieneMeta && !e.pageId) {
    h.push({
      rule: "ficha_sin_pagina",
      severity: "high",
      plataforma: "Meta Ads",
      title: "Falta la Página de Facebook del cliente",
      diagnosis: "Sin Página no se pueden boostear publicaciones ni crear anuncios desde contenido existente.",
      proposedAction: `Declarar la Página de Facebook en ${DONDE}`,
      impact: "Habilita impulsar publicaciones y reutilizar contenido.",
      before: "Sin Página",
      after: "Página declarada",
      metric: "Ficha del cliente",
    });
  }
  if (e.tieneMeta && !e.instagramId) {
    h.push({
      rule: "ficha_sin_instagram",
      severity: "medium",
      plataforma: "Meta Ads",
      title: "Falta la cuenta de Instagram del cliente",
      diagnosis: "Sin Instagram declarado solo se ve el contenido de Facebook y no se pueden boostear sus publicaciones ni reels.",
      proposedAction: `Declarar la cuenta de Instagram en ${DONDE}`,
      impact: "Suma publicaciones y reels de Instagram al selector de contenido.",
      before: "Sin Instagram",
      after: "Instagram declarado",
      metric: "Ficha del cliente",
    });
  }
  if (!e.ga4) {
    h.push({
      rule: "medicion_ficha_ga4",
      severity: "medium",
      plataforma: "GA4",
      title: "El cliente no tiene propiedad de GA4 registrada",
      diagnosis: "Sin la propiedad de Google Analytics no se puede vigilar si los leads y las conversiones se miden bien.",
      proposedAction: `Registrar el ID de la propiedad de GA4 en ${DONDE}`,
      impact: "Activa la vigilancia de la salud de medición.",
      before: "Sin GA4",
      after: "GA4 registrado",
      metric: "Salud de medición",
    });
  }
  if (!e.gtmEstado) {
    h.push({
      rule: "medicion_ficha_gtm",
      severity: "info",
      plataforma: "GA4",
      title: "No se sabe si el cliente tiene Tag Manager",
      diagnosis: "Su estado de Google Tag Manager está «sin verificar», así que no se puede avisar si falta.",
      proposedAction: `Verificar si el sitio tiene GTM y marcarlo en ${DONDE}`,
      impact: "Permite alertar si las conversiones pueden estar mal medidas.",
      before: "Sin verificar",
      after: "GTM confirmado",
      metric: "Salud de medición",
    });
  }
  return h;
}

export function sugerenciasDeFicha(entradas: EntradaDeFicha[], ahora: Date): Sugerencia[] {
  const generatedAt = ahora.getTime();
  return entradas.flatMap((e) =>
    huecosDe(e).map((h) => ({
      id: `${h.rule}-${e.cliente.id}-${semanaDe(ahora)}`,
      rule: h.rule,
      severity: h.severity,
      portfolioId: e.cliente.id,
      client: e.cliente.nombre,
      platform: h.plataforma,
      provider: null,
      accountId: null,
      entityLevel: null,
      entityId: null,
      entityName: null,
      title: h.title,
      diagnosis: h.diagnosis,
      proposedAction: h.proposedAction,
      impact: h.impact,
      confidence: "Alta" as const,
      before: h.before,
      after: h.after,
      guardrail: "Es un dato de la ficha: no cambia nada en las plataformas.",
      metric: h.metric,
      delta: "—",
      primaryLabel: "Revisar",
      accion: { tipo: "revisar" } as AccionSugerida,
      generatedAt,
      expiresAt: generatedAt + VENCE_EN_MS,
    })),
  );
}
