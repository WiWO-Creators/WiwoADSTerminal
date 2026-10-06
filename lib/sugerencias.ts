/**
 * Sugerencias automáticas por cliente: convierte las señales de rendimiento de
 * cada campaña (`contexto-cliente.ts`) en recomendaciones concretas, con la
 * cifra que las respalda y, cuando corresponde, el cambio exacto que se
 * propone (pausar, subir o bajar el presupuesto).
 *
 * Es puro (sin red ni base de datos) y no escribe nada en ninguna plataforma:
 * solo produce candidatos. Una persona con permiso de aprobar decide qué se
 * hace con cada uno. Las cuentas se hacen con los números que ya calculó
 * `senalesDeCampana`; acá no se inventa ningún umbral.
 */
import {
  claveDeCampana,
  ctrTipicoPorPlataforma,
  senalesDeCampana,
  type CampanaBase,
  type Metas,
  type Senal,
} from "./contexto-cliente";
import { moneda } from "./monedas";
import type { Hallazgo } from "./medicion";
import { ETIQUETA_RITMO, type ResumenPresupuesto } from "./presupuesto";

export type AccionSugerida =
  | { tipo: "pausar" }
  | { tipo: "presupuesto"; monto: number; actual: number }
  | { tipo: "revisar" };

export type SeveridadSugerencia = "critical" | "high" | "medium" | "info";

export type Sugerencia = {
  /** Determinístico por regla + campaña + día: evaluar dos veces no la duplica. */
  id: string;
  rule: string;
  severity: SeveridadSugerencia;
  portfolioId: string;
  client: string;
  platform: string;
  /** Las sugerencias del cliente entero (por ejemplo, el presupuesto) no tienen campaña. */
  provider: string | null;
  accountId: string | null;
  entityLevel: "campana" | null;
  entityId: string | null;
  entityName: string | null;
  title: string;
  diagnosis: string;
  proposedAction: string;
  impact: string;
  confidence: "Alta" | "Media";
  before: string;
  after: string;
  guardrail: string;
  metric: string;
  delta: string;
  primaryLabel: string;
  accion: AccionSugerida;
  generatedAt: number;
  expiresAt: number;
};

/** Cuánto vive una sugerencia sin que nadie la atienda. */
export const VENCE_EN_MS = 3 * 24 * 60 * 60 * 1000;
/** Ajuste de presupuesto que se propone: prudente, nunca un salto grande. */
export const SUBIR_PRESUPUESTO = 1.2;
export const BAJAR_PRESUPUESTO = 0.85;

export type ClienteParaSugerir = {
  id: string;
  nombre: string;
  metas: Metas;
  /** Cuentas del cliente en el formato de `accountKey` de las campañas. */
  cuentas: Set<string>;
};

const activa = (estado: string | null) => estado === "ENABLED" || estado === "ACTIVE";

function plataforma(provider: string): string {
  return provider === "google" ? "Google Ads" : provider === "meta" ? "Meta Ads" : provider;
}

const iso = (fecha: Date) => fecha.toISOString().slice(0, 10);

type Regla = {
  severity: SeveridadSugerencia;
  titulo: (nombre: string) => string;
  /** Qué se hace. `null` en `accion` = solo revisar, sin cambio automático. */
  accion: "pausar" | "bajar" | "subir" | "revisar";
  propuesta: (nombre: string) => string;
  impacto: string;
  metrica: string;
  boton: string;
  confianza: "Alta" | "Media";
};

