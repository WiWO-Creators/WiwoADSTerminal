/**
 * Qué plataforma es una cuenta publicitaria, a partir de la forma de su identificador. Sirve cuando la base no trae el
 * proveedor (cuentas cargadas antes de que existiera esa columna): así las conexiones «vienen listas» sin un paso manual.
 * Parte pura, sin red.
 */
export type ProveedorDeCuenta = "google" | "meta" | "tiktok" | "linkedin";

export function inferirProveedorDeCuenta(externalId: string): ProveedorDeCuenta | null {
  const id = externalId.trim().replace(/^act_/i, "");
  if (/^\d{3}-\d{3}-\d{4}$/.test(id)) return "google";
  if (!/^\d+$/.test(id)) return null;
  if (id.length === 10) return "google";
  if (id.length >= 14 && id.length <= 17) return "meta";
  if (id.length === 19) return "tiktok";
  if (id.length === 9) return "linkedin";
  return null;
}
