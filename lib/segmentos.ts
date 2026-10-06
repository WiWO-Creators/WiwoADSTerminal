/**
 * Segmentos de un cliente: proyectos (Grupo Valor: Ébano, Corotú, Marea, Bijao) o mercados
 * (SQM: México, LATAM, Iberia; ALO Group: un país por cuenta). Un segmento no es una cuenta ni un
 * cliente aparte: es un filtro con nombre sobre lo que ya se lee. Se reconoce por palabras que
 * aparecen en el nombre de la cuenta, la campaña, el conjunto o el anuncio.
 *
 * Es puro (sin importar nada de la app) para poder probarlo solo.
 */
export type Segmento = {
  id: string;
  nombre: string;
  /** Palabras que lo identifican; basta con que aparezca una (sin distinguir mayúsculas ni tildes). */
  coincide: string[];
  /** Plataformas que lo forman («linkedin», «google», «meta»): Colbún Marketing es todo lo de LinkedIn. */
  plataformas: string[];
  /** Cuentas (ID de la plataforma) que lo forman. */
  cuentas: string[];
  /** Países ISO-2 que cubre, si aplica (informativo). */
  paises: string[];
  /** Presupuesto mensual propio del segmento, en micros de `moneda`. `null`: sin presupuesto propio. */
  presupuesto: { micros: number; moneda: string } | null;
};

/** Minúsculas y sin tildes: «Corotú» y «COROTU» son lo mismo. */
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** `{ micros, moneda }` bien formado y positivo; cualquier otra cosa es «sin presupuesto». */
function presupuestoValido(valor: unknown): Segmento["presupuesto"] {
  if (typeof valor !== "object" || valor === null) return null;
  const { micros, moneda } = valor as Record<string, unknown>;
  if (typeof micros !== "number" || !Number.isFinite(micros) || micros <= 0) return null;
  if (typeof moneda !== "string" || !/^[A-Za-z]{3}$/.test(moneda)) return null;
  return { micros: Math.round(micros), moneda: moneda.toUpperCase() };
}

/** Lee el JSON guardado en la base; una entrada mal formada se descarta en vez de romper la pantalla. */
export function parsearSegmentos(json: string | null | undefined): Segmento[] {
  if (!json) return [];
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  const resultado: Segmento[] = [];
  for (const item of datos) {
    if (typeof item !== "object" || item === null) continue;
    const { id, nombre, coincide, paises, plataformas, cuentas, presupuesto } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof nombre !== "string" || !id || !nombre) continue;
    const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && c.trim() !== "") : []);
    const palabras = textos(coincide);
    const lasPlataformas = textos(plataformas);
    const lasCuentas = textos(cuentas);
    // Sin ningún criterio no habría forma de saber qué le pertenece: se descarta.
    if (palabras.length === 0 && lasPlataformas.length === 0 && lasCuentas.length === 0) continue;
    resultado.push({
      id,
      nombre,
      coincide: palabras,
      plataformas: lasPlataformas,
      cuentas: lasCuentas,
      paises: Array.isArray(paises) ? paises.filter((p): p is string => typeof p === "string") : [],
      presupuesto: presupuestoValido(presupuesto),
    });
  }
  return resultado;
}

/** ¿Alguno de los textos (cuenta, campaña, conjunto, anuncio) nombra a este segmento? */
export function coincideConSegmento(textos: Array<string | null | undefined>, segmento: Segmento): boolean {
  const junto = normalizarTexto(textos.filter((t): t is string => Boolean(t)).join(" | "));
  return segmento.coincide.some((palabra) => junto.includes(normalizarTexto(palabra)));
}

/**
 * ¿Esta fila pertenece al segmento? Por plataforma, por cuenta o por palabras en sus nombres: basta con
 * que se cumpla una de las que el segmento declara.
 */
export function perteneceASegmento(
  fila: { provider?: string | null; accountId?: string | null; textos: Array<string | null | undefined> },
  segmento: Segmento,
): boolean {
  if (fila.provider && segmento.plataformas.includes(fila.provider)) return true;
  if (fila.accountId && segmento.cuentas.includes(fila.accountId)) return true;
  return segmento.coincide.length > 0 && coincideConSegmento(fila.textos, segmento);
}

/** Lo que se guarda en la base (solo los campos que cada segmento declara). */
export function serializarSegmentos(segmentos: Segmento[]): string {
  return JSON.stringify(
    segmentos.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      ...(s.coincide.length ? { coincide: s.coincide } : {}),
      ...(s.plataformas.length ? { plataformas: s.plataformas } : {}),
      ...(s.cuentas.length ? { cuentas: s.cuentas } : {}),
      ...(s.paises.length ? { paises: s.paises } : {}),
      ...(s.presupuesto ? { presupuesto: s.presupuesto } : {}),
    })),
  );
}

/** Los mismos segmentos con el presupuesto mensual de cada uno puesto (`null` lo quita). */
export function conPresupuestos(
  segmentos: Segmento[],
  micros: Record<string, number | null>,
  moneda: string,
): Segmento[] {
  return segmentos.map((s) => {
    if (!(s.id in micros)) return s;
    const valor = micros[s.id];
    return { ...s, presupuesto: valor && valor > 0 ? { micros: Math.round(valor), moneda: moneda.toUpperCase() } : null };
  });
}
