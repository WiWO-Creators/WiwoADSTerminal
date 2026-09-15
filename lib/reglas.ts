import type { Decision } from "@/app/data";
import { platformLabel } from "@/lib/plataformas";
import type { Portfolio } from "@/lib/portafolios-store";
import type { WindsorCampaign } from "@/lib/windsor";

/**
 * Motor de reglas — fase de recomendación.
 *
 * Genera candidatos a `decisions`, nunca ejecuta nada: cada uno nace con
 * `autonomy: "N0"` y espera a que una persona firme. Nada de esto toca
 * Windsor ni ninguna plataforma; solo lee métricas ya obtenidas y compara
 * contra la meta que el equipo cargó para ese cliente.
 *
 * Reglas tomadas del documento de arquitectura que trajo el equipo, con dos
 * adaptaciones deliberadas a como funciona hoy este sistema:
 *
 *  - Sin una `targetCpaMicros`/`targetRoas` explícita en el cliente, ninguna
 *    regla se evalúa para él. El motor nunca inventa un umbral.
 *  - Las reglas de presupuesto (escalar/reducir) necesitan el presupuesto
 *    diario actual de la campaña. Meta no lo expone cuando la campaña usa
 *    presupuesto compartido (Advantage Campaign Budget) — esas campañas
 *    simplemente no generan esa recomendación, no se calcula a ciegas.
 */

const AGENTE = "Motor de reglas";
const VENCE_EN_MS = 72 * 60 * 60 * 1000;

export type CandidatoDecision = Omit<
  Decision,
  "age" | "expires" | "version" | "owner" | "autonomy" | "agent"
> & {
  /** Determinístico por regla+campaña+día: repetir la evaluación el mismo
   * día no duplica la recomendación; un día nuevo sí puede generar otra si
   * el problema sigue. */
  id: string;
  generatedAt: number;
  expiresAt: number;
};

/**
 * Ventana de 7 días terminada 2 días atrás.
 *
 * El rezago de reporte de conversiones de Meta y Google hace que los últimos
 * uno o dos días subestimen conversiones reales — decidir presupuesto sobre
 * eso lee una caída que en realidad todavía no terminó de reportarse.
 */
export function rangoL7DConRezago(ahora: Date): { desde: string; hasta: string } {
  const hasta = new Date(ahora);
  hasta.setUTCDate(hasta.getUTCDate() - 2);
  const desde = new Date(hasta);
  desde.setUTCDate(desde.getUTCDate() - 6);
  return { desde: iso(desde), hasta: iso(hasta) };
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function activa(status: string | null): boolean {
  const valor = (status ?? "").toUpperCase();
  return valor === "ENABLED" || valor === "ACTIVE";
}

function moneda(valorMicros: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: currency ?? "CLP",
      maximumFractionDigits: 0,
    }).format(valorMicros / 1_000_000);
  } catch {
    // Un código de moneda que Intl no reconoce no debe tumbar la evaluación.
    return `${(valorMicros / 1_000_000).toLocaleString("es-CL")} ${currency ?? ""}`;
  }
}

/**
 * Las conversiones pueden venir fraccionadas (modelos de atribución que
 * reparten una conversión entre varios puntos de contacto) — mostrar
 * "12.9983" en una recomendación se lee como un error, no como precisión.
 */
function formatConversiones(valor: number): string {
  return valor % 1 === 0
    ? String(valor)
    : valor.toLocaleString("es-CL", { maximumFractionDigits: 1 });
}

function clave(campana: WindsorCampaign): string {
  return `${campana.provider}:${campana.accountId}:${campana.campaignId ?? campana.name}`;
}

