/**
 * Cuánto presupuesto hay disponible AHORA y qué conviene hacer con eso: lo que se gastó en el periodo elegido, lo que sobra y una
 * recomendación (seguir, subir presupuesto o añadir más). Responde de inmediato a «si pausamos todo y armamos una campaña nueva,
 * ¿con cuánto?». Puro (sin red) para probarlo solo. Montos en micros, como en el resto del sistema; las monedas nunca se mezclan.
 */
import { diasDelMes, type ResumenPresupuesto } from "@/lib/presupuesto";
import type { TotalDePresupuesto } from "@/lib/presupuesto-entidades";

export type EntradaDeInversion = {
  moneda: string;
  /** Gastado en el periodo que la persona eligió (puede ser distinto del mes). */
  gastadoPeriodoMicros: number;
  /** El presupuesto mensual de la ficha contra el gasto del mes, si el cliente lo tiene en esta moneda. */
  ficha: ResumenPresupuesto | null;
  /** Lo asignado a las campañas (en esta moneda), si se pudo leer. */
  campanas: TotalDePresupuesto | null;
  hoy: Date;
};

export type NivelDeInversion = "ok" | "atencion" | "agregar" | "sin_datos";

export type SituacionDeInversion = {
  /** De dónde sale lo que sobra: del presupuesto mensual acordado o de lo asignado a las campañas. */
  origen: "ficha" | "campanas" | null;
  disponibleMicros: number | null;
  /** Lo que se puede gastar por día hasta fin de mes sin pasarse. */
  porDiaMicros: number | null;
  diasRestantes: number;
  nivel: NivelDeInversion;
  titulo: string;
  recomendacion: string;
  /** Qué pasa si se pausa todo hoy (cuánto queda para una campaña nueva). */
  siSePausaTodo: string | null;
};

export function dineroDe(micros: number, moneda: string): string {
  const valor = micros / 1_000_000;
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(valor);
  } catch {
    return `${moneda} ${Math.round(valor).toLocaleString("es-CL")}`;
  }
}

export function situacionDeInversion(e: EntradaDeInversion): SituacionDeInversion {
  const { moneda, ficha, campanas, hoy } = e;
  const diasRestantes = Math.max(1, ficha ? Math.max(ficha.diasRestantes, 1) : diasDelMes(hoy) - hoy.getUTCDate());
  const $ = (m: number) => dineroDe(m, moneda);

  const origen: SituacionDeInversion["origen"] = ficha ? "ficha" : campanas ? "campanas" : null;
  const restante = ficha ? ficha.restanteMicros : campanas ? campanas.restanteMicros : null;
  if (origen === null || restante === null) {
    return {
      origen: null,
      disponibleMicros: null,
      porDiaMicros: null,
      diasRestantes,
      nivel: "sin_datos",
      titulo: "Sin presupuesto cargado",
      recomendacion: "No hay presupuesto mensual en la ficha ni presupuesto en las campañas, así que no se puede saber cuánto queda. Cárgalo en Cliente → Ficha del cliente.",
      siSePausaTodo: null,
    };
  }

  const disponible = Math.max(0, restante);
  const porDia = disponible / diasRestantes;
  const dias = `${diasRestantes} ${diasRestantes === 1 ? "día" : "días"}`;
  const pausaTodo = disponible > 0
    ? `Si pausas todo hoy, no se gasta nada más y quedan ${$(disponible)} para una campaña nueva: alcanza para ${$(porDia)} por día durante los ${dias} que quedan del mes.`
    : "Si pausas todo hoy no se libera presupuesto: ya no queda nada disponible este mes.";
  const base = { origen, disponibleMicros: disponible, porDiaMicros: porDia, diasRestantes, siSePausaTodo: pausaTodo };

  if (ficha) {
    switch (ficha.estado) {
      case "excedido":
        return { ...base, nivel: "agregar", titulo: "Ya se pasó del presupuesto del mes", recomendacion: `Va ${$(-ficha.restanteMicros)} por encima de lo acordado. Para seguir invirtiendo hay que acordar más presupuesto con el cliente; mientras tanto conviene pausar o bajar el gasto.` };
      case "agotado":
        return { ...base, nivel: "agregar", titulo: "Casi no queda presupuesto", recomendacion: `Quedan ${$(disponible)} para ${dias}. Si hay que lanzar algo nuevo, conviene añadir presupuesto (acordarlo con el cliente) o pausar lo que menos rinde para repartir lo que queda.` };
      case "adelantado":
        return { ...base, nivel: "atencion", titulo: "Va a pasarse del presupuesto", recomendacion: `Al ritmo de hoy terminaría el mes en ${$(ficha.proyeccionMicros)} contra ${$(ficha.presupuestoMicros)} acordados. Baja el gasto diario a ${$(ficha.disponibleDiarioMicros)} o menos, o acuerda más presupuesto si el rendimiento lo justifica.` };
      case "atrasado":
        return { ...base, nivel: "ok", titulo: "Hay margen para invertir más", recomendacion: `Va por debajo de lo acordado: quedan ${$(disponible)}. Puedes subir el presupuesto de lo que mejor rinde o lanzar una campaña nueva de hasta ${$(porDia)} por día.` };
      default:
        return { ...base, nivel: "ok", titulo: "Va en ritmo", recomendacion: `Quedan ${$(disponible)} del presupuesto mensual (${$(porDia)} por día hasta fin de mes). No hace falta añadir presupuesto.` };
    }
  }

  // Sin presupuesto mensual en la ficha: solo se sabe lo asignado a las campañas.
  if (disponible === 0) {
    return { ...base, nivel: "agregar", titulo: "Lo asignado a las campañas ya se gastó", recomendacion: "Las campañas con presupuesto total llegaron a su tope: si deben seguir, hay que añadir presupuesto. Carga el presupuesto mensual en la ficha para comparar contra lo acordado con el cliente." };
  }
  return { ...base, nivel: "ok", titulo: "Queda presupuesto asignado", recomendacion: `Quedan ${$(disponible)} asignados a las campañas. Carga el presupuesto mensual en la ficha del cliente para saber también si conviene añadir más o ya se está cubriendo lo acordado.` };
}

/** Gasto del periodo por moneda, sumando las campañas dadas. */
export function gastoPorMoneda(campanas: Array<{ spendMicros: number; currency: string | null }>): Record<string, number> {
  const salida: Record<string, number> = {};
  for (const c of campanas) {
    const moneda = c.currency ?? "—";
    salida[moneda] = (salida[moneda] ?? 0) + (c.spendMicros || 0);
  }
  return salida;
}
