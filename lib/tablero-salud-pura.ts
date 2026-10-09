/**
 * Los números del tablero de «Salud de medición» de un cliente. Puro: recibe las campañas del cliente en el periodo elegido y las
 * reparte por plataforma, por estado y por cuenta. Nada se inventa: cada número sale de las campañas que la plataforma entregó.
 */
export type CampanaDeTablero = {
  name: string;
  provider: string;
  status: string | null;
  accountKey: string;
  accountName: string;
  currency: string | null;
  spendMicros: number;
  objetivo: string | null;
};

export type EstadoDeTablero = "activa" | "pausada" | "otra";

export const ETIQUETA_DE_ESTADO: Record<EstadoDeTablero, string> = { activa: "Activas", pausada: "Pausadas", otra: "Sin estado informado" };

export function estadoDeTablero(status: string | null): EstadoDeTablero {
  const s = (status ?? "").toUpperCase();
  if (s === "ACTIVE" || s === "ENABLED") return "activa";
  if (s === "PAUSED") return "pausada";
  return "otra";
}

export type ResumenDeTablero = {
  total: number;
  porPlataforma: Array<{ provider: string; cantidad: number }>;
  porEstado: Array<{ estado: EstadoDeTablero; cantidad: number }>;
  /** Lo invertido por cuenta, de más a menos; la moneda es la de la cuenta (no se suman monedas distintas). */
  porCuenta: Array<{ id: string; nombre: string; provider: string; moneda: string | null; invertido: number }>;
  /** Campañas cuyo nombre no sigue la convención y por eso no tienen objetivo claro. */
  sinObjetivo: number;
  /** Las campañas que tiene cada objetivo (solo los que existen), activas primero y de más a menos inversión. `null`: sin objetivo claro. */
  porObjetivo: Array<{ objetivo: string | null; campanas: Array<{ nombre: string; estado: EstadoDeTablero; provider: string }> }>;
};

const ORDEN_DE_OBJETIVOS = ["AE", "VTA", "LDS", "TRF", "OCV"];

function agruparPorObjetivo(campanas: CampanaDeTablero[]): ResumenDeTablero["porObjetivo"] {
  const por = new Map<string | null, CampanaDeTablero[]>();
  for (const c of campanas) por.set(c.objetivo, [...(por.get(c.objetivo) ?? []), c]);
  const rango = (o: string | null) => (o === null ? 99 : ORDEN_DE_OBJETIVOS.indexOf(o) === -1 ? 98 : ORDEN_DE_OBJETIVOS.indexOf(o));
  return [...por.entries()]
    .sort((a, b) => rango(a[0]) - rango(b[0]))
    .map(([objetivo, lista]) => ({
      objetivo,
      campanas: [...lista]
        .sort((a, b) => Number(estadoDeTablero(b.status) === "activa") - Number(estadoDeTablero(a.status) === "activa") || b.spendMicros - a.spendMicros)
        .map((c) => ({ nombre: c.name, estado: estadoDeTablero(c.status), provider: c.provider })),
    }));
}

export function resumenDeTablero(campanas: CampanaDeTablero[]): ResumenDeTablero {
  const plataformas = new Map<string, number>();
  const estados = new Map<EstadoDeTablero, number>();
  const cuentas = new Map<string, { id: string; nombre: string; provider: string; moneda: string | null; invertido: number }>();
  for (const c of campanas) {
    plataformas.set(c.provider, (plataformas.get(c.provider) ?? 0) + 1);
    const e = estadoDeTablero(c.status);
    estados.set(e, (estados.get(e) ?? 0) + 1);
    const cuenta = cuentas.get(c.accountKey) ?? { id: c.accountKey, nombre: c.accountName, provider: c.provider, moneda: c.currency, invertido: 0 };
    cuenta.invertido += c.spendMicros / 1_000_000;
    cuentas.set(c.accountKey, cuenta);
  }
  return {
    total: campanas.length,
    porPlataforma: [...plataformas].map(([provider, cantidad]) => ({ provider, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
    porEstado: (["activa", "pausada", "otra"] as const).filter((e) => (estados.get(e) ?? 0) > 0).map((estado) => ({ estado, cantidad: estados.get(estado) ?? 0 })),
    porCuenta: [...cuentas.values()].sort((a, b) => b.invertido - a.invertido),
    sinObjetivo: campanas.filter((c) => c.objetivo === null).length,
    porObjetivo: agruparPorObjetivo(campanas),
  };
}
