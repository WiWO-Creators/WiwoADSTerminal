/**
 * Simulador de campañas: proyecta qué podría dar un monto, con el rendimiento
 * que ese MISMO cliente tuvo antes. Puro (sin red ni base de datos).
 *
 * Es una proyección, no una promesa: parte del historial real de cada
 * plataforma y objetivo (costo por mil impresiones, CTR, costo por resultado),
 * y da un rango, no una cifra única. Cuando el historial es poco, o el monto
 * simulado es mucho mayor que lo que ya se invertía, lo dice y ensancha el
 * rango: gastar el doble rara vez da el doble de resultados.
 */
import { etiquetaDeCanal } from "./canales";

export type CampanaHistorial = { gastoMicros: number; resultados: number | null };

export type FilaHistorial = {
  provider: string;
  /** Canal dentro de la plataforma (Instagram, Búsqueda…). `null` o ausente: el total de la plataforma. */
  canal?: string | null;
  objetivo: string;
  gastoMicros: number;
  impresiones: number;
  clics: number;
  /** La métrica propia del objetivo (leads, compras, interacciones…). null: no se mide. */
  resultados: number | null;
  etiquetaResultado: string;
  campanas: CampanaHistorial[];
};

export type Historial = {
  moneda: string;
  /** Días que cubre el historial (el periodo leído). */
  dias: number;
  filas: FilaHistorial[];
};

export type PlanSimulado = {
  montoMicros: number;
  dias: number;
  objetivo: string;
  /**
   * Cómo se reparte el monto entre plataformas y canales; las fracciones deben
   * sumar 1. Sin `canal`, el monto va a la plataforma entera.
   */
  reparto: Array<{ provider: string; canal?: string | null; fraccion: number }>;
  campanas: number;
};

export type Confianza = "alta" | "media" | "baja" | "sin_historial";

export type Rango = { bajo: number; central: number; alto: number };

export type ProyeccionPlataforma = {
  provider: string;
  canal: string | null;
  /** true: el canal no tiene historial propio y se usó el promedio de la plataforma. */
  aproximado: boolean;
  gastoMicros: number;
  impresiones: number | null;
  clics: number | null;
  resultados: Rango | null;
  etiquetaResultado: string;
  cpmMicros: number | null;
  ctr: number | null;
  cpcMicros: number | null;
  costoPorResultadoMicros: number | null;
  confianza: Confianza;
  avisos: string[];
};

export type Proyeccion = {
  porPlataforma: ProyeccionPlataforma[];
  total: { gastoMicros: number; impresiones: number | null; clics: number | null; resultados: Rango | null };
  diarioPorCampanaMicros: number;
  avisos: string[];
};

export const UMBRALES_SIMULADOR = {
  /** Resultados históricos mínimos para confianza media / alta. */
  RESULTADOS_MEDIA: 10,
  RESULTADOS_ALTA: 30,
  CAMPANAS_ALTA: 3,
  /** Campañas con resultados necesarias para medir la dispersión real. */
  CAMPANAS_DISPERSION: 3,
  /** Rango por defecto (±) cuando no hay dispersión que medir. */
  RANGO_AMPLIO: 0.35,
  /** Monto diario simulado sobre el histórico a partir del cual se avisa de rendimientos decrecientes. */
  ESCALA_AVISO: 2,
  /** Castigo a la parte baja del rango cuando se escala mucho. */
  CASTIGO_ESCALA: 0.85,
} as const;

/** Percentil con interpolación lineal; `valores` no puede estar vacío. */
export function percentil(valores: number[], p: number): number {
  const orden = [...valores].sort((a, b) => a - b);
  if (orden.length === 1) return orden[0];
  const pos = (orden.length - 1) * p;
  const base = Math.floor(pos);
  const resto = pos - base;
  return orden[base] + (orden[base + 1] !== undefined ? (orden[base + 1] - orden[base]) * resto : 0);
}

function confianzaDe(f: FilaHistorial): Confianza {
  if (f.gastoMicros <= 0 || f.impresiones <= 0) return "sin_historial";
  const r = f.resultados ?? 0;
  const conResultados = f.campanas.filter((c) => (c.resultados ?? 0) > 0).length;
  if (r >= UMBRALES_SIMULADOR.RESULTADOS_ALTA && conResultados >= UMBRALES_SIMULADOR.CAMPANAS_ALTA) return "alta";
  if (r >= UMBRALES_SIMULADOR.RESULTADOS_MEDIA) return "media";
  return "baja";
}

