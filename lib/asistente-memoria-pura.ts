/**
 * Reglas puras de la memoria del asistente (sin red ni base de datos, para poder probarlas).
 *
 * La memoria guarda lo que el equipo quiere que el asistente recuerde para trabajar mejor con el tiempo: preferencias,
 * decisiones, cómo es un cliente, qué funcionó. NUNCA datos personales ni credenciales: aquí se rechazan antes de
 * escribir.
 */
export const MAX_CARACTERES_NOTA = 400;
export const MAX_NOTAS_POR_ALCANCE = 60;
/** Cuánto texto de memoria entra en el prompt (las más usadas y recientes primero). */
export const MAX_CARACTERES_EN_PROMPT = 3500;

const CORREO = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const TELEFONO = /(?:\+?\d[\s-]?){9,}/;
const SECRETO = /\b(contraseña|password|passwd|token|secret|secreto|api[_ -]?key|clave\s+(?:de|secreta)|bearer)\b/i;
const CADENA_LARGA = /[A-Za-z0-9_\-+/=]{28,}/;

/** Un mensaje si la nota no se puede guardar; `null` si está bien. */
export function problemaDeMemoria(texto: string): string | null {
  const t = texto.trim();
  if (t.length < 8) return "La nota es demasiado corta para servir de algo.";
  if (t.length > MAX_CARACTERES_NOTA) return `La nota admite hasta ${MAX_CARACTERES_NOTA} caracteres: resúmela.`;
  if (CORREO.test(t)) return "No se guardan correos electrónicos en la memoria.";
  if (TELEFONO.test(t)) return "No se guardan teléfonos ni números largos en la memoria.";
  if (SECRETO.test(t)) return "No se guardan contraseñas, tokens ni claves en la memoria.";
  if (CADENA_LARGA.test(t)) return "Eso parece una clave o un token: no se guarda en la memoria.";
  return null;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palabras = (t: string) => new Set(sinTildes(t).replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter((p) => p.length > 2));

/** Parecido entre dos notas (0 a 1): para no guardar lo mismo dos veces con otras palabras. */
export function parecido(a: string, b: string): number {
  const A = palabras(a);
  const B = palabras(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const p of A) if (B.has(p)) comunes += 1;
  return comunes / (A.size + B.size - comunes);
}

export type NotaDeMemoria = { id: string; scope: string; texto: string; autor: string; actualizada: number; usos: number };

/** La nota ya guardada que dice lo mismo, si la hay. */
export function notaRepetida(existentes: NotaDeMemoria[], texto: string): NotaDeMemoria | null {
  return existentes.find((n) => parecido(n.texto, texto) >= 0.8) ?? null;
}

/**
 * El bloque de memoria para el prompt: primero lo del equipo y después lo del cliente, las más usadas y recientes
 * primero, hasta el tope de caracteres. Cada nota lleva su id para poder olvidarla.
 */
export function bloqueDeMemoria(equipo: NotaDeMemoria[], cliente: NotaDeMemoria[], nombreCliente: string | null): string {
  const orden = (a: NotaDeMemoria, b: NotaDeMemoria) => b.usos - a.usos || b.actualizada - a.actualizada;
  let restante = MAX_CARACTERES_EN_PROMPT;
  const lineas = (titulo: string, notas: NotaDeMemoria[]): string => {
    const salida: string[] = [];
    for (const n of [...notas].sort(orden)) {
      const linea = `- [${n.id.slice(0, 8)}] ${n.texto}`;
      if (linea.length > restante) break;
      restante -= linea.length;
      salida.push(linea);
    }
    return salida.length > 0 ? `${titulo}\n${salida.join("\n")}` : "";
  };
  const partes = [
    lineas("Notas del equipo (valen para todos los clientes):", equipo),
    cliente.length > 0 ? lineas(`Notas sobre ${nombreCliente ?? "el cliente activo"}:`, cliente) : "",
  ].filter(Boolean);
  return partes.join("\n\n");
}