const REGLAS: Record<string, Regla> = {
  gasto_sin_resultados: {
    severity: "critical",
    titulo: (n) => `"${n}" gastó sin ningún resultado`,
    accion: "pausar",
    propuesta: (n) => `Pausar "${n}" hasta revisar la segmentación o la pieza.`,
    impacto: "Detiene un gasto que hoy no devuelve resultados.",
    metrica: "Gasto sin resultados",
    boton: "Pausar",
    confianza: "Alta",
  },
  cpa_sobre_meta: {
    severity: "high",
    titulo: (n) => `"${n}" paga de más por resultado`,
    accion: "bajar",
    propuesta: (n) => `Bajar el presupuesto diario de "${n}" mientras se revisa la segmentación y las piezas.`,
    impacto: "Reduce la exposición a un costo por resultado sobre la meta del cliente.",
    metrica: "CPA vs. meta",
    boton: "Bajar presupuesto",
    confianza: "Alta",
  },
  roas_bajo_meta: {
    severity: "high",
    titulo: (n) => `"${n}" rinde bajo la meta de retorno`,
    accion: "bajar",
    propuesta: (n) => `Bajar el presupuesto diario de "${n}" mientras se revisa.`,
    impacto: "Reduce la exposición mientras se corrige el retorno.",
    metrica: "ROAS vs. meta",
    boton: "Bajar presupuesto",
    confianza: "Media",
  },
  resultados_caen: {
    severity: "high",
    titulo: (n) => `Los resultados de "${n}" cayeron`,
    accion: "revisar",
    propuesta: (n) => `Revisar "${n}": con un gasto parecido, algo cambió en la entrega o en el creativo.`,
    impacto: "Recupera resultados perdidos sin gastar más.",
    metrica: "Resultados vs. periodo anterior",
    boton: "Revisar",
    confianza: "Media",
  },
  cpa_bajo_meta: {
    severity: "info",
    titulo: (n) => `"${n}" rinde por sobre la meta: hay margen para escalar`,
    accion: "subir",
    propuesta: (n) => `Subir el presupuesto diario de "${n}".`,
    impacto: "Más inversión en una campaña que está por sobre la meta del cliente.",
    metrica: "CPA vs. meta",
    boton: "Subir presupuesto",
    confianza: "Media",
  },
  roas_sobre_meta: {
    severity: "info",
    titulo: (n) => `"${n}" supera la meta de retorno: candidata a escalar`,
    accion: "subir",
    propuesta: (n) => `Subir el presupuesto diario de "${n}".`,
    impacto: "Más inversión en la campaña con mejor retorno del cliente.",
    metrica: "ROAS vs. meta",
    boton: "Subir presupuesto",
    confianza: "Media",
  },
  frecuencia_alta: {
    severity: "medium",
    titulo: (n) => `"${n}" muestra señales de fatiga`,
    accion: "revisar",
    propuesta: (n) => `Renovar el creativo de "${n}" o ampliar su audiencia.`,
    impacto: "Evita pagar por impresiones repetidas a las mismas personas.",
    metrica: "Frecuencia",
    boton: "Revisar",
    confianza: "Media",
  },
  cpm_sobre_meta: {
    severity: "medium",
    titulo: (n) => `El alcance de "${n}" sale más caro de lo acordado`,
    accion: "revisar",
    propuesta: (n) => `Revisar la audiencia y las ubicaciones de "${n}".`,
    impacto: "Recupera alcance por peso invertido.",
    metrica: "CPM vs. meta",
    boton: "Revisar",
    confianza: "Media",
  },
  ctr_bajo_meta: {
    severity: "medium",
    titulo: (n) => `"${n}" atrae menos clics de lo acordado`,
    accion: "revisar",
    propuesta: (n) => `Probar otro texto o imagen en "${n}", o revisar su segmentación.`,
    impacto: "Más clics con la misma inversión.",
    metrica: "CTR vs. mínimo del cliente",
    boton: "Revisar",
    confianza: "Media",
  },
  ctr_bajo: {
    severity: "medium",
    titulo: (n) => `"${n}" atrae pocos clics comparada con el resto`,
    accion: "revisar",
    propuesta: (n) => `Probar otro texto o imagen en "${n}", o revisar su segmentación.`,
    impacto: "Más clics con la misma inversión.",
    metrica: "CTR vs. típico del cliente",
    boton: "Revisar",
    confianza: "Media",
  },
  cpa_empeora: {
    severity: "medium",
    titulo: (n) => `El costo por resultado de "${n}" viene subiendo`,
    accion: "revisar",
    propuesta: (n) => `Revisar qué cambió en "${n}" frente al periodo anterior.`,
    impacto: "Corrige la tendencia antes de que pase la meta.",
    metrica: "CPA vs. periodo anterior",
    boton: "Revisar",
    confianza: "Media",
  },
  sin_actividad: {
    severity: "medium",
    titulo: (n) => `"${n}" está activa pero no entrega`,
    accion: "revisar",
    propuesta: (n) => `Revisar en la plataforma por qué "${n}" no gasta: presupuesto, rechazo o segmentación.`,
    impacto: "Una campaña activa que no entrega no está trabajando para el cliente.",
    metrica: "Actividad",
    boton: "Revisar",
    confianza: "Alta",
  },
};

