/**
 * Reúne lo que hace falta para decir, de un cliente, cuánto se invirtió y cuánto sobra de cada campaña y
 * conjunto (ver `lib/presupuesto-entidades.ts`): el presupuesto de cada una sale de la configuración que
 * entrega la plataforma (la misma lectura del editor) y el gasto, de los anuncios del mes y de los últimos 90
 * días. Solo lectura, acotado al alcance de quien pregunta.
 */
import { fetchDetalleDeCuenta } from "@/lib/detalle-entidad-store";
import type { Actor } from "@/lib/permisos";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { fetchWindsorDaily } from "@/lib/windsor";
import { historicoDeInversion, type HistoricoDeInversion } from "@/lib/presupuesto-historico";
import { puedeAdministrar } from "@/lib/plataformas";
import {
  presupuestoDeEntidad,
  totalDeEntidades,
  type EntradaDeEntidad,
  type PresupuestoDeEntidad,
  type TotalDePresupuesto,
} from "@/lib/presupuesto-entidades";
import { perteneceASegmento, type Segmento } from "@/lib/segmentos";

export type PresupuestoPorCampanas = {
  totales: TotalDePresupuesto[];
  entidades: PresupuestoDeEntidad[];
  /** Cuentas del cliente cuya configuración no se pudo leer (no se inventa su presupuesto). */
  cuentasSinLeer: string[];
};

export type PresupuestoDeSegmento = {
  id: string;
  nombre: string;
  totales: TotalDePresupuesto[];
  /** Gasto del mes en la moneda del presupuesto propio del segmento (para compararlo con él). */
  gastadoMesMicros: number;
};

export type PresupuestoDelCliente = PresupuestoPorCampanas & {
  /** Inversión mes a mes del año en curso. */
  historico: HistoricoDeInversion[];
  segmentos: PresupuestoDeSegmento[];
  /** Gasto del mes por moneda, de todo el cliente. */
  gastadoMesPorMoneda: Record<string, number>;
  /** Gasto del año en curso por moneda, de todo el cliente (a nivel de cuenta). */
  gastadoAnioPorMoneda: Record<string, number>;
};

type Fila = { campaignId: string | null; adsetId: string | null; spendMicros: number; accountKey: string };

const suma = (filas: Fila[], clave: "campaignId" | "adsetId"): Map<string, number> => {
  const mapa = new Map<string, number>();
  for (const f of filas) {
    const id = f[clave];
    if (id) mapa.set(id, (mapa.get(id) ?? 0) + f.spendMicros);
  }
  return mapa;
};

