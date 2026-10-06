/**
 * Cómo se ve en la bitácora (`ejecuciones`) una edición sobre algo que ya
 * existe en la plataforma.
 *
 * El constructor ya deja rastro de lo que crea; las ediciones de
 * `/api/anuncios/gestionar` y `/api/anuncios/estado` no dejaban ninguno, así
 * que nadie podía responder "quién cambió el presupuesto de esta campaña y
 * cuándo". Se reutiliza la misma tabla y el mismo formato de paso (los que ya
 * lee la pantalla Ejecuciones) en vez de inventar una bitácora paralela. Va
 * aparte de la escritura en base de datos para poder probarse sin ella.
 */

/** Forma de un paso en `ejecuciones.steps_json` (ver `PasoEjecutado`). */
export type PasoDeEdicion = {
  platform: string;
  action: string;
  label: string;
  params: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  raw: unknown;
};

export type ResultadoDeAccion = {
  ok: boolean;
  raw?: unknown;
  error?: string | null;
};

/** Prefijo con el que la pantalla Ejecuciones distingue una edición de una
 * campaña publicada por el constructor. */
export const PREFIJO_EDICION = "Edición · ";

/**
 * Id de la entidad tocada, para el título del registro: el más específico que
 * traiga `params` (anuncio antes que conjunto antes que campaña).
 */
export function entidadDeParams(params: Record<string, unknown>): string | null {
  for (const clave of ["ad_id", "adset_id", "ad_group_id", "campaign_id", "user_list_id"]) {
    const valor = params[clave];
    if (typeof valor === "string" && valor) return `${clave}=${valor}`;
  }
  return null;
}

export function nombreDeEdicion(
  action: string,
  params: Record<string, unknown>,
): string {
  const entidad = entidadDeParams(params);
  return `${PREFIJO_EDICION}${action}${entidad ? ` (${entidad})` : ""}`;
}

/**
 * Parámetros que se pueden guardar en la bitácora. Los contactos de una lista de
 * Customer Match (correos, teléfonos, nombres) son datos personales de terceros:
 * la bitácora guarda CUÁNTOS se subieron, nunca quiénes.
 */
export function paramsParaBitacora(action: string, params: Record<string, unknown>): Record<string, unknown> {
  if (action === "upload_customer_match_list" && Array.isArray(params.members)) {
    const { members, ...resto } = params;
    return { ...resto, members: `${members.length} contactos (no se guardan en la bitácora)` };
  }
  return params;
}

export function pasoDeEdicion(
  provider: string,
  action: string,
  params: Record<string, unknown>,
  resultado: ResultadoDeAccion,
  cuenta: string,
): PasoDeEdicion {
  return {
    platform: provider,
    action,
    label: `${action} · cuenta ${cuenta}`,
    params: paramsParaBitacora(action, params),
    ok: resultado.ok,
    error: resultado.ok ? null : (resultado.error ?? "Error sin detalle"),
    raw: resultado.raw ?? null,
  };
}