/**
 * Una sugerencia por señal que tiene regla. Una campaña con "gasto sin
 * resultados" no repite además "CPA sobre la meta": es el mismo problema.
 */
export function generarSugerencias(
  clientes: ClienteParaSugerir[],
  actuales: CampanaBase[],
  previas: CampanaBase[] | null,
  ahora: Date,
): Sugerencia[] {
  const dia = iso(ahora);
  const generatedAt = ahora.getTime();
  const previasPorClave = new Map((previas ?? []).map((c) => [claveDeCampana(c), c]));
  const resultado: Sugerencia[] = [];

  for (const cliente of clientes) {
    const delCliente = actuales.filter((c) => cliente.cuentas.has(accountKeyDe(c)));
    if (delCliente.length === 0) continue;
    const ctrTipico = ctrTipicoPorPlataforma(delCliente);

    for (const campana of delCliente) {
      if (!activa(campana.status) || !campana.campaignId) continue;
      const senales = senalesDeCampana(
        campana,
        previasPorClave.get(claveDeCampana(campana)) ?? null,
        cliente.metas,
        ctrTipico.get(campana.provider) ?? null,
      );
      const elegida = elegirSenales(senales);
      for (const senal of elegida) {
        const regla = REGLAS[senal.tipo];
        if (!regla) continue;
        const candidata = armar(cliente, campana, senal, regla, dia, generatedAt);
        if (candidata) resultado.push(candidata);
      }
    }
  }

  const orden: Record<SeveridadSugerencia, number> = { critical: 0, high: 1, medium: 2, info: 3 };
  return resultado.sort((a, b) => orden[a.severity] - orden[b.severity]);
}

/** El identificador de cuenta con el que `CampaignSummary` se agrupa por cliente. */
function accountKeyDe(c: CampanaBase): string {
  return (c as CampanaBase & { accountKey?: string }).accountKey ?? `windsor:${c.provider}:${c.accountId}`;
}

/** Descarta señales que repiten el mismo problema de otra más grave. */
function elegirSenales(senales: Senal[]): Senal[] {
  const tipos = new Set(senales.map((s) => s.tipo));
  return senales.filter((s) => {
    if (s.tipo === "cpa_sobre_meta" && tipos.has("gasto_sin_resultados")) return false;
    if (s.tipo === "cpa_empeora" && tipos.has("cpa_sobre_meta")) return false;
    if (s.tipo === "ctr_bajo" && tipos.has("ctr_bajo_meta")) return false;
    return true;
  });
}

function armar(
  cliente: ClienteParaSugerir,
  c: CampanaBase,
  senal: Senal,
  regla: Regla,
  dia: string,
  generatedAt: number,
): Sugerencia | null {
  const presupuestoUnidades = c.dailyBudgetMicros && c.dailyBudgetMicros > 0 ? c.dailyBudgetMicros / 1_000_000 : null;
  let accion: AccionSugerida;
  let before = "Sin cambios";
  let after = "Revisión";
  let delta = "";
  let propuesta = regla.propuesta(c.name);
  let boton = regla.boton;

  if (regla.accion === "pausar") {
    accion = { tipo: "pausar" };
    before = "Activa";
    after = "Pausada";
    delta = `${moneda(c.spendMicros, c.currency)} · 0 resultados`;
  } else if (regla.accion === "bajar" || regla.accion === "subir") {
    if (presupuestoUnidades === null) {
      // Sin presupuesto de campaña (por ejemplo, el de Meta vive en cada
      // conjunto) no hay de dónde calcular uno nuevo: queda como revisión.
      accion = { tipo: "revisar" };
      propuesta = `${regla.propuesta(c.name).replace(/\.$/, "")} El presupuesto está definido en los conjuntos: revísalo desde el editor.`;
      boton = "Revisar";
      delta = "Presupuesto por conjunto";
    } else {
      const factor = regla.accion === "subir" ? SUBIR_PRESUPUESTO : BAJAR_PRESUPUESTO;
      const monto = Math.round(presupuestoUnidades * factor);
      if (monto === Math.round(presupuestoUnidades)) return null;
      accion = { tipo: "presupuesto", monto, actual: Math.round(presupuestoUnidades) };
      before = moneda(Math.round(presupuestoUnidades) * 1_000_000, c.currency);
      after = moneda(monto * 1_000_000, c.currency);
      delta = regla.accion === "subir" ? "+20%" : "-15%";
      propuesta = `${propuesta.replace(/\.$/, "")} de ${before} a ${after} (${delta}).`;
    }
  } else {
    accion = { tipo: "revisar" };
  }

  return {
    id: `${senal.tipo}-${claveDeCampana(c)}-${dia}`,
    rule: senal.tipo,
    severity: regla.severity,
    portfolioId: cliente.id,
    client: cliente.nombre,
    platform: plataforma(c.provider),
    provider: c.provider,
    accountId: c.accountId,
    entityLevel: "campana",
    entityId: c.campaignId ?? "",
    entityName: c.name,
    title: regla.titulo(c.name),
    diagnosis: senal.evidencia,
    proposedAction: propuesta,
    impact: regla.impacto,
    confidence: regla.confianza,
    before,
    after,
    guardrail:
      accion.tipo === "presupuesto"
        ? "No subir ni bajar el presupuesto de una misma campaña más de una vez cada 48 horas."
        : accion.tipo === "pausar"
          ? "Confirmar que no sea la única campaña activa del cliente antes de pausar."
          : "Solo una persona con permiso de aprobar decide qué se cambia.",
    metric: regla.metrica,
    delta: delta || "—",
    primaryLabel: boton,
    accion,
    generatedAt,
    expiresAt: generatedAt + VENCE_EN_MS,
  };
}

