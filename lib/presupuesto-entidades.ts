/**
 * Cuánto se ha invertido y cuánto sobra de CADA campaña y conjunto, y la suma para un cliente. Es la mirada
 * «de abajo hacia arriba»: no depende de que el cliente tenga un presupuesto mensual en su ficha.
 *
 * Dos tipos de presupuesto, que se leen distinto:
 *  - TOTAL (lifetime): un monto para toda la vida de la campaña. Restante = total − gastado desde que empezó.
 *  - DIARIO: un monto por día. No hay un «pozo» que se agote: lo que queda es lo que se gastaría hasta fin
 *    de mes si sigue activa (diario × días que faltan, contando hoy). Para sumar con los totales se toma
 *    como presupuesto del mes = gastado en el mes + lo que queda.
 *
 * Es puro (sin imports de la app) para poder probarlo solo. Los montos de entrada vienen en la moneda de la
 * cuenta (no micros); lo gastado, en micros, como en el resto del sistema.
 */
export type EntradaDeEntidad = {
  nivel: "campana" | "conjunto";
  id: string;
  nombre: string | null;
  provider: string;
  accountId: string;
  /** Campaña a la que pertenece (solo para conjuntos). */
  campaignId: string | null;
  estado: string | null;
  moneda: string | null;
  presupuestoDiario: number | null;
  presupuestoTotal: number | null;
  inicio: string | null;
  fin: string | null;
  /** Gasto del mes en curso, en micros. */
  gastadoMesMicros: number;
  /** Gasto desde que empezó (o en la ventana leída), en micros. `null`: no se pudo medir. */
  gastadoVidaMicros: number | null;
};

export type TipoDePresupuesto = "total" | "diario" | "sin_presupuesto";

export type PresupuestoDeEntidad = {
  nivel: "campana" | "conjunto";
  id: string;
  nombre: string | null;
  provider: string;
  accountId: string;
  campaignId: string | null;
  estado: string | null;
  moneda: string | null;
  activa: boolean;
  tipo: TipoDePresupuesto;
  /** Lo asignado: el total, o (diario) lo gastado en el mes más lo que queda del mes. */
  presupuestoMicros: number | null;
  /** Lo invertido contra ese presupuesto: desde el inicio (total) o en el mes (diario). */
  gastadoMicros: number;
  /** Lo gastado solo en el mes en curso (sirve para saber si la campaña sigue moviéndose). */
  gastadoMesMicros: number;
  /** Lo que sobra. Puede ser negativo si se pasó. `null` sin presupuesto. */
  restanteMicros: number | null;
  /** El presupuesto diario configurado, en micros (solo tipo diario). */
  diarioMicros: number | null;
  inicio: string | null;
  fin: string | null;
  /** Una frase corta que aclara lo que no sea obvio. */
  nota: string | null;
};

const ACTIVOS = /^(ACTIVE|ENABLED|LIVE|ACTIVA|ACTIVO)$/i;
export const estaActiva = (estado: string | null): boolean => ACTIVOS.test((estado ?? "").trim());

const aMicros = (monto: number | null): number | null =>
  monto !== null && Number.isFinite(monto) && monto > 0 ? Math.round(monto * 1_000_000) : null;

function diasDelMes(hoy: Date): number {
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0)).getUTCDate();
}

