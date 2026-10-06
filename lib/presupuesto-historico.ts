/**
 * Inversión mes a mes de un cliente (puro: sin red ni base de datos, para poder probarlo).
 */
/** Lo invertido mes a mes en el año (el «importe gastado»), por plataforma y por moneda. */
export type HistoricoDeInversion = {
  moneda: string;
  meses: Array<{ mes: string; totalMicros: number; plataformas: Record<string, number> }>;
};

/**
 * Suma el gasto diario del año en curso por mes y plataforma, solo de las cuentas del cliente. Sale de la misma
 * lectura diaria que ya usa el tablero (queda en caché), así que no pide nada nuevo a Windsor si ya se leyó.
 */
export function historicoDeInversion(
  filas: Array<{ provider: string; accountId: string; currency: string | null; date: string; spendMicros: number }>,
  clavesDeCuenta: Set<string>,
): HistoricoDeInversion[] {
  const porMoneda = new Map<string, Map<string, { totalMicros: number; plataformas: Record<string, number> }>>();
  for (const f of filas) {
    if (!clavesDeCuenta.has(`windsor:${f.provider}:${f.accountId}`)) continue;
    if (!f.spendMicros) continue;
    const moneda = f.currency ?? "—";
    const mes = f.date.slice(0, 7);
    const meses = porMoneda.get(moneda) ?? new Map();
    const actual = meses.get(mes) ?? { totalMicros: 0, plataformas: {} };
    actual.totalMicros += f.spendMicros;
    actual.plataformas[f.provider] = (actual.plataformas[f.provider] ?? 0) + f.spendMicros;
    meses.set(mes, actual);
    porMoneda.set(moneda, meses);
  }
  return [...porMoneda.entries()].map(([moneda, meses]) => ({
    moneda,
    meses: [...meses.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, v]) => ({ mes, ...v })),
  }));
}