/* -------------------------------------------------------------------------- */
/* Presupuesto del mes                                                        */
/* -------------------------------------------------------------------------- */

export type EntradaDePresupuesto = {
  cliente: Pick<ClienteParaSugerir, "id" | "nombre">;
  resumen: ResumenPresupuesto;
  moneda: string;
};

/**
 * Una sugerencia por cliente cuando el gasto del mes se sale del presupuesto
 * acordado: ya se pasó, está por agotarse, va a pasarse o va a quedar corto.
 * `en_ritmo` no sugiere nada. Es del cliente entero: no apunta a una campaña.
 */
export function sugerenciasDePresupuesto(entradas: EntradaDePresupuesto[], ahora: Date): Sugerencia[] {
  const dia = iso(ahora);
  const generatedAt = ahora.getTime();
  const salida: Sugerencia[] = [];

  for (const { cliente, resumen: r, moneda: mon } of entradas) {
    if (r.estado === "en_ritmo") continue;
    const money = (micros: number) => moneda(Math.round(micros), mon);
    const base = {
      id: `presupuesto_ritmo-${cliente.id}-${dia}`,
      rule: "presupuesto_ritmo",
      portfolioId: cliente.id,
      client: cliente.nombre,
      platform: "Todas",
      provider: null,
      accountId: null,
      entityLevel: null,
      entityId: null,
      entityName: null,
      confidence: "Alta" as const,
      metric: "Presupuesto del mes",
      primaryLabel: "Revisar",
      accion: { tipo: "revisar" } as AccionSugerida,
      generatedAt,
      expiresAt: generatedAt + VENCE_EN_MS,
      guardrail: "Solo una persona con permiso de aprobar decide qué se cambia.",
    };
    const contexto = `Día ${r.diasTranscurridos} de ${r.diasDelMes}: gastó ${money(r.gastadoMicros)} de ${money(r.presupuestoMicros)} (${Math.round(r.fraccionGastada * 100)} %).`;

    if (r.estado === "excedido") {
      salida.push({
        ...base,
        severity: "critical",
        title: "Ya se pasó del presupuesto del mes",
        diagnosis: `${contexto} Va ${money(-r.restanteMicros)} por encima de lo acordado.`,
        proposedAction: "Pausar o bajar el gasto de las campañas que sobran y avisar al cliente antes de seguir invirtiendo.",
        impact: "Frena un gasto que ya no tiene presupuesto acordado.",
        before: money(r.gastadoMicros),
        after: money(r.presupuestoMicros),
        delta: `+${money(-r.restanteMicros)}`,
      });
    } else if (r.estado === "agotado") {
      salida.push({
        ...base,
        severity: "high",
        title: "Casi agotó el presupuesto del mes",
        diagnosis: `${contexto} Quedan ${money(r.restanteMicros)} para ${r.diasRestantes} ${r.diasRestantes === 1 ? "día" : "días"}.`,
        proposedAction: `Bajar el gasto diario a ${money(r.disponibleDiarioMicros)} o menos, o acordar más presupuesto con el cliente.`,
        impact: "Evita pasarse del presupuesto acordado antes de fin de mes.",
        before: `${money(r.ritmoDiarioMicros)} por día`,
        after: `${money(r.disponibleDiarioMicros)} por día`,
        delta: `${Math.round(r.fraccionGastada * 100)} % gastado`,
      });
    } else if (r.estado === "adelantado") {
      salida.push({
        ...base,
        severity: "high",
        title: "Va a pasarse del presupuesto del mes",
        diagnosis: `${contexto} Al ritmo actual (${money(r.ritmoDiarioMicros)} por día) cerraría en ${money(r.proyeccionMicros)}, ${money(r.proyeccionMicros - r.presupuestoMicros)} sobre lo acordado.`,
        proposedAction: `Bajar el gasto diario a ${money(r.disponibleDiarioMicros)} para cerrar dentro del presupuesto.`,
        impact: `Evita un exceso proyectado de ${money(r.proyeccionMicros - r.presupuestoMicros)}.`,
        before: `${money(r.ritmoDiarioMicros)} por día`,
        after: `${money(r.disponibleDiarioMicros)} por día`,
        delta: `Proyección ${money(r.proyeccionMicros)}`,
      });
    } else {
      salida.push({
        ...base,
        severity: "medium",
        title: "Va a quedar bajo el presupuesto del mes",
        diagnosis: `${contexto} Al ritmo actual cerraría en ${money(r.proyeccionMicros)}: dejaría ${money(r.presupuestoMicros - r.proyeccionMicros)} sin invertir.`,
        proposedAction: `Revisar si las campañas están limitadas por presupuesto o por segmentación; hay ${money(r.disponibleDiarioMicros)} por día disponibles.`,
        impact: "Aprovecha el presupuesto acordado en vez de dejarlo sin usar.",
        before: `${money(r.ritmoDiarioMicros)} por día`,
        after: `${money(r.disponibleDiarioMicros)} por día`,
        delta: `${ETIQUETA_RITMO.atrasado}: ${money(r.proyeccionMicros)}`,
      });
    }
  }
  return salida;
}

