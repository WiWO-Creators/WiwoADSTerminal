/**
 * Distribución del gasto de un cliente: a qué plataforma, a qué objetivo y a
 * qué campañas se fue el dinero. Puro (sin red ni base de datos).
 *
 * Cada moneda se trata aparte: sumar pesos con dólares da un número que no
 * significa nada. Se muestra la moneda de mayor gasto y se avisa de las demás.
 */
export type CampanaParaDistribuir = {
  provider: string;
  name: string;
  currency: string | null;
  spendMicros: number;
  clicks: number;
  impressions: number;
  conActividad: boolean;
  objetivo: string | null;
};

export type Segmento = {
  clave: string;
  gastoMicros: number;
  /** Fracción del gasto total (0 a 1). */
  fraccion: number;
  campanas: number;
  clics: number;
  impresiones: number;
};

export type DistribucionDelGasto = {
  moneda: string;
  totalMicros: number;
  porPlataforma: Segmento[];
  /** `sin_sigla` agrupa las campañas que no siguen la convención de nombres. */
  porObjetivo: Segmento[];
  topCampanas: Array<{ nombre: string; provider: string; gastoMicros: number; fraccion: number }>;
  /** Monedas con gasto que no se incluyeron en las cifras. */
  otrasMonedas: string[];
};

function agrupar(
  campanas: CampanaParaDistribuir[],
  clave: (c: CampanaParaDistribuir) => string,
  total: number,
): Segmento[] {
  const grupos = new Map<string, Segmento>();
  for (const c of campanas) {
    const k = clave(c);
    const g = grupos.get(k) ?? { clave: k, gastoMicros: 0, fraccion: 0, campanas: 0, clics: 0, impresiones: 0 };
    g.gastoMicros += c.spendMicros;
    g.campanas += 1;
    g.clics += c.clicks;
    g.impresiones += c.impressions;
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, fraccion: total > 0 ? g.gastoMicros / total : 0 }))
    .sort((a, b) => b.gastoMicros - a.gastoMicros);
}

/**
 * `monedaElegida`: la moneda a repartir; sin ella, la de mayor gasto. El resto de las monedas con gasto queda en `otrasMonedas`
 * (para mostrarlas todas se llama una vez por moneda: ver `distribuirPorMoneda`).
 */
export function distribuirGasto(campanas: CampanaParaDistribuir[], limiteTop = 5, monedaElegida?: string): DistribucionDelGasto | null {
  const conGasto = campanas.filter((c) => c.conActividad && c.spendMicros > 0);
  if (conGasto.length === 0) return null;

  const porMoneda = new Map<string, number>();
  for (const c of conGasto) {
    const m = c.currency ?? "N/D";
    porMoneda.set(m, (porMoneda.get(m) ?? 0) + c.spendMicros);
  }
  const ordenadas = [...porMoneda.entries()].sort((a, b) => b[1] - a[1]);
  const moneda = monedaElegida && porMoneda.has(monedaElegida) ? monedaElegida : ordenadas[0][0];
  const enMoneda = conGasto.filter((c) => (c.currency ?? "N/D") === moneda);
  const total = enMoneda.reduce((suma, c) => suma + c.spendMicros, 0);

  return {
    moneda,
    totalMicros: total,
    porPlataforma: agrupar(enMoneda, (c) => c.provider, total),
    porObjetivo: agrupar(enMoneda, (c) => c.objetivo ?? "sin_sigla", total),
    topCampanas: [...enMoneda]
      .sort((a, b) => b.spendMicros - a.spendMicros)
      .slice(0, limiteTop)
      .map((c) => ({
        nombre: c.name,
        provider: c.provider,
        gastoMicros: c.spendMicros,
        fraccion: total > 0 ? c.spendMicros / total : 0,
      })),
    otrasMonedas: ordenadas.filter(([m]) => m !== moneda).map(([m]) => m),
  };
}

/** Una distribución por cada moneda con gasto, de más a menos: ninguna plataforma queda fuera por cobrar en otra moneda. */
export function distribuirPorMoneda(campanas: CampanaParaDistribuir[], limiteTop = 5): DistribucionDelGasto[] {
  const primera = distribuirGasto(campanas, limiteTop);
  if (!primera) return [];
  const resto = primera.otrasMonedas.flatMap((m) => distribuirGasto(campanas, limiteTop, m) ?? []);
  return [primera, ...resto];
}

/** Plataformas que tienen campañas pero no gastaron nada en el periodo: se dicen, para que no parezca que faltan. */
export function plataformasSinGasto(campanas: CampanaParaDistribuir[]): Array<{ provider: string; campanas: number }> {
  const gastan = new Set(campanas.filter((c) => c.spendMicros > 0).map((c) => c.provider));
  const sin = new Map<string, number>();
  for (const c of campanas) if (!gastan.has(c.provider)) sin.set(c.provider, (sin.get(c.provider) ?? 0) + 1);
  return [...sin].map(([provider, campanas]) => ({ provider, campanas })).sort((a, b) => b.campanas - a.campanas);
}

/** Cuánto pesa la campaña que más gasta: si concentra casi todo, el resto apenas importa. */
export function concentracion(d: DistribucionDelGasto): number {
  return d.topCampanas[0]?.fraccion ?? 0;
}
