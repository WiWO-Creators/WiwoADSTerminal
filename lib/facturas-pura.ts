/**
 * Facturas por cliente y plataforma: dónde se guarda cada documento y de qué tipo es. Parte pura (sin red).
 *
 * Carpeta pedida: INVOICE / CLIENTE / MES / EXTRACTO | FACTURA / archivos.
 * Un mismo cliente puede tener solo extracto, solo factura o ambos según la plataforma y el medio de pago: el tipo se
 * decide por lo que dice el propio documento, y si no queda claro se deja en «SIN_CLASIFICAR» (nunca se adivina).
 */
export type TipoDeDocumento = "FACTURA" | "EXTRACTO" | "SIN_CLASIFICAR";

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Palabras que delatan el tipo en el nombre o el título del documento (es/en/pt). */
export function tipoDeDocumento(textos: Array<string | null | undefined>): TipoDeDocumento {
  const t = sinTildes(textos.filter(Boolean).join(" "));
  const factura = /\b(factura|invoice|fatura|boleta|nota de credito|credit memo|tax invoice)\b/.test(t);
  const extracto = /\b(extracto|statement|estado de cuenta|resumen de cuenta|receipt|recibo|comprobante de pago|payment receipt)\b/.test(t);
  if (factura && !extracto) return "FACTURA";
  if (extracto && !factura) return "EXTRACTO";
  return "SIN_CLASIFICAR";
}

const limpio = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "_");

/** `2026-09` → carpeta del mes. */
export const carpetaDeMes = (anio: number, mes: number): string => `${anio}-${String(mes).padStart(2, "0")}`;

export function rutaDeDocumento(o: { cliente: string; anio: number; mes: number; tipo: TipoDeDocumento; archivo: string }): string {
  return ["INVOICE", limpio(o.cliente) || "SIN_CLIENTE", carpetaDeMes(o.anio, o.mes), o.tipo, limpio(o.archivo) || "documento"].join("/");
}

/** Nombre del archivo: plataforma, cuenta y número, para que no choquen dos documentos del mismo mes. */
export function nombreDeArchivo(o: { plataforma: string; cuenta: string; numero: string | null; extension: string }): string {
  return `${limpio(o.plataforma)}_${limpio(o.cuenta)}${o.numero ? `_${limpio(o.numero)}` : ""}.${o.extension.replace(/^\./, "")}`;
}