/* -------------------------------------------------------------------------- */
/* Medición                                                                   */
/* -------------------------------------------------------------------------- */

export type EntradaDeMedicion = {
  cliente: Pick<ClienteParaSugerir, "id" | "nombre">;
  hallazgos: Hallazgo[];
};

/**
 * Cada problema del marcaje (ver `lib/medicion.ts`) es una sugerencia del
 * cliente: hay que corregirlo en GTM/GA4, y eso no se hace desde acá. Por eso
 * la acción es siempre «revisar».
 */
export function sugerenciasDeMedicion(entradas: EntradaDeMedicion[], ahora: Date): Sugerencia[] {
  const dia = iso(ahora);
  const generatedAt = ahora.getTime();
  return entradas.flatMap(({ cliente, hallazgos }) =>
    hallazgos.map((h) => ({
      id: `medicion_${h.id}-${cliente.id}-${dia}`,
      rule: `medicion_${h.id}`,
      severity: (h.severidad === "alta" ? "high" : "medium") as SeveridadSugerencia,
      portfolioId: cliente.id,
      client: cliente.nombre,
      platform: "GA4",
      provider: null,
      accountId: null,
      entityLevel: null,
      entityId: null,
      entityName: null,
      title: h.titulo,
      diagnosis: h.detalle,
      proposedAction: "Corregirlo en el marcaje (GTM o GA4) y confirmarlo enviando un formulario de prueba.",
      impact: "De la medición dependen los leads y saber si todo está en orden.",
      confidence: "Alta" as const,
      before: "Medición con problemas",
      after: "Medición corregida",
      guardrail: "Esto se corrige en Tag Manager o Analytics: desde acá solo se vigila.",
      metric: "Salud de medición",
      delta: h.eventos.length > 0 ? h.eventos.join(", ") : "—",
      primaryLabel: "Revisar",
      accion: { tipo: "revisar" } as AccionSugerida,
      generatedAt,
      expiresAt: generatedAt + VENCE_EN_MS,
    })),
  );
}