const ETIQUETA_PLATAFORMA: Record<string, string> = { google: "Google Ads", meta: "Meta Ads", tiktok: "TikTok Ads", linkedin: "LinkedIn Ads" };

function bajarConfianza(c: Confianza): Confianza {
  return c === "alta" ? "media" : c === "media" ? "baja" : c;
}

export function proyectar(plan: PlanSimulado, historial: Historial): Proyeccion {
  const U = UMBRALES_SIMULADOR;
  const avisos: string[] = [];
  const porPlataforma: ProyeccionPlataforma[] = [];

  for (const { provider, fraccion, canal: canalPedido } of plan.reparto) {
    const canal = canalPedido ?? null;
    const gasto = plan.montoMicros * fraccion;
    const plataforma = ETIQUETA_PLATAFORMA[provider] ?? provider;
    const nombre = canal ? `${plataforma} · ${etiquetaDeCanal(provider, canal)}` : plataforma;
    const delObjetivo = historial.filas.filter((f) => f.provider === provider && f.objetivo === plan.objetivo);
    const propia = delObjetivo.find((f) => (f.canal ?? null) === canal);
    const general = delObjetivo.find((f) => (f.canal ?? null) === null);
    // Un canal sin historial propio se proyecta con el promedio de su plataforma, y se dice.
    const aproximado = canal !== null && (!propia || confianzaDe(propia) === "sin_historial") && Boolean(general);
    const fila = aproximado ? general : propia;
    const vacio: ProyeccionPlataforma = {
      provider,
      canal,
      aproximado: false,
      gastoMicros: gasto,
      impresiones: null,
      clics: null,
      resultados: null,
      etiquetaResultado: fila?.etiquetaResultado ?? "resultados",
      cpmMicros: null,
      ctr: null,
      cpcMicros: null,
      costoPorResultadoMicros: null,
      confianza: "sin_historial",
      avisos: [],
    };
    if (!fila || confianzaDe(fila) === "sin_historial") {
      porPlataforma.push({
        ...vacio,
        avisos: [`Este cliente no tiene historial de ${nombre} para este objetivo: no hay con qué proyectar.`],
      });
      continue;
    }

    // Si los resultados del canal no se pueden medir (Meta los repite entre redes), la parte de
    // resultados descansa en el historial de la plataforma entera: ahí se mide la confianza, no en
    // el canal, que sin resultados propios siempre saldría «baja» aunque tenga mucho gasto. Nunca pasa de «media»: el reparto por canal de los resultados es una estimación.
    const resultadosDeLaPlataforma =
      canal !== null && !aproximado && (fila.resultados ?? 0) <= 0 && general && (general.resultados ?? 0) > 0;
    const confianza = aproximado
      ? bajarConfianza(confianzaDe(fila))
      : resultadosDeLaPlataforma
        ? (confianzaDe(general as FilaHistorial) === "alta" ? "media" : confianzaDe(general as FilaHistorial))
        : confianzaDe(fila);
    const cpm = (fila.gastoMicros / fila.impresiones) * 1000;
    const ctr = fila.clics / fila.impresiones;
    const cpc = fila.clics > 0 ? fila.gastoMicros / fila.clics : null;
    const impresiones = (gasto / cpm) * 1000;
    const clics = impresiones * ctr;
    const avisosPlataforma: string[] = [];
    if (aproximado) {
      avisosPlataforma.push(
        `Sin historial propio de ${etiquetaDeCanal(provider, canal)}: se usa el rendimiento promedio de ${plataforma}.`,
      );
    }

    let resultados: Rango | null = null;
    let cpr: number | null = null;
    // Los resultados por canal no siempre son medibles (Meta los repite entre redes, Google no
    // los separa): sin un resultado propio, se usa el costo por resultado de la plataforma.
    const filaRes =
      fila.resultados !== null && fila.resultados > 0
        ? fila
        : canal !== null && general && general !== fila && general.resultados !== null && general.resultados > 0
          ? general
          : null;
    if (filaRes) {
      if (filaRes !== fila) {
        avisosPlataforma.push(
          `Los resultados no se miden con confiabilidad por canal: se usa el costo promedio por resultado de ${plataforma}.`,
        );
      }
      cpr = filaRes.gastoMicros / (filaRes.resultados as number);
      const central = gasto / cpr;
      const cprs = filaRes.campanas
        .filter((c) => (c.resultados ?? 0) > 0 && c.gastoMicros > 0)
        .map((c) => c.gastoMicros / (c.resultados as number));
      let bajo: number;
      let alto: number;
      if (cprs.length >= U.CAMPANAS_DISPERSION) {
        // Costo por resultado peor (percentil 75) da menos resultados; mejor (25), más.
        bajo = gasto / percentil(cprs, 0.75);
        alto = gasto / percentil(cprs, 0.25);
      } else {
        bajo = central * (1 - U.RANGO_AMPLIO);
        alto = central * (1 + U.RANGO_AMPLIO);
        avisosPlataforma.push("Pocas campañas con resultados: el rango es una estimación amplia, no medida.");
      }
      // Escalar mucho respecto de lo que ya se invertía suele encarecer cada resultado.
      const diarioSimulado = gasto / Math.max(1, plan.dias);
      const diarioHistorico = fila.gastoMicros / Math.max(1, historial.dias);
      if (diarioHistorico > 0 && diarioSimulado > U.ESCALA_AVISO * diarioHistorico) {
        bajo *= U.CASTIGO_ESCALA;
        avisosPlataforma.push(
          `Simulas ${(diarioSimulado / diarioHistorico).toFixed(1)} veces lo que se venía invirtiendo por día en ${nombre}: a más escala, cada resultado suele costar más.`,
        );
      }
      resultados = { bajo: Math.min(bajo, central), central, alto: Math.max(alto, central) };
    } else {
      avisosPlataforma.push(
        `Con este objetivo no hay resultados medidos en ${nombre}: solo se proyectan impresiones y clics.`,
      );
    }
    if (confianza === "baja") {
      avisosPlataforma.push("Historial corto (pocos resultados): tómalo como una orientación, no como una meta.");
    }

    porPlataforma.push({
      provider,
      canal,
      aproximado,
      gastoMicros: gasto,
      impresiones,
      clics,
      resultados,
      etiquetaResultado: fila.etiquetaResultado,
      cpmMicros: cpm,
      ctr,
      cpcMicros: cpc,
      costoPorResultadoMicros: cpr,
      confianza,
      avisos: avisosPlataforma,
    });
  }

  const conProyeccion = porPlataforma.filter((p) => p.impresiones !== null);
  const conResultados = porPlataforma.filter((p) => p.resultados !== null);
  const total: Proyeccion["total"] = {
    gastoMicros: plan.montoMicros,
    impresiones: conProyeccion.length ? conProyeccion.reduce((s, p) => s + (p.impresiones ?? 0), 0) : null,
    clics: conProyeccion.length ? conProyeccion.reduce((s, p) => s + (p.clics ?? 0), 0) : null,
    resultados: conResultados.length
      ? {
          bajo: conResultados.reduce((s, p) => s + (p.resultados?.bajo ?? 0), 0),
          central: conResultados.reduce((s, p) => s + (p.resultados?.central ?? 0), 0),
          alto: conResultados.reduce((s, p) => s + (p.resultados?.alto ?? 0), 0),
        }
      : null,
  };

  const sinProyeccion = porPlataforma
    .filter((p) => p.impresiones === null)
    .map((p) => (p.canal ? `${ETIQUETA_PLATAFORMA[p.provider] ?? p.provider} · ${etiquetaDeCanal(p.provider, p.canal)}` : (ETIQUETA_PLATAFORMA[p.provider] ?? p.provider)));
  if (sinProyeccion.length > 0 && conProyeccion.length > 0) {
    avisos.push(`El total no incluye ${sinProyeccion.join(" ni ")}: sin historial para proyectarlo.`);
  }

  return {
    porPlataforma,
    total,
    diarioPorCampanaMicros: plan.montoMicros / Math.max(1, plan.dias) / Math.max(1, plan.campanas),
    avisos,
  };
}