export async function presupuestoDelCliente(
  actor: Actor,
  portfolioId: string,
  segmentos: Segmento[],
  ahora: Date,
): Promise<PresupuestoDelCliente> {
  const [mes, noventa] = await Promise.all([
    getPerformanceSnapshot(actor, ahora, { incluirCampanas: false, incluirAnuncios: true, rango: "mes_actual" }),
    // La vida de una campaña con presupuesto total suele caber en 90 días; si no, la nota lo dice.
    getPerformanceSnapshot(actor, ahora, { incluirCampanas: false, incluirAnuncios: true, rango: "ultimos_90" }),
  ]);
  const cliente = mes.portfolios.find((p) => p.id === portfolioId);
  const cuentas = cliente?.accounts ?? [];
  const claves = new Set(cuentas.map((a) => a.id));
  const delCliente = (ads: typeof mes.ads) => ads.filter((a) => claves.has(a.accountKey));
  const adsMes = delCliente(mes.ads);
  const adsVida = delCliente(noventa.ads);

  const gastoMesCampana = suma(adsMes, "campaignId");
  const gastoMesConjunto = suma(adsMes, "adsetId");
  const gastoVidaCampana = suma(adsVida, "campaignId");
  const gastoVidaConjunto = suma(adsVida, "adsetId");

  const gastadoMesPorMoneda: Record<string, number> = {};
  for (const a of adsMes) {
    const moneda = a.currency ?? "—";
    gastadoMesPorMoneda[moneda] = (gastadoMesPorMoneda[moneda] ?? 0) + a.spendMicros;
  }

  // Mes a mes y no el año entero de una vez: la lectura diaria de todo el año es demasiado grande para guardarla en la
  // caché (D1 rechaza valores de más de ~1 MB) y fallaba. Cada mes cabe, se lee en paralelo y queda en caché por mes.
  let historico: HistoricoDeInversion[] = [];
  const gastadoAnioPorMoneda: Record<string, number> = {};
  try {
    const hoyIso = ahora.toISOString().slice(0, 10);
    const anioActual = Number(hoyIso.slice(0, 4));
    const mesesDelAnio = Array.from({ length: Number(hoyIso.slice(5, 7)) }, (_, i) => i + 1);
    const lecturas = await Promise.allSettled(
      mesesDelAnio.map((m) => {
        const mm = String(m).padStart(2, "0");
        const desde = `${anioActual}-${mm}-01`;
        const finDeMes = new Date(Date.UTC(anioActual, m, 0)).toISOString().slice(0, 10);
        return fetchWindsorDaily(desde, finDeMes < hoyIso ? finDeMes : hoyIso);
      }),
    );
    const filas = lecturas.flatMap((l) => (l.status === "fulfilled" ? l.value.rows : []));
    const falladas = lecturas.filter((l) => l.status === "rejected").length;
    if (falladas > 0) console.error("WiWO.ADS histórico de inversión: meses sin leer", falladas);
    historico = historicoDeInversion(filas, claves);
    for (const h of historico) gastadoAnioPorMoneda[h.moneda] = h.meses.reduce((suma, mes) => suma + mes.totalMicros, 0);
  } catch (error) {
    console.error("WiWO.ADS histórico de inversión", error instanceof Error ? error.message : error);
  }

  // La configuración de cada cuenta (en paralelo; ya se recuerda unos minutos en memoria).
  const cuentasSinLeer: string[] = [];
  const detalles = await Promise.all(
    cuentas
      .filter((a) => puedeAdministrar(a.provider))
      .map(async (a) => {
        const accountId = a.id.split(":").slice(2).join(":");
        try {
          return { cuenta: a, accountId, detalle: await fetchDetalleDeCuenta(a.provider, accountId) };
        } catch (error) {
          console.error("WiWO.ADS presupuesto por campaña: no se pudo leer", a.provider, accountId, error instanceof Error ? error.message : "error");
          cuentasSinLeer.push(a.name);
          return null;
        }
      }),
  );

  const entradas: EntradaDeEntidad[] = [];
  for (const d of detalles) {
    if (!d) continue;
    const moneda = d.cuenta.currency;
    for (const c of d.detalle.campanas) {
      entradas.push({
        nivel: "campana", id: c.id, nombre: c.nombre, provider: d.cuenta.provider, accountId: d.accountId, campaignId: null,
        estado: c.estado, moneda, presupuestoDiario: c.presupuesto.diario, presupuestoTotal: c.presupuesto.total,
        inicio: c.inicio, fin: c.fin,
        gastadoMesMicros: gastoMesCampana.get(c.id) ?? 0, gastadoVidaMicros: gastoVidaCampana.get(c.id) ?? null,
      });
    }
    for (const j of d.detalle.conjuntos) {
      entradas.push({
        nivel: "conjunto", id: j.id, nombre: j.nombre, provider: d.cuenta.provider, accountId: d.accountId, campaignId: j.campaignId,
        estado: j.estado, moneda, presupuestoDiario: j.presupuesto.diario, presupuestoTotal: j.presupuesto.total,
        inicio: j.inicio, fin: j.fin,
        gastadoMesMicros: gastoMesConjunto.get(j.id) ?? 0, gastadoVidaMicros: gastoVidaConjunto.get(j.id) ?? null,
      });
    }
  }

  // Solo lo que importa hoy: lo que está activo o gastó este mes (las terminadas hace tiempo no suman ruido).
  const entidades = entradas
    .map((e) => presupuestoDeEntidad(e, ahora))
    .filter((p) => p.activa || p.gastadoMesMicros > 0);

  const porSegmento = segmentos.map((s): PresupuestoDeSegmento => {
    const nombreDeCuenta = new Map(cuentas.map((a) => [a.id.split(":").slice(2).join(":"), a.name]));
    const enSegmento = (p: PresupuestoDeEntidad) =>
      perteneceASegmento({ provider: p.provider, accountId: p.accountId, textos: [nombreDeCuenta.get(p.accountId), p.nombre] }, s);
    const propias = entidades.filter(enSegmento);
    const gastadoMesMicros = adsMes
      .filter((a) => perteneceASegmento({ provider: a.provider, accountId: a.accountId, textos: [a.accountName, a.campaignName, a.adsetName, a.adName] }, s))
      .filter((a) => !s.presupuesto || (a.currency ?? "").toUpperCase() === s.presupuesto.moneda)
      .reduce((suma2, a) => suma2 + a.spendMicros, 0);
    return { id: s.id, nombre: s.nombre, totales: totalDeEntidades(propias), gastadoMesMicros };
  });

  return {
    totales: totalDeEntidades(entidades),
    entidades,
    cuentasSinLeer,
    segmentos: porSegmento,
    gastadoMesPorMoneda,
    gastadoAnioPorMoneda,
    historico,
  };
}
