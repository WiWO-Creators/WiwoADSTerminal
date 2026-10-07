/**
 * Lee las reglas NATIVAS de Meta («Reglas automatizadas» del Ads Manager) y las traduce a nuestras reglas.
 * Solo lectura: nunca se modifica una regla de Meta. Parte pura, sin red.
 */
import type { AccionDeRegla, MetricaDeRegla, OperadorDeRegla, PeriodoDeRegla } from "@/lib/reglas-automaticas-pura";

type Filtro = { field?: string; value?: unknown; operator?: string };
export type ReglaNativaCruda = {
  id: string;
  name?: string;
  status?: string;
  evaluation_spec?: { filters?: Filtro[] };
  execution_spec?: { execution_type?: string };
  schedule_spec?: unknown;
};

export type DefinicionDeRegla = { metrica: MetricaDeRegla; operador: OperadorDeRegla; umbral: number; periodo: PeriodoDeRegla; accion: AccionDeRegla };

export type ReglaDeMeta = {
  id: string;
  nombre: string;
  estado: string;
  /** Qué mira: AD, ADSET o CAMPAIGN. */
  nivel: string | null;
  /** Cuántas entidades vigila hoy (si su lista es fija). */
  entidadesCubiertas: number | null;
  /** En palabras: qué hace la regla. */
  descripcion: string;
  /** Su equivalente en una regla propia; `null` si no se puede copiar. */
  definicion: DefinicionDeRegla | null;
  motivo: string | null;
};

/** Monedas cuyo importe en Meta va en centavos (÷100) o enteros (÷1). Otras: no se traduce para no equivocarse. */
const DIVISOR: Record<string, number> = {
  USD: 100, EUR: 100, GBP: 100, MXN: 100, ARS: 100, BRL: 100, PEN: 100, CAD: 100, AUD: 100,
  CLP: 1, JPY: 1, KRW: 1, VND: 1, PYG: 1, ISK: 1,
};

const PERIODO: Record<string, PeriodoDeRegla> = {
  MAXIMUM: "total", LIFETIME: "total", TODAY: "hoy", LAST_7D: "ultimos_7", LAST_7_DAYS: "ultimos_7", THIS_MONTH: "mes_actual",
};
const OPERADOR: Record<string, OperadorDeRegla> = {
  GREATER_THAN: ">=", GREATER_THAN_OR_EQUAL: ">=", LESS_THAN: "<=", LESS_THAN_OR_EQUAL: "<=",
};
const METRICA: Record<string, { metrica: MetricaDeRegla; dinero: boolean }> = {
  spent: { metrica: "gasto", dinero: true },
  cpc: { metrica: "cpc", dinero: true },
  ctr: { metrica: "ctr", dinero: false },
  frequency: { metrica: "frecuencia", dinero: false },
};
const ACCION: Record<string, AccionDeRegla> = { PAUSE: "pausar", NOTIFICATION: "avisar" };

export function interpretarReglaMeta(cruda: ReglaNativaCruda, moneda: string | null): ReglaDeMeta {
  const filtros = cruda.evaluation_spec?.filters ?? [];
  const f = (campo: string) => filtros.find((x) => x.field === campo);
  const nivel = typeof f("entity_type")?.value === "string" ? String(f("entity_type")!.value) : null;
  const lista = f("ad.id") ?? f("adset.id") ?? f("campaign.id");
  const cubiertas = Array.isArray(lista?.value) ? (lista!.value as unknown[]).length : null;
  const base = { id: cruda.id, nombre: cruda.name ?? cruda.id, estado: cruda.status ?? "?", nivel, entidadesCubiertas: cubiertas };

  const condicion = filtros.find((x) => x.field && x.field in METRICA);
  const accion = ACCION[cruda.execution_spec?.execution_type ?? ""];
  const periodo = PERIODO[String(f("time_preset")?.value ?? "")];
  const operador = OPERADOR[condicion?.operator ?? ""];
  const m = condicion?.field ? METRICA[condicion.field] : undefined;
  const crudo = Number(condicion?.value);

  const sinTraduccion = (motivo: string): ReglaDeMeta => ({ ...base, descripcion: `Regla de Meta con condiciones que no se pueden copiar (${motivo}).`, definicion: null, motivo });
  if (!condicion || !m || !operador || !Number.isFinite(crudo)) return sinTraduccion("condición no soportada");
  if (!accion) return sinTraduccion(`acción ${cruda.execution_spec?.execution_type ?? "desconocida"}`);
  if (!periodo) return sinTraduccion("periodo no soportado");
  let umbral = crudo;
  if (m.dinero) {
    const divisor = DIVISOR[(moneda ?? "").toUpperCase()];
    if (!divisor) return sinTraduccion(`moneda ${moneda ?? "desconocida"}`);
    umbral = crudo / divisor;
  }
  const unidad = m.dinero ? ` ${moneda}` : m.metrica === "ctr" ? " %" : "";
  const etiquetaPeriodo = { total: "en total", hoy: "hoy", ultimos_7: "en los últimos 7 días", mes_actual: "este mes" }[periodo];
  return {
    ...base,
    descripcion: `Si ${m.metrica} ${operador === ">=" ? "supera" : "baja de"} ${umbral}${unidad} ${etiquetaPeriodo}: ${accion === "pausar" ? "pausa" : "avisa"}${nivel ? ` (${nivel === "AD" ? "anuncios" : nivel === "ADSET" ? "conjuntos" : "campañas"})` : ""}.`,
    definicion: { metrica: m.metrica, operador, umbral, periodo, accion },
    motivo: nivel === "AD" ? null : "Esta regla no vigila anuncios, así que no se puede asignar a uno.",
  };
}