/**
 * Reparte 100 % entre canales cuando la persona cambia uno: ese queda como lo escribió y los demás
 * se ajustan en proporción a lo que tenían, para que el total siga en 100. Si los demás estaban en
 * cero, el resto se reparte parejo entre los que tienen historial (`conHistorial`) o entre todos.
 */
export function reequilibrar(
  pesos: Record<string, number>,
  clave: string,
  valor: number,
  conHistorial: string[] = [],
): Record<string, number> {
  const nuevo = Math.max(0, Math.min(100, Number.isFinite(valor) ? valor : 0));
  const otras = Object.keys(pesos).filter((k) => k !== clave);
  const resultado: Record<string, number> = { [clave]: nuevo };
  if (otras.length === 0) return { [clave]: 100 };
  const resto = 100 - nuevo;
  const sumaOtras = otras.reduce((s, k) => s + Math.max(0, pesos[k] ?? 0), 0);
  if (sumaOtras > 0) {
    for (const k of otras) resultado[k] = (Math.max(0, pesos[k] ?? 0) / sumaOtras) * resto;
  } else {
    const base = otras.filter((k) => conHistorial.includes(k));
    const destino = base.length > 0 ? base : otras;
    for (const k of otras) resultado[k] = destino.includes(k) ? resto / destino.length : 0;
  }
  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Mínimos por plataforma                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Presupuesto diario mínimo OPERATIVO por campaña, en dólares. Son referencias de trabajo, no una garantía
 * de la plataforma: con menos que esto la campaña casi no entrega y la proyección no significa nada.
 * Meta documenta ~US$ 1 por día por conjunto; LinkedIn US$ 10; TikTok US$ 20 por grupo de anuncios. Para
 * Google no hay un tope formal: se usa US$ 1 como piso práctico. Se pueden ajustar aquí.
 */
export const MINIMO_DIARIO_USD: Record<string, number> = { meta: 1, google: 1, linkedin: 10, tiktok: 20 };

/**
 * Lo mismo, pero según el objetivo: con presupuestos chicos Meta casi no sale de la fase de aprendizaje en
 * tráfico, leads o ventas (necesita unos pocos resultados al día), por eso el piso práctico sube a ~US$ 5 por
 * conjunto; en alcance basta US$ 1. En Google, las campañas de conversión necesitan más que las de alcance.
 * Es una referencia de trabajo (se puede ajustar aquí), no un límite que la plataforma publique.
 */
export const MINIMO_DIARIO_USD_POR_OBJETIVO: Record<string, Record<string, number>> = {
  meta: { AE: 1, TRF: 5, LDS: 5, VTA: 5, OCV: 5 },
  google: { AE: 1, TRF: 3, LDS: 5, VTA: 5, OCV: 5 },
};

/** Cuántas unidades de cada moneda vale 1 USD (aproximado, solo para convertir los mínimos). */
export const TASA_REFERENCIA_USD: Record<string, number> = {
  USD: 1, CLP: 950, PEN: 3.8, ARS: 1000, COP: 4000, MXN: 18, EUR: 0.92, BRL: 5.4, UYU: 40,
};

/**
 * Mínimo del canal para toda la duración, en micros de la moneda. `null` si no se conoce la moneda
 * (entonces no se exige ningún mínimo: no se inventa uno). Redondea hacia arriba a un número limpio.
 */
export function minimoDelCanalMicros(
  provider: string,
  moneda: string,
  dias: number,
  objetivo?: string,
  campanas = 1,
  /** Tipo de cambio vivo (unidades de `moneda` por USD); si no llega se usa el de referencia. */
  tasaVivaPorUsd?: number | null,
): number | null {
  const usd = (objetivo ? MINIMO_DIARIO_USD_POR_OBJETIVO[provider]?.[objetivo] : undefined) ?? MINIMO_DIARIO_USD[provider];
  const tasa = tasaVivaPorUsd && tasaVivaPorUsd > 0 ? tasaVivaPorUsd : TASA_REFERENCIA_USD[moneda.toUpperCase()];
  if (usd === undefined || tasa === undefined) return null;
  const diario = usd * tasa;
  // Un piso limpio por día (por ejemplo CLP 950 → 1.000, PEN 3,8 → 4) antes de multiplicar por los días.
  const magnitud = Math.pow(10, Math.max(0, Math.floor(Math.log10(diario))));
  const diarioLimpio = Math.ceil(diario / magnitud) * magnitud;
  return Math.round(diarioLimpio * Math.max(1, dias) * Math.max(1, Math.round(campanas)) * 1_000_000);
}

/**
 * Como `ajustarAMinimos`, pero el mínimo es de la PLATAFORMA (el conjunto de anuncios), no de cada canal:
 * Facebook e Instagram de Meta comparten un mismo presupuesto, no se exige uno a cada ubicación. Si lo asignado
 * a una plataforma queda bajo su mínimo, todos sus canales pasan a 0 y su parte va a las plataformas que sí
 * alcanzan, en proporción. `minimosPct` va por plataforma. El grupo `protegida` no se toca (ahí se avisa).
 */
export function ajustarAMinimosPorPlataforma(
  pesos: Record<string, number>,
  plataformaDe: Record<string, string>,
  minimosPct: Record<string, number>,
  protegida?: string,
): Record<string, number> {
  let actual = { ...pesos };
  const sumaDe = (mapa: Record<string, number>, grupo: string) =>
    Object.keys(mapa).reduce((s, k) => (plataformaDe[k] === grupo ? s + mapa[k] : s), 0);
  for (let vuelta = 0; vuelta < 10; vuelta += 1) {
    const grupos = [...new Set(Object.keys(actual).map((k) => plataformaDe[k]))];
    const bajos = grupos.filter((g) => {
      const suma = sumaDe(actual, g);
      return g !== protegida && suma > 1e-9 && suma + 1e-9 < (minimosPct[g] ?? 0);
    });
    if (bajos.length === 0) return actual;
    const liberado = bajos.reduce((s, g) => s + sumaDe(actual, g), 0);
    const siguiente = { ...actual };
    for (const k of Object.keys(siguiente)) if (bajos.includes(plataformaDe[k])) siguiente[k] = 0;
    const receptores = Object.keys(siguiente).filter(
      (k) => siguiente[k] > 1e-9 && !bajos.includes(plataformaDe[k]) && plataformaDe[k] !== protegida,
    );
    const base = receptores.reduce((s, k) => s + siguiente[k], 0);
    if (base <= 0) return actual;
    for (const k of receptores) siguiente[k] += (siguiente[k] / base) * liberado;
    actual = siguiente;
  }
  return actual;
}

/**
 * Deja sin repartos por debajo de su mínimo: un canal con una fracción mayor que 0 pero menor que su
 * mínimo pasa a 0 y su parte se reparte entre los que sí alcanzan, en proporción. El canal `protegida`
 * (el que la persona acaba de escribir) no se toca aunque quede bajo el mínimo: ahí se avisa, no se corrige.
 * `minimosPct` es el mínimo de cada canal como porcentaje del monto total. El total sigue sumando 100.
 */
export function ajustarAMinimos(
  pesos: Record<string, number>,
  minimosPct: Record<string, number>,
  protegida?: string,
): Record<string, number> {
  let actual = { ...pesos };
  for (let vuelta = 0; vuelta < 10; vuelta += 1) {
    const bajos = Object.keys(actual).filter(
      (k) => k !== protegida && actual[k] > 1e-9 && actual[k] + 1e-9 < (minimosPct[k] ?? 0),
    );
    if (bajos.length === 0) return actual;
    const liberado = bajos.reduce((s, k) => s + actual[k], 0);
    const siguiente = { ...actual };
    for (const k of bajos) siguiente[k] = 0;
    const receptores = Object.keys(siguiente).filter((k) => !bajos.includes(k) && siguiente[k] > 1e-9 && k !== protegida);
    const base = receptores.reduce((s, k) => s + siguiente[k], 0);
    if (base <= 0) {
      // Nadie más a quien darle lo liberado: se queda como estaba (no se pierde ningún punto).
      return actual;
    }
    for (const k of receptores) siguiente[k] += (siguiente[k] / base) * liberado;
    actual = siguiente;
  }
  return actual;
}
