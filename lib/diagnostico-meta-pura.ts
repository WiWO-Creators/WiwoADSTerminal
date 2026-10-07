/** Veredicto del diagnóstico de permisos de Meta. Parte pura, sin red. */
export const TAREAS_CUENTA_QUE_EDITAN = ["MANAGE", "ADVERTISE"];
export const TAREAS_PAGINA_QUE_ANUNCIAN = ["ADVERTISE", "MANAGE", "CREATE_CONTENT"];

export type PermisoDeLlave = { llave: number; ve: boolean; tareas: string[]; puede: boolean };
export type DiagnosticoDeCuenta = {
  clienteId: string;
  cliente: string;
  cuenta: string;
  paginaId: string | null;
  cuentaPorLlave: PermisoDeLlave[];
  paginaPorLlave: PermisoDeLlave[];
  /** Llaves que pueden anunciar en la cuenta y en la página a la vez (las únicas que crean anuncios desde publicaciones). */
  llavesCompletas: number[];
  estado: "ok" | "advertencia" | "problema";
  mensaje: string;
};

export function veredicto(
  cuentaPorLlave: PermisoDeLlave[],
  paginaPorLlave: PermisoDeLlave[],
  tienePagina: boolean,
): { llavesCompletas: number[]; estado: DiagnosticoDeCuenta["estado"]; mensaje: string } {
  const editanCuenta = cuentaPorLlave.filter((p) => p.puede).map((p) => p.llave);
  const anunciaPagina = paginaPorLlave.filter((p) => p.puede).map((p) => p.llave);
  const completas = tienePagina ? editanCuenta.filter((l) => anunciaPagina.includes(l)) : editanCuenta;
  if (!cuentaPorLlave.some((p) => p.ve)) return { llavesCompletas: [], estado: "problema", mensaje: "Ninguna llave ve esta cuenta: hay que compartirla con el negocio de una de las llaves." };
  if (editanCuenta.length === 0) return { llavesCompletas: [], estado: "problema", mensaje: "Las llaves ven la cuenta pero ninguna puede crear ni editar: falta un rol de anunciante o superior." };
  if (tienePagina && completas.length === 0) {
    return {
      llavesCompletas: [],
      estado: "problema",
      mensaje: anunciaPagina.length === 0
        ? "Ninguna llave puede anunciar con la página: falta darle un rol de anunciante en la página a una llave que edite la cuenta."
        : "Ninguna llave tiene a la vez permiso en la cuenta y en la página (como pasó con Anker): da a una llave el acceso que le falta.",
    };
  }
  if (!tienePagina) return { llavesCompletas: completas, estado: "advertencia", mensaje: "La cuenta se puede editar, pero no tiene una página asociada en WiWO.ADS: no se pueden crear anuncios desde publicaciones." };
  return { llavesCompletas: completas, estado: "ok", mensaje: "Una llave puede crear anuncios con esta cuenta y su página." };
}

