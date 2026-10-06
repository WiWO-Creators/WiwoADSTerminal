/**
 * Presupuesto del mes de un cliente: cuánto queda, a qué ritmo va y cómo
 * cerraría. Puro (sin red ni base de datos).
 *
 * Todo sale de dos números: el presupuesto acordado y lo gastado en el mes
 * hasta hoy. La proyección asume que el ritmo diario promedio se mantiene; no
 * es una promesa, por eso solo se marca "adelantado" o "atrasado" cuando la
 * diferencia es clara y hay días suficientes para que el promedio diga algo.
 */
export type EstadoRitmo = "en_ritmo" | "adelantado" | "atrasado" | "agotado" | "excedido";

export const UMBRALES_PRESUPUESTO = {
  /** Proyección por sobre esta fracción del presupuesto = va a pasarse. */
  ADELANTADO: 1.1,
  /** Proyección por debajo de esta fracción = va a quedar corto. */
  ATRASADO: 0.8,
  /** Días transcurridos mínimos para opinar de un ritmo atrasado. */
  DIAS_MINIMOS_ATRASADO: 7,
  /** Gastado por sobre esta fracción del presupuesto = prácticamente agotado. */
  AGOTADO: 0.98,
} as const;

export type ResumenPresupuesto = {
  presupuestoMicros: number;
  gastadoMicros: number;
  restanteMicros: number;
  /** Fracción gastada del presupuesto (puede pasar de 1). */
  fraccionGastada: number;
  /** Fracción del mes que ya pasó: dónde «debería» ir el gasto. */
  fraccionDelMes: number;
  diasDelMes: number;
  diasTranscurridos: number;
  diasRestantes: number;
  ritmoDiarioMicros: number;
  /** Lo que se puede gastar por día desde hoy sin pasarse. */
  disponibleDiarioMicros: number;
  proyeccionMicros: number;
  estado: EstadoRitmo;
};

export function diasDelMes(hoy: Date): number {
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0)).getUTCDate();
}

export function calcularPresupuesto(
  presupuestoMicros: number | null | undefined,
  gastadoMicros: number,
  hoy: Date,
): ResumenPresupuesto | null {
  if (!presupuestoMicros || presupuestoMicros <= 0 || !Number.isFinite(gastadoMicros)) return null;
  const total = diasDelMes(hoy);
  const diaActual = hoy.getUTCDate();
  const transcurridos = Math.max(1, diaActual);
  const restantes = Math.max(0, total - diaActual);
  const gastado = Math.max(0, gastadoMicros);
  const restante = presupuestoMicros - gastado;
  const ritmo = gastado / transcurridos;
  const proyeccion = ritmo * total;
  // Los días que quedan incluyen el de hoy mientras no termine: sin ellos, el último día dividiría por cero.
  const diasParaGastar = Math.max(1, restantes);
  const disponible = restante > 0 ? restante / diasParaGastar : 0;

  let estado: EstadoRitmo = "en_ritmo";
  if (gastado > presupuestoMicros) estado = "excedido";
  else if (gastado >= UMBRALES_PRESUPUESTO.AGOTADO * presupuestoMicros) estado = "agotado";
  else if (proyeccion > UMBRALES_PRESUPUESTO.ADELANTADO * presupuestoMicros) estado = "adelantado";
  else if (
    transcurridos >= UMBRALES_PRESUPUESTO.DIAS_MINIMOS_ATRASADO &&
    proyeccion < UMBRALES_PRESUPUESTO.ATRASADO * presupuestoMicros
  ) {
    estado = "atrasado";
  }

  return {
    presupuestoMicros,
    gastadoMicros: gastado,
    restanteMicros: restante,
    fraccionGastada: gastado / presupuestoMicros,
    fraccionDelMes: transcurridos / total,
    diasDelMes: total,
    diasTranscurridos: transcurridos,
    diasRestantes: restantes,
    ritmoDiarioMicros: ritmo,
    disponibleDiarioMicros: disponible,
    proyeccionMicros: proyeccion,
    estado,
  };
}

export const ETIQUETA_RITMO: Record<EstadoRitmo, string> = {
  en_ritmo: "En ritmo",
  adelantado: "Va a pasarse",
  atrasado: "Va corto",
  agotado: "Casi agotado",
  excedido: "Excedido",
};
