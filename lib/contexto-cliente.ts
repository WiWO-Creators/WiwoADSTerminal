/**
 * Contexto de un cliente para el asistente de IA: KPIs, comparación con el
 * periodo anterior y señales de recomendación, todo calculado por CÓDIGO.
 *
 * Existe para que el modelo no tenga que sacar cuentas ni decidir umbrales a
 * ojo: recibe cifras ya calculadas y una lista de señales con la evidencia
 * numérica que las respalda, y su trabajo es interpretarlas y explicarlas. Una
 * recomendación sin números detrás es lo que este módulo evita.
 *
 * Es puro (sin red ni base de datos): recibe las campañas ya leídas.
 */
import { moneda } from "./monedas";

/** Lo mínimo que se necesita de una campaña (compatible con `CampaignSummary`). */
export type CampanaBase = {
  provider: string;
  accountId: string;
  accountName: string;
  currency: string | null;
  name: string;
  campaignId: string | null;
  status: string | null;
  nativeObjective: string | null;
  objetivo?: string | null;
  spendMicros: number;
  impressions: number;
  clicks: number;
  reach: number | null;
  leads: number | null;
  purchases: number | null;
  conversions: number | null;
  conversionValueMicros: number | null;
  conActividad: boolean;
  dailyBudgetMicros: number | null;
};

export type Metas = {
  cpaMicros: number | null;
  roas: number | null;
  /** CPM objetivo. Sirve a los clientes de awareness, que no se juzgan por CPA. */
  cpmMicros?: number | null;
  /** CTR mínimo esperado, como fracción (0,015 = 1,5 %). */
  ctrMinimo?: number | null;
  /** Frecuencia máxima tolerada. Sin ella se usa `UMBRALES.FRECUENCIA_ALTA`. */
  frecuenciaMaxima?: number | null;
};

export type Severidad = "alta" | "media" | "oportunidad" | "info";

export type Senal = {
  tipo: string;
  severidad: Severidad;
  /** Frase con las cifras que la respaldan: es lo que el modelo debe citar. */
  evidencia: string;
};

/** Umbrales. Están acá, con nombre, para poder discutirlos y probarlos. */
export const UMBRALES = {
  /** CPA por sobre la meta: mismo criterio que las alertas (`lib/reglas.ts`). */
  CPA_SOBRE_META: 1.4,
  CPA_BAJO_META: 0.8,
  /** Resultados mínimos para que un CPA diga algo y no sea ruido. */
  RESULTADOS_MINIMOS: 3,
  RESULTADOS_MINIMOS_ESCALAR: 5,
  DESPERDICIO_X_CPA: 2,
  FRECUENCIA_ALTA: 3.5,
  IMPRESIONES_MINIMAS_FRECUENCIA: 5000,
  /** CTR por debajo de esta fracción del CTR típico de su plataforma. */
  CTR_FRACCION_BAJA: 0.5,
  IMPRESIONES_MINIMAS_CTR: 1000,
  COMPARABLES_MINIMOS_CTR: 3,
  /** Cambio relativo del CPA entre periodos que ya se considera una tendencia. */
  TENDENCIA_CPA: 0.25,
  /** Caída de resultados con gasto parecido. */
  CAIDA_RESULTADOS: 0.6,
  GASTO_PARECIDO: 0.25,
  ROAS_BAJO_META: 0.8,
  ROAS_SOBRE_META: 1.2,
  /** CPM por sobre la meta a partir del cual se avisa. */
  CPM_SOBRE_META: 1.3,
  IMPRESIONES_MINIMAS_CPM: 5000,
} as const;

/**
 * ¿Esta campaña se juzga por conversiones? Solo las de leads, ventas y otras
 * conversiones. Awareness (AE) y tráfico (TRF) se miden por alcance, CPM,
 * frecuencia o clics: un "0 resultados" en una campaña de awareness no es un
 * mal rendimiento, y juzgarla contra una meta de CPA sería un falso positivo.
 * Sin objetivo conocido tampoco se opina: no se adivina.
 */
export function seMidePorResultados(objetivo: string | null | undefined): boolean {
  return objetivo === "LDS" || objetivo === "VTA" || objetivo === "OCV";
}

export function comoSeMide(objetivo: string | null | undefined): string {
  switch (objetivo) {
    case "AE": return "alcance, CPM, frecuencia e interacciones (no por conversiones)";
    case "TRF": return "clics, CPC, CTR y visitas a la página (no por conversiones)";
    case "LDS": return "leads y costo por lead";
    case "VTA": return "compras, costo por compra y ROAS";
    case "OCV": return "conversiones y costo por conversión";
    default: return "objetivo sin clasificar: no se puede juzgar por resultados";
  }
}

