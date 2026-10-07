/**
 * Jerarquía del equipo, de arriba abajo: Admin > Director > Director Digital > Digital Lead > Digital Creator.
 * Sale del cargo de cada persona (el rol técnico sigue siendo admin, supervisor o analista). Parte pura, sin base de datos.
 */
export const NIVELES_DE_CARGO = {
  admin: 5,
  director: 4,
  directorDigital: 3,
  lead: 2,
  creator: 1,
} as const;

/** Nivel de un cargo; sin cargo o desconocido, el más bajo (0). */
export function nivelDeCargo(cargo: string | null | undefined): number {
  const c = (cargo ?? "").trim().toLowerCase();
  if (c === "super admin" || c === "admin") return NIVELES_DE_CARGO.admin;
  if (c === "director" || c === "director creativo") return NIVELES_DE_CARGO.director;
  if (c === "director digital" || c === "paid media") return NIVELES_DE_CARGO.directorDigital;
  if (c === "digital lead") return NIVELES_DE_CARGO.lead;
  if (c === "digital creator") return NIVELES_DE_CARGO.creator;
  return 0;
}

/** Un Admin puede con cualquiera; el resto solo con quien está estrictamente por debajo. */
export function puedeModificarPorJerarquia(cargoActor: string | null | undefined, cargoObjetivo: string | null | undefined): boolean {
  const mio = nivelDeCargo(cargoActor);
  if (mio >= NIVELES_DE_CARGO.admin) return true;
  return mio > nivelDeCargo(cargoObjetivo);
}
