/**
 * Bases de contactos para audiencias (Customer Match de Google y carga manual en
 * Meta). Puro (sin red ni base de datos) y pensado para correr en el navegador:
 * la lectura y la validación ocurren ahí, sin enviar nada al servidor hasta que
 * la persona confirma.
 *
 * Privacidad: nada de esto guarda contactos. El único lugar donde salen de la
 * pantalla es la subida que la persona confirma (a Google, vía Windsor, que los
 * normaliza y hashea) o el archivo ya hasheado que descarga para Meta.
 */
export type Miembro = { email?: string; phone_number?: string };

export type ResultadoDeCarga = {
  miembros: Miembro[];
  filasLeidas: number;
  conEmail: number;
  conTelefono: number;
  /** Filas sin un correo ni un teléfono válidos. */
  invalidas: number;
  duplicadas: number;
  /** Las primeras, enmascaradas, para confirmar que se leyó la columna correcta. */
  ejemplos: string[];
};

/** Límite de Windsor por llamada de subida. */
export const MAXIMO_POR_LOTE = 10_000;

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const ENCABEZADO_EMAIL = /^(e-?mail|correo|mail)/i;
const ENCABEZADO_TELEFONO = /^(tel|phone|celular|cel|fono|movil|móvil|whatsapp|mobile)/i;

export function normalizarEmail(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "").trim().toLowerCase();
  return EMAIL.test(limpio) ? limpio : null;
}

/**
 * Teléfono en formato E.164 (+56912345678), o `null` si no se puede asegurar.
 * Sin «+» se asume el país por defecto (Chile, 56): un número de 9 dígitos se
 * completa con su código; uno que ya empieza con el código se respeta. Para
 * otros países, el dato debe traer «+» y el código: no se adivina.
 */
export function normalizarTelefono(valor: string | null | undefined, codigoPais = "56"): string | null {
  const crudo = (valor ?? "").trim();
  if (!crudo) return null;
  const traeMas = crudo.startsWith("+");
  let digitos = crudo.replace(/\D/g, "");
  if (!traeMas && digitos.startsWith("00")) digitos = digitos.slice(2);
  else if (!traeMas) {
    if (digitos.length === 9) digitos = codigoPais + digitos;
    else if (digitos.length === 10 && digitos.startsWith("0")) digitos = codigoPais + digitos.slice(1);
  }
  return digitos.length >= 10 && digitos.length <= 15 ? `+${digitos}` : null;
}

function separador(texto: string): string {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const cuentas: Array<[string, number]> = [
    [";", (primera.match(/;/g) ?? []).length],
    ["\t", (primera.match(/\t/g) ?? []).length],
    [",", (primera.match(/,/g) ?? []).length],
  ];
  return cuentas.sort((a, b) => b[1] - a[1])[0][1] > 0 ? cuentas.sort((a, b) => b[1] - a[1])[0][0] : ",";
}

const sinComillas = (v: string) => v.trim().replace(/^"(.*)"$/, "$1").trim();

export function enmascarar(m: Miembro): string {
  const partes: string[] = [];
  if (m.email) {
    const [local, dominio] = m.email.split("@");
    partes.push(`${local.slice(0, 1)}***@${dominio}`);
  }
  if (m.phone_number) partes.push(`${m.phone_number.slice(0, 4)}****${m.phone_number.slice(-3)}`);
  return partes.join("  ·  ");
}

/**
 * Lee un CSV (coma, punto y coma o tabulación) o una lista de una línea por
 * contacto. Si la primera fila trae encabezados (correo, email, teléfono…) usa
 * esas columnas; si no, detecta por el contenido de cada celda.
 */
export function parsearContactos(texto: string, codigoPais = "56"): ResultadoDeCarga {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const sep = separador(texto);
  const filas = lineas.map((l) => l.split(sep).map(sinComillas));

  let colEmail = -1;
  let colTelefono = -1;
  let inicio = 0;
  const cabecera = filas[0] ?? [];
  if (cabecera.some((c) => ENCABEZADO_EMAIL.test(c) || ENCABEZADO_TELEFONO.test(c))) {
    colEmail = cabecera.findIndex((c) => ENCABEZADO_EMAIL.test(c));
    colTelefono = cabecera.findIndex((c) => ENCABEZADO_TELEFONO.test(c));
    inicio = 1;
  }

  const miembros: Miembro[] = [];
  const vistos = new Set<string>();
  let invalidas = 0;
  let duplicadas = 0;
  let conEmail = 0;
  let conTelefono = 0;

  for (let i = inicio; i < filas.length; i += 1) {
    const celdas = filas[i];
    let email: string | null = null;
    let telefono: string | null = null;
    if (inicio === 1) {
      email = colEmail >= 0 ? normalizarEmail(celdas[colEmail]) : null;
      telefono = colTelefono >= 0 ? normalizarTelefono(celdas[colTelefono], codigoPais) : null;
    } else {
      for (const celda of celdas) {
        if (!email && celda.includes("@")) email = normalizarEmail(celda);
        else if (!telefono && !celda.includes("@") && /\d/.test(celda)) telefono = normalizarTelefono(celda, codigoPais);
      }
    }
    if (!email && !telefono) {
      invalidas += 1;
      continue;
    }
    const clave = email ?? telefono!;
    if (vistos.has(clave)) {
      duplicadas += 1;
      continue;
    }
    vistos.add(clave);
    if (email) conEmail += 1;
    if (telefono) conTelefono += 1;
    miembros.push({ ...(email ? { email } : {}), ...(telefono ? { phone_number: telefono } : {}) });
  }

  return {
    miembros,
    filasLeidas: filas.length - inicio,
    conEmail,
    conTelefono,
    invalidas,
    duplicadas,
    ejemplos: miembros.slice(0, 3).map(enmascarar),
  };
}

export function enLotes<T>(elementos: T[], tamano = MAXIMO_POR_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < elementos.length; i += tamano) lotes.push(elementos.slice(i, i + tamano));
  return lotes;
}

/* -------------------------------------------------------------------------- */
/* Archivo hasheado para Meta                                                 */
/* -------------------------------------------------------------------------- */

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * CSV con `email,phone` ya hasheados con SHA-256, como lo pide Meta para una
 * audiencia personalizada (correo en minúsculas y sin espacios; teléfono solo
 * con dígitos y código de país, sin «+»). Meta no tiene esta acción en Windsor:
 * la persona sube el archivo en Administrador de anuncios → Audiencias, y allí
 * mismo crea el público similar.
 */
export async function csvParaMeta(miembros: Miembro[]): Promise<string> {
  const filas = ["email,phone"];
  for (const m of miembros) {
    const email = m.email ? await sha256Hex(m.email) : "";
    const telefono = m.phone_number ? await sha256Hex(m.phone_number.replace(/\D/g, "")) : "";
    filas.push(`${email},${telefono}`);
  }
  return filas.join("\n");
}