export function resultadosDe(c: Pick<CampanaBase, "leads" | "purchases" | "conversions">): number | null {
  return c.leads ?? c.purchases ?? c.conversions ?? null;
}

export type Kpis = {
  resultados: number | null;
  cpaMicros: number | null;
  cpmMicros: number | null;
  cpcMicros: number | null;
  ctr: number | null;
  frecuencia: number | null;
  roas: number | null;
};

export function calcularKpis(c: CampanaBase): Kpis {
  const resultados = resultadosDe(c);
  return {
    resultados,
    cpaMicros: resultados && resultados > 0 ? c.spendMicros / resultados : null,
    cpmMicros: c.impressions > 0 ? (c.spendMicros / c.impressions) * 1000 : null,
    cpcMicros: c.clicks > 0 ? c.spendMicros / c.clicks : null,
    ctr: c.impressions > 0 ? c.clicks / c.impressions : null,
    frecuencia: c.reach && c.reach > 0 ? c.impressions / c.reach : null,
    roas:
      c.conversionValueMicros !== null && c.conversionValueMicros > 0 && c.spendMicros > 0
        ? c.conversionValueMicros / c.spendMicros
        : null,
  };
}

const activa = (estado: string | null) => estado === "ENABLED" || estado === "ACTIVE";

export function claveDeCampana(c: Pick<CampanaBase, "provider" | "accountId" | "campaignId" | "name">): string {
  return `${c.provider}:${c.accountId}:${c.campaignId ?? c.name}`;
}

/** Variación relativa, o `null` si el periodo base no permite una comparación honesta. */
export function variacion(actual: number | null, previo: number | null): number | null {
  if (actual === null || previo === null || previo <= 0) return null;
  return (actual - previo) / previo;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[m] : (orden[m - 1] + orden[m]) / 2;
}

/**
 * Señales de UNA campaña. `ctrTipico` es la mediana de las de su plataforma
 * (o `null` si hay pocas para comparar); `previa` es la misma campaña en el
 * periodo anterior, si existe.
 */