export function presupuestoDeEntidad(e: EntradaDeEntidad, hoy: Date): PresupuestoDeEntidad {
  const activa = estaActiva(e.estado);
  const base = {
    nivel: e.nivel,
    id: e.id,
    nombre: e.nombre,
    provider: e.provider,
    accountId: e.accountId,
    campaignId: e.campaignId,
    estado: e.estado,
    moneda: e.moneda,
    activa,
    inicio: e.inicio,
    fin: e.fin,
    gastadoMesMicros: e.gastadoMesMicros,
  };
  const total = aMicros(e.presupuestoTotal);
  const diario = aMicros(e.presupuestoDiario);

  if (total !== null) {
    const gastado = e.gastadoVidaMicros ?? e.gastadoMesMicros;
    return {
      ...base,
      tipo: "total",
      presupuestoMicros: total,
      gastadoMicros: gastado,
      restanteMicros: total - gastado,
      diarioMicros: null,
      nota: e.gastadoVidaMicros === null ? "Solo se midió el gasto de este mes." : null,
    };
  }
  if (diario !== null) {
    // Días que quedan del mes contando hoy; una campaña pausada o terminada ya no gasta más.
    const faltan = Math.max(0, diasDelMes(hoy) - hoy.getUTCDate() + 1);
    const finalizada = e.fin !== null && e.fin <= hoy.toISOString().slice(0, 10);
    const comprometido = activa && !finalizada ? diario * faltan : 0;
    return {
      ...base,
      tipo: "diario",
      presupuestoMicros: e.gastadoMesMicros + comprometido,
      gastadoMicros: e.gastadoMesMicros,
      restanteMicros: comprometido,
      diarioMicros: diario,
      nota: activa && !finalizada
        ? `Diario: queda lo que se gastaría hasta fin de mes (${faltan} ${faltan === 1 ? "día" : "días"}).`
        : "Pausada o terminada: no gasta más.",
    };
  }
  return {
    ...base,
    tipo: "sin_presupuesto",
    presupuestoMicros: null,
    gastadoMicros: e.gastadoMesMicros,
    restanteMicros: null,
    diarioMicros: null,
    nota: "Sin presupuesto propio: lo reparte la campaña o la plataforma.",
  };
}

export type TotalDePresupuesto = {
  moneda: string;
  presupuestoMicros: number;
  /** Invertido hasta hoy: desde que empezó cada campaña con presupuesto total; en el mes, las de presupuesto diario. */
  gastadoMicros: number;
  /** De lo anterior, lo gastado solo en el mes en curso (es lo que se compara con la inversión del mes). */
  gastadoMesMicros: number;
  restanteMicros: number;
  /** Cuántas campañas (o conjuntos, cuando la campaña no tiene presupuesto) entraron en la suma. */
  entidades: number;
};

/**
 * La suma por moneda de lo asignado a las campañas que cuentan: las activas o con gasto este mes. Si una
 * campaña no tiene presupuesto propio (Meta con presupuesto por conjunto), cuentan los de sus conjuntos.
 * Las monedas nunca se mezclan.
 */
export function totalDeEntidades(lista: PresupuestoDeEntidad[]): TotalDePresupuesto[] {
  // Una campaña pausada con gasto de hace meses ya no mueve plata: solo cuentan las activas o con gasto este mes.
  const cuenta = (p: PresupuestoDeEntidad) => p.presupuestoMicros !== null && (p.activa || p.gastadoMesMicros > 0);
  const campanas = lista.filter((p) => p.nivel === "campana");
  const conjuntos = lista.filter((p) => p.nivel === "conjunto");
  const elegidas: PresupuestoDeEntidad[] = [];
  for (const c of campanas) {
    if (c.presupuestoMicros !== null) {
      if (cuenta(c)) elegidas.push(c);
      continue;
    }
    // Sin presupuesto en la campaña: sus conjuntos.
    elegidas.push(...conjuntos.filter((j) => j.campaignId === c.id && cuenta(j)));
  }
  // Conjuntos cuya campaña no vino en la lectura: también cuentan, para no perderlos.
  const idsDeCampanas = new Set(campanas.map((c) => c.id));
  elegidas.push(...conjuntos.filter((j) => (j.campaignId === null || !idsDeCampanas.has(j.campaignId)) && cuenta(j)));

  const porMoneda = new Map<string, TotalDePresupuesto>();
  for (const p of elegidas) {
    const moneda = p.moneda ?? "—";
    const t = porMoneda.get(moneda) ?? { moneda, presupuestoMicros: 0, gastadoMicros: 0, gastadoMesMicros: 0, restanteMicros: 0, entidades: 0 };
    t.presupuestoMicros += p.presupuestoMicros ?? 0;
    t.gastadoMicros += p.gastadoMicros;
    t.gastadoMesMicros += p.gastadoMesMicros;
    t.restanteMicros += p.restanteMicros ?? 0;
    t.entidades += 1;
    porMoneda.set(moneda, t);
  }
  return [...porMoneda.values()].sort((a, b) => b.presupuestoMicros - a.presupuestoMicros);
}
