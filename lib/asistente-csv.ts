/**
 * Perfil de un CSV para el asistente de IA.
 *
 * Las sumas, promedios y rankings se calculan acá, en código, y no se le piden
 * al modelo: un modelo de lenguaje sumando 4.000 filas se equivoca en silencio,
 * y el resultado parece igual de seguro que uno correcto. Al modelo solo le
 * llega este resumen más una muestra, y de ahí razona.
 *
 * Es código puro (sin dependencias de la plataforma) para poder probarlo solo.
 */

export const CSV_TAMANO_MAXIMO = 1_500_000;

export type PerfilDeCsv = {
  filas: number;
  columnas: string[];
  texto: string;
};

/** Detecta el separador mirando la primera línea (`,` `;` o tabulador). */
function detectarSeparador(primera: string): string {
  const cuentas = [",", ";", "\t"].map((s) => ({
    s,
    n: primera.split(s).length - 1,
  }));
  cuentas.sort((a, b) => b.n - a.n);
  return cuentas[0].n > 0 ? cuentas[0].s : ",";
}

/** Lector CSV con comillas (RFC 4180): campos con separadores y saltos de línea. */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = detectarSeparador(primera);
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === sep) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(campo);
      campo = "";
      if (fila.some((v) => v.trim() !== "")) filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  fila.push(campo);
  if (fila.some((v) => v.trim() !== "")) filas.push(fila);
  return filas;
}

/**
 * Convierte "1.234,56", "1,234.56", "$ 12.500", "3,5%" o "-" en número.
 * `null` cuando no es un número: así una columna de texto no se cuela como
 * numérica por tener un valor suelto que lo parece.
 */
export function numeroDe(valor: string): number | null {
  let v = valor.trim();
  if (v === "" || v === "-" || v === "—") return null;
  v = v.replace(/[%\s$€£]|CLP|USD|COP|MXN|ARS|PEN|EUR/gi, "");
  if (!/^[+-]?[\d.,]+$/.test(v)) return null;
  const ultimoPunto = v.lastIndexOf(".");
  const ultimaComa = v.lastIndexOf(",");
  if (ultimoPunto !== -1 && ultimaComa !== -1) {
    // Los dos presentes: el que aparece último es el decimal.
    v =
      ultimaComa > ultimoPunto
        ? v.replace(/\./g, "").replace(",", ".")
        : v.replace(/,/g, "");
  } else if (ultimaComa !== -1) {
    const despues = v.length - ultimaComa - 1;
    const veces = v.split(",").length - 1;
    // "1,234" (una sola coma con 3 dígitos) es miles; "3,5" es decimal.
    v = veces === 1 && despues !== 3 ? v.replace(",", ".") : v.replace(/,/g, "");
  } else if (ultimoPunto !== -1) {
    const despues = v.length - ultimoPunto - 1;
    const veces = v.split(".").length - 1;
    // "12.500" es miles en es-CL; "3.5" es decimal.
    v = veces > 1 || despues === 3 ? v.replace(/\./g, "") : v;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formato(n: number): string {
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("es-CL");
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}

const CLAVES_DE_GASTO = /gast|spend|cost|inversi|importe|amount/i;

/** Resumen de un CSV, listo para ponerle delante al modelo. */
export function perfilarCsv(nombre: string, texto: string): PerfilDeCsv {
  const todas = leerCsv(texto);
  if (todas.length < 2) {
    return {
      filas: 0,
      columnas: todas[0] ?? [],
      texto: `Archivo "${nombre}": vacío o sin filas de datos.`,
    };
  }
  const columnas = todas[0].map((c, i) => c.trim() || `columna_${i + 1}`);
  const filas = todas.slice(1);

  const numericas: Array<{ indice: number; valores: number[] }> = [];
  columnas.forEach((_, indice) => {
    const valores: number[] = [];
    let conValor = 0;
    for (const fila of filas) {
      const crudo = (fila[indice] ?? "").trim();
      if (crudo === "") continue;
      conValor++;
      const n = numeroDe(crudo);
      if (n !== null) valores.push(n);
    }
    // Numérica si casi todo lo que trae valor es número.
    if (conValor > 0 && valores.length / conValor >= 0.8) {
      numericas.push({ indice, valores });
    }
  });

  const lineas: string[] = [
    `Archivo "${nombre}": ${filas.length} filas, ${columnas.length} columnas.`,
    `Columnas: ${columnas.join(" | ")}`,
  ];

  if (numericas.length > 0) {
    lineas.push("Columnas numéricas (calculadas por código, no estimadas):");
    for (const { indice, valores } of numericas) {
      const suma = valores.reduce((a, b) => a + b, 0);
      lineas.push(
        `- ${columnas[indice]}: suma ${formato(suma)}, promedio ${formato(suma / valores.length)}, mín ${formato(Math.min(...valores))}, máx ${formato(Math.max(...valores))} (${valores.length} valores)`,
      );
    }
  }

  const porGasto =
    numericas.find(({ indice }) => CLAVES_DE_GASTO.test(columnas[indice])) ??
    numericas[0];
  const recorta = (fila: string[]) =>
    fila
      .map((v) => v.trim())
      .join(" | ")
      .slice(0, 200);

  if (porGasto) {
    const ranking = filas
      .map((fila) => ({ fila, n: numeroDe(fila[porGasto.indice] ?? "") ?? -Infinity }))
      .filter((x) => x.n !== -Infinity)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
    lineas.push(`Las 10 filas con más "${columnas[porGasto.indice]}":`);
    for (const { fila } of ranking) lineas.push(`- ${recorta(fila)}`);
  }

  lineas.push("Primeras 8 filas:");
  for (const fila of filas.slice(0, 8)) lineas.push(`- ${recorta(fila)}`);

  return {
    filas: filas.length,
    columnas,
    texto: lineas.join("\n").slice(0, 9000),
  };
}