export function senalesDeCampana(
  c: CampanaBase,
  previa: CampanaBase | null,
  metas: Metas,
  ctrTipico: number | null,
): Senal[] {
  const senales: Senal[] = [];
  if (!activa(c.status)) return senales;
  const money = (micros: number) => moneda(micros, c.currency);

  if (!c.conActividad) {
    senales.push({
      tipo: "sin_actividad",
      severidad: "media",
      evidencia: "Está activa pero no registró gasto ni impresiones en el periodo: puede estar sin presupuesto, rechazada o mal segmentada. No es un cero de rendimiento, es ausencia de datos.",
    });
    return senales;
  }

  const k = calcularKpis(c);
  const R = UMBRALES.RESULTADOS_MINIMOS;
  const porResultados = seMidePorResultados(c.objetivo);

  if (metas.cpaMicros && porResultados) {
    if (c.spendMicros >= UMBRALES.DESPERDICIO_X_CPA * metas.cpaMicros && (k.resultados ?? 0) === 0) {
      senales.push({
        tipo: "gasto_sin_resultados",
        severidad: "alta",
        evidencia: `Gastó ${money(c.spendMicros)} sin ningún resultado, más del doble de la meta de CPA (${money(metas.cpaMicros)}).`,
      });
    } else if (k.cpaMicros !== null && (k.resultados ?? 0) >= R) {
      if (k.cpaMicros > UMBRALES.CPA_SOBRE_META * metas.cpaMicros) {
        senales.push({
          tipo: "cpa_sobre_meta",
          severidad: "alta",
          evidencia: `CPA de ${money(k.cpaMicros)}, ${pct(k.cpaMicros / metas.cpaMicros - 1)} sobre la meta de ${money(metas.cpaMicros)}, con ${k.resultados} resultados.`,
        });
      } else if (
        k.cpaMicros <= UMBRALES.CPA_BAJO_META * metas.cpaMicros &&
        (k.resultados ?? 0) >= UMBRALES.RESULTADOS_MINIMOS_ESCALAR
      ) {
        senales.push({
          tipo: "cpa_bajo_meta",
          severidad: "oportunidad",
          evidencia: `CPA de ${money(k.cpaMicros)}, ${pct(k.cpaMicros / metas.cpaMicros - 1)} respecto de la meta de ${money(metas.cpaMicros)}, con ${k.resultados} resultados: hay margen para escalar el presupuesto.`,
        });
      }
    }
  }

  if (metas.roas && porResultados && k.roas !== null && c.spendMicros > 0) {
    if (k.roas < UMBRALES.ROAS_BAJO_META * metas.roas) {
      senales.push({
        tipo: "roas_bajo_meta",
        severidad: "alta",
        evidencia: `ROAS de ${k.roas.toFixed(2)}, por debajo de la meta de ${metas.roas} (gastó ${money(c.spendMicros)}).`,
      });
    } else if (k.roas >= UMBRALES.ROAS_SOBRE_META * metas.roas) {
      senales.push({
        tipo: "roas_sobre_meta",
        severidad: "oportunidad",
        evidencia: `ROAS de ${k.roas.toFixed(2)}, sobre la meta de ${metas.roas}: candidata a escalar.`,
      });
    }
  }

  // La meta del cliente manda; sin ella, el umbral general.
  const frecuenciaLimite = metas.frecuenciaMaxima ?? UMBRALES.FRECUENCIA_ALTA;
  if (k.frecuencia !== null && k.frecuencia >= frecuenciaLimite && c.impressions >= UMBRALES.IMPRESIONES_MINIMAS_FRECUENCIA) {
    senales.push({
      tipo: "frecuencia_alta",
      severidad: "media",
      evidencia: `Frecuencia de ${k.frecuencia.toFixed(1)}, ${metas.frecuenciaMaxima ? `sobre el máximo de ${metas.frecuenciaMaxima} que definió este cliente` : "alta"} (cada persona vio el anuncio ${k.frecuencia.toFixed(1)} veces en promedio, con ${c.impressions.toLocaleString("es-CL")} impresiones): posible fatiga del creativo o audiencia chica.`,
    });
  }

  if (
    metas.cpmMicros && k.cpmMicros !== null &&
    c.impressions >= UMBRALES.IMPRESIONES_MINIMAS_CPM &&
    k.cpmMicros > UMBRALES.CPM_SOBRE_META * metas.cpmMicros
  ) {
    senales.push({
      tipo: "cpm_sobre_meta",
      severidad: "media",
      evidencia: `CPM de ${money(k.cpmMicros)}, ${pct(k.cpmMicros / metas.cpmMicros - 1)} sobre la meta de ${money(metas.cpmMicros)}, con ${c.impressions.toLocaleString("es-CL")} impresiones: el alcance está saliendo más caro de lo acordado.`,
    });
  }

  // Con un CTR mínimo definido por el cliente, ese manda sobre la comparación
  // relativa (que solo dice "peor que el resto", no "peor de lo acordado").
  const ctrMetaFallida = Boolean(
    metas.ctrMinimo && k.ctr !== null && c.impressions >= UMBRALES.IMPRESIONES_MINIMAS_CTR && k.ctr < metas.ctrMinimo,
  );
  if (ctrMetaFallida) {
    senales.push({
      tipo: "ctr_bajo_meta",
      severidad: "media",
      evidencia: `CTR de ${(k.ctr! * 100).toFixed(2)}%, bajo el mínimo de ${(metas.ctrMinimo! * 100).toFixed(2)}% que definió este cliente, con ${c.impressions.toLocaleString("es-CL")} impresiones.`,
    });
  }

  if (
    !ctrMetaFallida &&
    ctrTipico !== null && k.ctr !== null &&
    c.impressions >= UMBRALES.IMPRESIONES_MINIMAS_CTR &&
    k.ctr < UMBRALES.CTR_FRACCION_BAJA * ctrTipico
  ) {
    senales.push({
      tipo: "ctr_bajo",
      severidad: "media",
      evidencia: `CTR de ${(k.ctr * 100).toFixed(2)}%, menos de la mitad del típico de ${c.provider === "google" ? "Google" : "Meta"} en este cliente (${(ctrTipico * 100).toFixed(2)}%), con ${c.impressions.toLocaleString("es-CL")} impresiones: el anuncio o la segmentación no están atrayendo clics.`,
    });
  }

  if (previa && previa.conActividad) {
    const kp = calcularKpis(previa);
    const dCpa = variacion(k.cpaMicros, kp.cpaMicros);
    const suficientes = (k.resultados ?? 0) >= R && (kp.resultados ?? 0) >= R;
    if (porResultados && dCpa !== null && suficientes && Math.abs(dCpa) >= UMBRALES.TENDENCIA_CPA) {
      senales.push({
        tipo: dCpa > 0 ? "cpa_empeora" : "cpa_mejora",
        severidad: dCpa > 0 ? "media" : "info",
        evidencia: `El CPA pasó de ${money(kp.cpaMicros!)} a ${money(k.cpaMicros!)} (${pct(dCpa)}) frente al periodo anterior.`,
      });
    }
    const dGasto = variacion(c.spendMicros, previa.spendMicros);
    const dRes = variacion(k.resultados, kp.resultados);
    if (
      porResultados && dRes !== null && dGasto !== null &&
      (kp.resultados ?? 0) >= UMBRALES.RESULTADOS_MINIMOS_ESCALAR &&
      Math.abs(dGasto) <= UMBRALES.GASTO_PARECIDO &&
      (k.resultados ?? 0) < UMBRALES.CAIDA_RESULTADOS * (kp.resultados ?? 0)
    ) {
      senales.push({
        tipo: "resultados_caen",
        severidad: "alta",
        evidencia: `Los resultados cayeron de ${kp.resultados} a ${k.resultados} (${pct(dRes)}) con un gasto parecido (${pct(dGasto)}): algo cambió en la entrega o en el creativo.`,
      });
    }
  }
  return senales;
}

