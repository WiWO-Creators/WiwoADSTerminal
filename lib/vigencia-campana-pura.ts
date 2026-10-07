/**
 * ¿Una campaña ya cumplió su época? Muchas campañas llevan el mes en el nombre («Leads | junio», «Cyber septiembre 2026»):
 * recomendar renovarles el contenido meses después no tiene sentido. Parte pura, sin red.
 */

const MESES: Array<{ mes: number; nombres: string[] }> = [
  { mes: 1, nombres: ["enero", "ene"] },
  { mes: 2, nombres: ["febrero", "feb"] },
  { mes: 3, nombres: ["marzo"] },
  { mes: 4, nombres: ["abril", "abr"] },
  { mes: 5, nombres: ["mayo"] },
  { mes: 6, nombres: ["junio", "jun"] },
  { mes: 7, nombres: ["julio", "jul"] },
  { mes: 8, nombres: ["agosto", "ago"] },
  { mes: 9, nombres: ["septiembre", "setiembre", "sept", "sep"] },
  { mes: 10, nombres: ["octubre", "oct"] },
  { mes: 11, nombres: ["noviembre", "nov"] },
  { mes: 12, nombres: ["diciembre", "dic"] },
];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El último mes que nombra la campaña (y el año, si lo trae). `null` si no nombra ninguno. */
export function mesDeNombre(nombre: string): { mes: number; anio: number | null } | null {
  const palabras = sinTildes(nombre).split(/[^a-z0-9]+/).filter(Boolean);
  let encontrado: { mes: number; indice: number } | null = null;
  palabras.forEach((p, i) => {
    const m = MESES.find((x) => x.nombres.includes(p));
    if (m) encontrado = { mes: m.mes, indice: i };
  });
  if (!encontrado) return null;
  const { mes, indice } = encontrado as { mes: number; indice: number };
  // Año pegado al mes («junio 2026», «2026 junio») o suelto en el nombre.
  const vecinos = [palabras[indice + 1], palabras[indice - 1], ...palabras];
  const anio = vecinos.map((p) => (p && /^20\d\d$/.test(p) ? Number(p) : null)).find((a) => a !== null) ?? null;
  return { mes, anio };
}

/** Cuándo terminó el mes que nombra la campaña, o `null` si no se puede saber (sin mes, o un mes futuro sin año). */
export function finDeLaEpocaPorNombre(nombre: string, ahora: Date): Date | null {
  const m = mesDeNombre(nombre);
  if (!m) return null;
  const anioActual = ahora.getUTCFullYear();
  const mesActual = ahora.getUTCMonth() + 1;
  // Sin año, un mes que todavía no llega es una campaña por venir, no una vencida.
  if (m.anio === null && m.mes > mesActual) return null;
  const anio = m.anio ?? anioActual;
  // Último instante del mes nombrado.
  return new Date(Date.UTC(anio, m.mes, 1, 0, 0, 0) - 1);
}

/** Días de gracia: una campaña de un mes sigue importando hasta un mes después de que termina. */
export const DIAS_DE_GRACIA = 31;

/** ¿La campaña es de una época que ya pasó hace más de un mes? Entonces no se le recomienda renovar nada. */
export function campanaDeEpocaPasada(nombre: string, ahora: Date): boolean {
  const fin = finDeLaEpocaPorNombre(nombre, ahora);
  return fin !== null && ahora.getTime() - fin.getTime() > DIAS_DE_GRACIA * 86_400_000;
}