export function evaluarReglas(
  portfolios: Portfolio[],
  campanas: WindsorCampaign[],
  ahora: Date,
): CandidatoDecision[] {
  const dia = iso(ahora);
  const generatedAt = ahora.getTime();
  const expiresAt = generatedAt + VENCE_EN_MS;
  const candidatos: CandidatoDecision[] = [];

  const portfolioPorCuenta = new Map<string, Portfolio>();
  for (const p of portfolios) {
    if (p.targetCpaMicros === null && p.targetRoas === null) continue;
    for (const accId of p.accountIds) portfolioPorCuenta.set(accId, p);
  }

  for (const campana of campanas) {
    if (!campana.conActividad || !activa(campana.status)) continue;
    const portfolio = portfolioPorCuenta.get(campana.accountId);
    if (!portfolio) continue;

    const spend = campana.spendMicros;
    const conversions = campana.conversions ?? 0;
    const valor = campana.conversionValueMicros ?? 0;
    const plataforma = platformLabel(campana.provider);
    const base = clave(campana);

    // Regla 1: kill switch por desperdicio — gastó el doble de la meta de
    // CPA sin ninguna conversión.
    if (
      portfolio.targetCpaMicros !== null &&
      spend > 0 &&
      spend >= 2 * portfolio.targetCpaMicros &&
      conversions === 0
    ) {
      candidatos.push({
        id: `waste-${base}-${dia}`,
        severity: "critical",
        client: portfolio.name,
        platform: plataforma,
        title: `"${campana.name}" gastó sin ninguna conversión`,
        diagnosis: `Gastó ${moneda(spend, campana.currency)} en los últimos 7 días (excluyendo los 2 más recientes, por el rezago de atribución) sin registrar ninguna conversión — el doble de la meta de CPA de ${portfolio.name} (${moneda(portfolio.targetCpaMicros, campana.currency)}) sin ningún resultado.`,
        proposedAction: `Pausar "${campana.name}" hasta revisar la segmentación o la pieza. Antes de pausar, confirma que el cliente no quede sin ninguna campaña activa.`,
        impact: `Detiene ${moneda(spend, campana.currency)} de gasto semanal sin retorno`,
        confidence: "Alta",
        rule: "kill_switch_desperdicio",
        before: "Activa",
        after: "Pausada",
        guardrail: "Revisar que no sea la única campaña activa del cliente antes de pausar",
        metric: "Gasto de 7 días sin conversión",
        delta: `${moneda(spend, campana.currency)} · 0 conversiones`,
        primaryLabel: "Pausar",
        generatedAt,
        expiresAt,
      });
      // Ya se recomienda pausar por desperdicio total: no hace falta además
      // decir que el ROAS está bajo — es la misma campaña, el mismo problema.
      continue;
    }

    // Regla 2: degradación de eficiencia — con volumen suficiente para
    // confiar en el número (3+ conversiones), el CPA real ya es 40% peor
    // que la meta.
    if (portfolio.targetCpaMicros !== null && conversions >= 3) {
      const cpaReal = spend / conversions;
      if (cpaReal > 1.4 * portfolio.targetCpaMicros) {
        candidatos.push({
          id: `degradacion-${base}-${dia}`,
          severity: "high",
          client: portfolio.name,
          platform: plataforma,
          title: `"${campana.name}" está pagando de más por resultado`,
          diagnosis: `CPA real de ${moneda(cpaReal, campana.currency)} en los últimos 7 días (excluyendo los 2 más recientes), un ${Math.round((cpaReal / portfolio.targetCpaMicros - 1) * 100)}% sobre la meta de ${moneda(portfolio.targetCpaMicros, campana.currency)}, con ${formatConversiones(conversions)} conversiones — volumen suficiente para confiar en el número.`,
          proposedAction: `Pausar "${campana.name}" o revisar su segmentación y piezas antes de seguir invirtiendo al ritmo actual.`,
          impact: `Evita seguir pagando ${moneda(cpaReal - portfolio.targetCpaMicros, campana.currency)} de más por cada conversión`,
          confidence: "Alta",
          rule: "degradacion_eficiencia",
          before: `${moneda(portfolio.targetCpaMicros, campana.currency)} (meta)`,
          after: `${moneda(cpaReal, campana.currency)} (real)`,
          guardrail: "Revisar que no sea la única campaña activa del cliente antes de pausar",
          metric: "CPA real vs. meta",
          delta: `+${Math.round((cpaReal / portfolio.targetCpaMicros - 1) * 100)}%`,
          primaryLabel: "Revisar",
          generatedAt,
          expiresAt,
        });
      }
    }

    // Reglas 3 y 4 necesitan el presupuesto diario actual — sin él (Meta con
    // presupuesto de campaña compartido) no hay a partir de qué calcular un
    // presupuesto nuevo.
    if (
      portfolio.targetRoas !== null &&
      spend > 0 &&
      conversions >= 1 &&
      // Distinto de solo "!== null": un presupuesto en 0 no tiene de qué
      // bajar el 15% — antes eso generaba la recomendación sin sentido
      // "bajar presupuesto de $0 a $0".
      campana.dailyBudgetMicros !== null &&
      campana.dailyBudgetMicros > 0
    ) {
      const roasReal = valor / spend;
      const presupuestoActual = campana.dailyBudgetMicros;

      // Regla 3: escalar — el ROAS real supera la meta con margen sostenido.
      if (roasReal >= 1.2 * portfolio.targetRoas) {
        const presupuestoNuevo = Math.round(presupuestoActual * 1.2);
        candidatos.push({
          id: `escalar-${base}-${dia}`,
          severity: "info",
          client: portfolio.name,
          platform: plataforma,
          title: `"${campana.name}" rinde por sobre la meta — subir presupuesto`,
          diagnosis: `ROAS real de ${roasReal.toFixed(2)}x en los últimos 7 días (excluyendo los 2 más recientes), sobre la meta de ${portfolio.targetRoas.toFixed(2)}x, con ${formatConversiones(conversions)} conversiones.`,
          proposedAction: `Subir el presupuesto diario de "${campana.name}" de ${moneda(presupuestoActual, campana.currency)} a ${moneda(presupuestoNuevo, campana.currency)} (+20%).`,
          impact: `Más inversión en la campaña con mejor retorno del cliente`,
          confidence: "Media",
          rule: "escalar_presupuesto",
          before: moneda(presupuestoActual, campana.currency),
          after: moneda(presupuestoNuevo, campana.currency),
          guardrail: "Nunca subir o bajar el presupuesto de una misma campaña más de una vez cada 48 horas",
          metric: "ROAS real vs. meta",
          delta: `${roasReal.toFixed(2)}x vs. meta ${portfolio.targetRoas.toFixed(2)}x`,
          primaryLabel: "Subir presupuesto",
          generatedAt,
          expiresAt,
        });
      } else if (roasReal < 0.75 * portfolio.targetRoas) {
        // Regla 4: reducir — el ROAS real cae bajo el 75% de la meta.
        const presupuestoNuevo = Math.round(presupuestoActual * 0.85);
        candidatos.push({
          id: `reducir-${base}-${dia}`,
          severity: "high",
          client: portfolio.name,
          platform: plataforma,
          title: `"${campana.name}" rinde bajo la meta — bajar presupuesto`,
          diagnosis: `ROAS real de ${roasReal.toFixed(2)}x en los últimos 7 días (excluyendo los 2 más recientes), bajo el 75% de la meta de ${portfolio.targetRoas.toFixed(2)}x, con ${formatConversiones(conversions)} conversiones.`,
          proposedAction: `Bajar el presupuesto diario de "${campana.name}" de ${moneda(presupuestoActual, campana.currency)} a ${moneda(presupuestoNuevo, campana.currency)} (-15%) mientras se revisa.`,
          impact: `Reduce la exposición mientras se corrige el rendimiento`,
          confidence: "Media",
          rule: "reducir_presupuesto",
          before: moneda(presupuestoActual, campana.currency),
          after: moneda(presupuestoNuevo, campana.currency),
          guardrail: "Nunca subir o bajar el presupuesto de una misma campaña más de una vez cada 48 horas",
          metric: "ROAS real vs. meta",
          delta: `${roasReal.toFixed(2)}x vs. meta ${portfolio.targetRoas.toFixed(2)}x`,
          primaryLabel: "Bajar presupuesto",
          generatedAt,
          expiresAt,
        });
      }
    }
  }

  return candidatos;
}

export { AGENTE };