/** CTR típico por plataforma: mediana entre campañas con volumen suficiente. */
export function ctrTipicoPorPlataforma(campanas: CampanaBase[]): Map<string, number> {
  const porPlataforma = new Map<string, number[]>();
  for (const c of campanas) {
    if (!c.conActividad || c.impressions < UMBRALES.IMPRESIONES_MINIMAS_CTR) continue;
    const ctr = c.clicks / c.impressions;
    porPlataforma.set(c.provider, [...(porPlataforma.get(c.provider) ?? []), ctr]);
  }
  const tipico = new Map<string, number>();
  for (const [plataforma, valores] of porPlataforma) {
    if (valores.length >= UMBRALES.COMPARABLES_MINIMOS_CTR) tipico.set(plataforma, mediana(valores));
  }
  return tipico;
}

export type PeriodoInfo = { label: string; desde: string; hasta: string; enCurso: boolean };

export type EntradaResumen = {
  clienteNombre: string;
  actuales: CampanaBase[];
  previas: CampanaBase[] | null;
  metas: Metas;
  /** Qué se mira primero en este cliente, si se definió. */
  kpiPrincipal?: { etiqueta: string; comoSeMide: string } | null;
  periodo: PeriodoInfo;
  periodoPrevio: PeriodoInfo | null;
  alertas: Array<{ severidad: string; campana: string; plataforma: string; diagnostico: string }>;
  /** Cuántas campañas listar en detalle (las de mayor gasto). */
  limite?: number;
};

const ORDEN: Record<Severidad, number> = { alta: 0, media: 1, oportunidad: 2, info: 3 };

