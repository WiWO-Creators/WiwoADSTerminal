/**
 * Estrategia a partir de un brief: dado un presupuesto, un objetivo y unas fechas, recomienda cómo repartir la
 * plata entre plataformas y canales según lo que cada uno le costó a ESE cliente por resultado, y proyecta qué
 * podría dar (con escenarios y avance por semana). Puro (sin red ni base de datos).
 *
 * Es una recomendación, no una decisión: el modelo propone y una persona decide. Los números salen del mismo
 * historial real que usa `proyectar` (lib/simulador.ts); aquí solo se elige el reparto y se cuenta la historia.
 *
 * Criterio del reparto, y por qué:
 *  - Cada canal pesa en proporción a cuántos resultados da por peso (1 / costo por resultado): el que da más por
 *    la misma plata recibe más.
 *  - Ningún canal pasa del doble de lo que ya invertía por día: más allá, cada resultado suele costar más
 *    (rendimientos decrecientes) y la proyección deja de ser confiable. Lo que sobra va al siguiente mejor.
 *  - Un canal que no alcanza su mínimo operativo para esos días se descarta y su parte se reparte.
 *  - Si ningún canal mide resultados, se reparte por impresiones por peso (menor CPM).
 */
import {
  ajustarAMinimosPorPlataforma,
  minimoDelCanalMicros,
  proyectar,
  UMBRALES_SIMULADOR,
  type FilaHistorial,
  type Historial,
  type PlanSimulado,
  type Proyeccion,
  type Rango,
} from "./simulador";

/* -------------------------------------------------------------------------- */
/* 1. Interpretar el brief                                                     */
/* -------------------------------------------------------------------------- */

export type BriefInterpretado = {
  /** LDS, VTA, TRF, AE u OCV, según las palabras del brief. */
  objetivo: string | null;
  montoMicros: number | null;
  /** Moneda si el brief la nombra («USD», «$» no cuenta: no distingue peso de dólar). */
  moneda: string | null;
  dias: number | null;
  /** aaaa-mm-dd. */
  inicio: string | null;
  fin: string | null;
  /** Lo que se entendió, en palabras, para que la persona lo confirme. */
  pistas: string[];
};