/**
 * Parámetros para crear en Meta una COPIA de una regla, vigilando solo el anuncio dado. La regla original no se toca:
 * la copia conserva su condición, su acción y su horario; solo cambia el nombre y la lista de anuncios.
 */
export function copiaDeReglaParaAnuncio(cruda: ReglaNativaCruda, anuncio: string | string[], nombre: string): Record<string, string | object> {
  const anuncioIds = Array.isArray(anuncio) ? anuncio : [anuncio];
  const filtros = (cruda.evaluation_spec?.filters ?? []).filter((f) => f.field !== "ad.id" && f.field !== "adset.id" && f.field !== "campaign.id");
  filtros.push({ field: "ad.id", value: anuncioIds, operator: "IN" });
  const params: Record<string, string | object> = {
    name: nombre.slice(0, 100),
    status: "ENABLED",
    evaluation_spec: { ...(cruda.evaluation_spec ?? {}), filters: filtros },
    execution_spec: cruda.execution_spec ?? {},
  };
  if (cruda.schedule_spec) params.schedule_spec = cruda.schedule_spec;
  return params;
}

/** Monedas cuyo importe en Meta va en centavos o enteros; `null` si no se conoce (no se adivina). */
export function divisorDeMoneda(moneda: string | null): number | null {
  return DIVISOR[(moneda ?? "").toUpperCase()] ?? null;
}

/**
 * Parámetros para crear en Meta una regla NUEVA «si un anuncio de la lista gasta más de X en total, pausarlo»
 * (el mismo tipo que `highquality`). El importe se da en la moneda de la cuenta y se convierte a la unidad de Meta.
 */
export function especificacionDeReglaDeGasto(o: { nombre: string; anuncioIds: string[]; gasto: number; moneda: string | null; programacion?: string }): Record<string, string | object> {
  const divisor = divisorDeMoneda(o.moneda);
  if (!divisor) throw new Error(`No conozco la unidad de la moneda ${o.moneda ?? "desconocida"}: no se crea la regla para no equivocar el importe.`);
  if (!(o.gasto > 0)) throw new Error("El gasto máximo debe ser mayor que cero.");
  if (o.anuncioIds.length === 0) throw new Error("La regla necesita al menos un anuncio.");
  return {
    name: o.nombre.slice(0, 100),
    status: "ENABLED",
    evaluation_spec: {
      evaluation_type: "SCHEDULE",
      filters: [
        { field: "entity_type", value: "AD", operator: "EQUAL" },
        { field: "time_preset", value: "MAXIMUM", operator: "EQUAL" },
        { field: "spent", value: Math.round(o.gasto * divisor), operator: "GREATER_THAN" },
        { field: "ad.id", value: o.anuncioIds, operator: "IN" },
      ],
    },
    execution_spec: { execution_type: "PAUSE" },
    schedule_spec: { schedule_type: o.programacion ?? "SEMI_HOURLY" },
  };
}

/** Elige una regla por nombre (sin importar mayúsculas, tildes ni espacios). */
export function buscarReglaPorNombre<T extends { nombre: string }>(reglas: T[], texto: string): { unica: T | null; candidatas: T[] } {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const q = norm(texto);
  if (!q) return { unica: null, candidatas: [] };
  const exactas = reglas.filter((r) => norm(r.nombre) === q);
  if (exactas.length === 1) return { unica: exactas[0], candidatas: exactas };
  const candidatas = reglas.filter((r) => norm(r.nombre).includes(q));
  return { unica: candidatas.length === 1 ? candidatas[0] : null, candidatas };
}