export function resumenDeCliente(e: EntradaResumen) {
  const limite = Math.min(Math.max(e.limite ?? 12, 1), 30);
  const previasPorClave = new Map((e.previas ?? []).map((c) => [claveDeCampana(c), c]));
  const ctrTipico = ctrTipicoPorPlataforma(e.actuales);

  const filas = e.actuales.map((c) => {
    const previa = previasPorClave.get(claveDeCampana(c)) ?? null;
    const k = calcularKpis(c);
    const kp = previa ? calcularKpis(previa) : null;
    const senales = senalesDeCampana(c, previa, e.metas, ctrTipico.get(c.provider) ?? null);
    return {
      c,
      k,
      fila: {
        campana_id: c.campaignId,
        cuenta_id: c.accountId,
        plataforma: c.provider,
        nombre: c.name,
        estado: c.status,
        objetivo: c.objetivo ?? c.nativeObjective,
        como_se_mide: comoSeMide(c.objetivo),
        gasto: moneda(c.spendMicros, c.currency),
        // Awareness y tráfico no se juzgan por conversiones: se omiten para que
        // un cero no se lea como mal rendimiento.
        resultados: seMidePorResultados(c.objetivo) ? k.resultados : null,
        costo_por_resultado: seMidePorResultados(c.objetivo) && k.cpaMicros !== null ? moneda(k.cpaMicros, c.currency) : null,
        cpm: k.cpmMicros !== null ? moneda(k.cpmMicros, c.currency) : null,
        cpc: k.cpcMicros !== null ? moneda(k.cpcMicros, c.currency) : null,
        ctr_pct: k.ctr !== null ? Math.round(k.ctr * 10000) / 100 : null,
        frecuencia: k.frecuencia !== null ? Math.round(k.frecuencia * 10) / 10 : null,
        roas: k.roas !== null ? Math.round(k.roas * 100) / 100 : null,
        presupuesto_diario: c.dailyBudgetMicros ? moneda(c.dailyBudgetMicros, c.currency) : null,
        con_actividad: c.conActividad,
        vs_periodo_anterior: previa && previa.conActividad
          ? {
              gasto: variacion(c.spendMicros, previa.spendMicros) !== null ? pct(variacion(c.spendMicros, previa.spendMicros)!) : null,
              resultados: variacion(k.resultados, kp!.resultados) !== null ? pct(variacion(k.resultados, kp!.resultados)!) : null,
              costo_por_resultado: variacion(k.cpaMicros, kp!.cpaMicros) !== null ? pct(variacion(k.cpaMicros, kp!.cpaMicros)!) : null,
            }
          : null,
        senales,
      },
    };
  });

  // Cada moneda por separado: nunca se suma CLP con USD.
  const porMoneda = new Map<string, { gasto: number; previo: number }>();
  for (const c of e.actuales) {
    const m = c.currency ?? "—";
    porMoneda.set(m, { gasto: (porMoneda.get(m)?.gasto ?? 0) + c.spendMicros, previo: porMoneda.get(m)?.previo ?? 0 });
  }
  for (const c of e.previas ?? []) {
    const m = c.currency ?? "—";
    const actual = porMoneda.get(m) ?? { gasto: 0, previo: 0 };
    porMoneda.set(m, { ...actual, previo: actual.previo + c.spendMicros });
  }

  const todasLasSenales = filas
    .flatMap(({ c, fila }) => fila.senales.map((s) => ({ campana: c.name, plataforma: c.provider, ...s })))
    .sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad]);

  return {
    cliente: e.clienteNombre,
    periodo: e.periodo,
    periodo_anterior: e.periodoPrevio,
    aviso_periodo: e.periodo.enCurso
      ? "El periodo actual está en curso: sus cifras van a seguir subiendo. La comparación usa un periodo anterior del mismo largo, no un mes completo contra uno a medias."
      : null,
    kpi_principal: e.kpiPrincipal
      ? { nombre: e.kpiPrincipal.etiqueta, se_mide_por: e.kpiPrincipal.comoSeMide }
      : null,
    metas: {
      costo_por_resultado: e.metas.cpaMicros !== null ? moneda(e.metas.cpaMicros, e.actuales[0]?.currency ?? null) : null,
      roas: e.metas.roas,
      cpm: e.metas.cpmMicros ? moneda(e.metas.cpmMicros, e.actuales[0]?.currency ?? null) : null,
      ctr_minimo_pct: e.metas.ctrMinimo ? Math.round(e.metas.ctrMinimo * 10000) / 100 : null,
      frecuencia_maxima: e.metas.frecuenciaMaxima ?? null,
      nota:
        !e.metas.cpaMicros && !e.metas.roas && !e.metas.cpmMicros && !e.metas.ctrMinimo && !e.metas.frecuenciaMaxima
          ? "Este cliente no tiene metas cargadas (ni de CPA, ROAS, CPM, CTR ni frecuencia): las señales contra meta no se pueden calcular. Se puede recomendar cargarlas en la ficha del cliente."
          : e.kpiPrincipal
            ? null
            : "Este cliente no tiene definido su KPI principal: conviene definirlo en la ficha para saber qué mirar primero.",
    },
    gasto_por_moneda: [...porMoneda].map(([m, v]) => ({
      moneda: m,
      gasto: moneda(v.gasto, m === "—" ? null : m),
      gasto_periodo_anterior: e.previas ? moneda(v.previo, m === "—" ? null : m) : null,
      variacion: e.previas && v.previo > 0 ? pct((v.gasto - v.previo) / v.previo) : null,
    })),
    campanas_activas: e.actuales.filter((c) => activa(c.status)).length,
    campanas_activas_sin_actividad: e.actuales.filter((c) => activa(c.status) && !c.conActividad).length,
    campanas: filas
      .sort((a, b) => b.c.spendMicros - a.c.spendMicros)
      .slice(0, limite)
      .map((x) => x.fila),
    campanas_no_listadas: Math.max(0, filas.length - limite),
    senales: todasLasSenales.slice(0, 25),
    alertas_del_sistema: e.alertas.slice(0, 10),
  };
}