const OBJETIVOS_POR_PALABRA: Array<[string, RegExp]> = [
  ["LDS", /\b(leads?|formularios?|prospectos?|contactos?|cotizaci[oó]n(es)?|registros?|captaci[oó]n)\b/i],
  ["VTA", /\b(ventas?|compras?|e-?commerce|tienda|ingresos?|roas|conversiones de compra)\b/i],
  ["OCV", /\b(mensajes?|whatsapp|conversaciones?|chats?|dm)\b/i],
  ["TRF", /\b(tr[aá]fico|visitas?|clics?|clicks?|sesiones|landing)\b/i],
  ["AE", /\b(alcance|awareness|reconocimiento|marca|branding|engagement|interacci[oó]n|interacciones|visibilidad|notoriedad|video views|reproducciones)\b/i],
];

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const ultimoDia = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Suma días a una fecha aaaa-mm-dd (UTC, sin sorpresas de horario de verano). */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Días entre dos fechas aaaa-mm-dd, contando ambas (del 1 al 15 son 15). */
export function diasEntre(inicio: string, fin: string): number {
  const a = new Date(`${inicio}T00:00:00Z`).getTime();
  const b = new Date(`${fin}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/** «200.000», «1,5», «1.500», «200000» → número. El punto agrupa miles y la coma es decimal, como en es-CL. */
function numeroDe(texto: string): number | null {
  let t = texto.trim();
  if (!t) return null;
  if (t.includes(".") && t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(".")) t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function interpretarMonto(texto: string): { micros: number; moneda: string | null; pista: string } | null {
  const patron = /(?:(us\$|usd|clp|eur|pen|cop|mxn|\$)\s*)?(\d[\d.,]*)\s*(mil(?:lones)?|millones|millón|millon|k|m)?\s*(usd|clp|d[oó]lares|pesos)?/gi;
  let mejor: { valor: number; moneda: string | null; fuerte: boolean } | null = null;
  for (const m of texto.matchAll(patron)) {
    const base = numeroDe(m[2]);
    if (base === null) continue;
    const unidad = (m[3] ?? "").toLowerCase();
    const factor = /^mil$|^k$/.test(unidad) ? 1_000 : /mill/.test(unidad) || unidad === "m" ? 1_000_000 : 1;
    const valor = base * factor;
    const simbolo = (m[1] ?? "").toLowerCase();
    const sufijo = (m[4] ?? "").toLowerCase();
    const moneda = /us\$|usd|d[oó]lares/.test(simbolo + sufijo) ? "USD" : /clp|pesos/.test(simbolo + sufijo) ? "CLP" : /eur/.test(simbolo) ? "EUR" : null;
    const fuerte = Boolean(simbolo) || factor > 1 || Boolean(sufijo);
    // Un número suelto chico (un día, un porcentaje) no es un presupuesto.
    if (!fuerte && valor < 5_000) continue;
    if (valor < 100) continue;
    // Prefiere el que trae símbolo o unidad; entre iguales, el primero.
    if (!mejor || (fuerte && !mejor.fuerte)) mejor = { valor, moneda, fuerte };
  }
  return mejor
    ? { micros: Math.round(mejor.valor * 1_000_000), moneda: mejor.moneda, pista: `Presupuesto: ${Math.round(mejor.valor).toLocaleString("es-CL")}${mejor.moneda ? ` ${mejor.moneda}` : ""}` }
    : null;
}

/** Lee del brief el objetivo, el monto y las fechas. Lo que no encuentra queda en `null`: no se inventa. */
export function interpretarBrief(texto: string, hoy: Date): BriefInterpretado {
  const t = texto.replace(/\s+/g, " ");
  const pistas: string[] = [];
  const anioActual = hoy.getUTCFullYear();
  const hoyIso = hoy.toISOString().slice(0, 10);

  let objetivo: string | null = null;
  for (const [codigo, patron] of OBJETIVOS_POR_PALABRA) {
    if (patron.test(t)) {
      objetivo = codigo;
      break;
    }
  }
  if (objetivo) pistas.push(`Objetivo: ${objetivo}`);

  const monto = interpretarMonto(t);
  if (monto) pistas.push(monto.pista);

  let inicio: string | null = null;
  let fin: string | null = null;
  let dias: number | null = null;
  const mes = "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";
  // El año: si el mes ya pasó este año, se entiende el próximo.
  const anioDe = (m: number, d: number) => (iso(anioActual, m, d) < hoyIso ? anioActual + 1 : anioActual);

  const rango = new RegExp(`del (\\d{1,2}) al (\\d{1,2}) de ${mes}`, "i").exec(t);
  if (rango) {
    const m = MESES[rango[3].toLowerCase()];
    const a = anioDe(m, Number(rango[2]));
    inicio = iso(a, m, Number(rango[1]));
    fin = iso(a, m, Math.min(Number(rango[2]), ultimoDia(a, m)));
  }
  if (!fin) {
    const mitad = new RegExp(`(mitad|mediados) de ${mes}`, "i").exec(t);
    if (mitad) {
      const m = MESES[mitad[2].toLowerCase()];
      fin = iso(anioDe(m, 15), m, 15);
    }
  }
  if (!fin) {
    const finDe = new RegExp(`(fin(?:es|al)?|fines) de ${mes}`, "i").exec(t);
    if (finDe) {
      const m = MESES[finDe[2].toLowerCase()];
      const a = anioDe(m, 28);
      fin = iso(a, m, ultimoDia(a, m));
    }
  }
  if (!fin) {
    const hasta = new RegExp(`(?:hasta(?: el)?|al|para el) (\\d{1,2}) de ${mes}`, "i").exec(t);
    if (hasta) {
      const m = MESES[hasta[2].toLowerCase()];
      fin = iso(anioDe(m, Number(hasta[1])), m, Number(hasta[1]));
    }
  }
  if (!fin && /\beste mes\b/i.test(t)) fin = iso(anioActual, hoy.getUTCMonth() + 1, ultimoDia(anioActual, hoy.getUTCMonth() + 1));

  if (fin) {
    inicio = inicio ?? hoyIso;
    if (fin < inicio) fin = null;
  }
  if (fin && inicio) {
    dias = diasEntre(inicio, fin);
    pistas.push(`Fechas: del ${inicio} al ${fin} (${dias} días)`);
  } else {
    const durante = /(\d{1,3})\s*(d[ií]as?|semanas?|meses|mes)\b/i.exec(t);
    if (durante) {
      const n = Number(durante[1]);
      const unidad = durante[2].toLowerCase();
      dias = /semana/.test(unidad) ? n * 7 : /mes/.test(unidad) ? n * 30 : n;
      inicio = hoyIso;
      fin = sumarDias(hoyIso, dias - 1);
      pistas.push(`Duración: ${dias} días desde hoy`);
    }
  }

  return { objetivo, montoMicros: monto?.micros ?? null, moneda: monto?.moneda ?? null, dias, inicio, fin, pistas };
}

/* -------------------------------------------------------------------------- */
/* 2. Recomendar el reparto                                                    */
/* -------------------------------------------------------------------------- */

export type RazonDeReparto = {
  provider: string;
  canal: string | null;
  fraccion: number;
  costoPorResultadoMicros: number | null;
  /** Por qué recibe esa parte, en una frase. */
  motivo: string;
};

export type Recomendacion = {
  reparto: Array<{ provider: string; canal: string | null; fraccion: number }>;
  razones: RazonDeReparto[];
  avisos: string[];
};

type Candidato = {
  provider: string;
  canal: string | null;
  fila: FilaHistorial;
  costoPorResultado: number | null;
  /** true: el costo por resultado es el de la plataforma entera, no el del canal. */
  heredado: boolean;
  cpm: number;
  peso: number;
  tope: number;
};

export function recomendarReparto(
  historial: Historial,
  entrada: { montoMicros: number; dias: number; objetivo: string; campanas?: number; tasaPorUsd?: number | null },
): Recomendacion {
  const avisos: string[] = [];
  const filas = historial.filas.filter((f) => f.objetivo === entrada.objetivo && f.gastoMicros > 0 && f.impresiones > 0);
  const porPlataforma = new Map<string, FilaHistorial[]>();
  for (const f of filas) porPlataforma.set(f.provider, [...(porPlataforma.get(f.provider) ?? []), f]);

  const candidatos: Candidato[] = [];
  for (const [provider, lista] of porPlataforma) {
    const general = lista.find((f) => !f.canal) ?? null;
    const porCanal = lista.filter((f) => f.canal);
    // Si hay lectura por canal, se reparte por canal; si no, la plataforma entera.
    const fuentes = porCanal.length > 0 ? porCanal : general ? [general] : [];
    for (const fila of fuentes) {
      const propio = fila.resultados !== null && fila.resultados > 0 ? fila.gastoMicros / fila.resultados : null;
      const deLaPlataforma = general && general.resultados !== null && general.resultados > 0 ? general.gastoMicros / general.resultados : null;
      const costo = propio ?? (fila.canal ? deLaPlataforma : null);
      candidatos.push({
        provider,
        canal: fila.canal ?? null,
        fila,
        costoPorResultado: costo,
        heredado: propio === null && costo !== null,
        cpm: (fila.gastoMicros / fila.impresiones) * 1000,
        peso: 0,
        // Hasta el doble de lo que ya se invertía por día (rendimientos decrecientes más allá).
        tope: (fila.gastoMicros / Math.max(1, historial.dias)) * UMBRALES_SIMULADOR.ESCALA_AVISO * entrada.dias,
      });
    }
  }

  if (candidatos.length === 0) {
    return { reparto: [], razones: [], avisos: ["Este cliente no tiene historial para este objetivo: no hay con qué recomendar un reparto."] };
  }

  const conResultados = candidatos.filter((c) => c.costoPorResultado !== null);
  const porResultados = conResultados.length > 0;
  for (const c of candidatos) {
    c.peso = porResultados ? (c.costoPorResultado !== null ? 1 / c.costoPorResultado : 0) : 1 / c.cpm;
  }
  if (!porResultados) {
    avisos.push("Ningún canal de este cliente mide resultados para este objetivo: el reparto se hace por impresiones por peso (menor CPM).");
  }

  // Reparto «por llenado»: cada canal recibe según su peso, pero no más que su tope; lo que sobra va a los demás.
  const asignado = new Map<Candidato, number>();
  let activos = candidatos.filter((c) => c.peso > 0);
  let restante = entrada.montoMicros;
  for (let vuelta = 0; vuelta < candidatos.length + 1 && activos.length > 0 && restante > 1; vuelta += 1) {
    const sumaPesos = activos.reduce((s, c) => s + c.peso, 0);
    const pasados = activos.filter((c) => (restante * c.peso) / sumaPesos > c.tope - (asignado.get(c) ?? 0));
    if (pasados.length === 0) {
      for (const c of activos) asignado.set(c, (asignado.get(c) ?? 0) + (restante * c.peso) / sumaPesos);
      restante = 0;
      break;
    }
    for (const c of pasados) {
      const lugar = Math.max(0, c.tope - (asignado.get(c) ?? 0));
      asignado.set(c, (asignado.get(c) ?? 0) + lugar);
      restante -= lugar;
    }
    activos = activos.filter((c) => !pasados.includes(c));
  }
  let sobreescala = false;
  if (restante > 1) {
    // Todos llegaron a su tope y aún sobra plata: va a los mejores igual, y se avisa.
    sobreescala = true;
    const todos = candidatos.filter((c) => c.peso > 0);
    const suma = todos.reduce((s, c) => s + c.peso, 0);
    for (const c of todos) asignado.set(c, (asignado.get(c) ?? 0) + (restante * c.peso) / suma);
  }

  // En fracciones y sin repartos bajo su mínimo para esa duración.
  const total = [...asignado.values()].reduce((s, v) => s + v, 0);
  const pesos: Record<string, number> = {};
  const minimosPct: Record<string, number> = {};
  const plataformaDe: Record<string, string> = {};
  const clave = (c: Candidato) => `${c.provider}|${c.canal ?? ""}`;
  for (const c of candidatos) {
    pesos[clave(c)] = total > 0 ? ((asignado.get(c) ?? 0) / total) * 100 : 0;
    plataformaDe[clave(c)] = c.provider;
    // El mínimo es de la plataforma (su conjunto de anuncios), no de cada ubicación.
    const min = minimoDelCanalMicros(c.provider, historial.moneda, entrada.dias, entrada.objetivo, entrada.campanas ?? 1, entrada.tasaPorUsd);
    minimosPct[c.provider] = min !== null && entrada.montoMicros > 0 ? (min / entrada.montoMicros) * 100 : 0;
  }
  const ajustados = ajustarAMinimosPorPlataforma(pesos, plataformaDe, minimosPct);
  // Si nadie pudo absorber lo liberado, quedan plataformas bajo su mínimo: se descartan (si no alcanza, no rinde).
  let bajoMinimo = 0;
  for (const provider of new Set(candidatos.map((c) => c.provider))) {
    const claves = candidatos.filter((c) => c.provider === provider).map(clave);
    const suma = claves.reduce((acc, k) => acc + (ajustados[k] ?? 0), 0);
    if (suma > 1e-9 && suma + 1e-9 < minimosPct[provider]) {
      for (const k of claves) ajustados[k] = 0;
      bajoMinimo += 1;
    }
  }

  const reparto: Recomendacion["reparto"] = [];
  const razones: RazonDeReparto[] = [];
  const mejorCosto = Math.min(...conResultados.map((c) => c.costoPorResultado as number));
  for (const c of candidatos) {
    const fraccion = (ajustados[clave(c)] ?? 0) / 100;
    if (fraccion <= 0.0001) continue;
    reparto.push({ provider: c.provider, canal: c.canal, fraccion });
    let motivo: string;
    if (!porResultados) motivo = "Reparto por impresiones: es de los de menor costo por mil.";
    else if (c.costoPorResultado === null) motivo = "Sin resultados medidos; recibe lo que sobra.";
    else if (c.costoPorResultado === mejorCosto) motivo = "Es el que da cada resultado más barato.";
    else motivo = `Cada resultado le cuesta ${(c.costoPorResultado / mejorCosto).toFixed(1)} veces el del mejor canal.`;
    if (c.heredado) motivo += " (Costo estimado con el promedio de la plataforma.)";
    if ((asignado.get(c) ?? 0) >= c.tope - 1) motivo += " Llegó al doble de lo que ya invertía por día: más no sería confiable.";
    razones.push({ provider: c.provider, canal: c.canal, fraccion, costoPorResultadoMicros: c.costoPorResultado, motivo });
  }
  const sumaFracciones = reparto.reduce((s, r) => s + r.fraccion, 0);
  if (sumaFracciones > 0) for (const r of reparto) r.fraccion /= sumaFracciones;
  for (const r of razones) r.fraccion = reparto.find((x) => x.provider === r.provider && x.canal === r.canal)?.fraccion ?? r.fraccion;

  if (sobreescala) {
    avisos.push("El monto supera el doble de lo que este cliente ya invertía en estos canales: la proyección es optimista y cada resultado puede costar más.");
  }
  const descartados = candidatos.length - reparto.length;
  if (descartados > 0 && reparto.length > 0) {
    avisos.push(`${descartados} ${descartados === 1 ? "canal quedó fuera" : "canales quedaron fuera"}: sin resultados medidos o bajo el mínimo para ${entrada.dias} días.`);
  }
  if (reparto.length === 0 && bajoMinimo > 0) avisos.push("Ningún canal alcanza su mínimo con este monto y esta duración: sube el monto o reduce los días.");
  return { reparto, razones, avisos };
}

/* -------------------------------------------------------------------------- */
/* 3. Escenarios y avance por semana                                           */
/* -------------------------------------------------------------------------- */

export type Escenario = {
  /** 0,5 = la mitad del monto; 1 = el pedido; 2 = el doble. */
  factor: number;
  montoMicros: number;
  resultados: Rango | null;
  costoPorResultadoMicros: number | null;
};

/** Qué pasaría con otros montos, con el mismo reparto y los mismos días. */
export function escenarios(historial: Historial, plan: PlanSimulado, factores = [0.5, 1, 1.5, 2]): Escenario[] {
  return factores.map((factor) => {
    const monto = Math.round(plan.montoMicros * factor);
    const p = proyectar({ ...plan, montoMicros: monto }, historial);
    const central = p.total.resultados?.central ?? null;
    return {
      factor,
      montoMicros: monto,
      resultados: p.total.resultados,
      costoPorResultadoMicros: central && central > 0 ? monto / central : null,
    };
  });
}

export type SemanaProyectada = {
  desde: string;
  hasta: string;
  dias: number;
  gastoMicros: number;
  /** Resultados esperados en la semana (central) y acumulados al cierre de ella. */
  resultados: number | null;
  acumulados: number | null;
};

/** El gasto y los resultados esperados semana a semana, suponiendo un ritmo parejo. */
export function avancePorSemana(proyeccion: Proyeccion, dias: number, inicio: string): SemanaProyectada[] {
  const semanas: SemanaProyectada[] = [];
  const central = proyeccion.total.resultados?.central ?? null;
  let acumulado = 0;
  for (let corrido = 0; corrido < dias; corrido += 7) {
    const largo = Math.min(7, dias - corrido);
    const parte = largo / dias;
    acumulado += central !== null ? central * parte : 0;
    semanas.push({
      desde: sumarDias(inicio, corrido),
      hasta: sumarDias(inicio, corrido + largo - 1),
      dias: largo,
      gastoMicros: proyeccion.total.gastoMicros * parte,
      resultados: central !== null ? central * parte : null,
      acumulados: central !== null ? acumulado : null,
    });
  }
  return semanas;
}
