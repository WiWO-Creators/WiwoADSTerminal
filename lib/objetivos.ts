/**
 * Taxonomía de objetivos de campaña (siglas de MetriQ).
 *
 * MetriQ clasifica las campañas por una **sigla al inicio del nombre**, no por
 * el campo de objetivo de cada plataforma. La razón: ese campo se llama y se
 * valora distinto en Meta, Google y TikTok, y para Performance Max ni siquiera
 * existe. La sigla es uniforme y la controla el analista.
 *
 * Formato: `[SIGLA] Cliente · Plataforma · Detalle`
 *
 * Regla de MetriQ que conviene recordar: **la sigla se asigna por el objetivo
 * real de negocio, no por el objetivo técnico de la plataforma**. Una campaña
 * con objetivo técnico de tráfico cuyo fin es ganar seguidores se nombra `[AE]`.
 */

export const OBJETIVOS = ["AE", "VTA", "LDS", "TRF", "OCV"] as const;
export type Objetivo = (typeof OBJETIVOS)[number];

export const OBJETIVO_LABELS: Record<Objetivo, string> = {
  AE: "Awareness y engagement",
  VTA: "Ventas",
  LDS: "Leads",
  TRF: "Tráfico",
  OCV: "Otras conversiones",
};

export const OBJETIVO_CORTO: Record<Objetivo, string> = {
  AE: "Awareness",
  VTA: "Ventas",
  LDS: "Leads",
  TRF: "Tráfico",
  OCV: "Conversiones",
};

/**
 * Objetivo de una campaña a partir de su nombre.
 *
 * `null` significa que la campaña no sigue la convención. No se adivina: una
 * campaña mal clasificada entra en el reporte equivocado, y es preferible
 * marcarla para renombrar que ubicarla a ciegas.
 */
export function objetivoDeNombre(nombre: string): Objetivo | null {
  const match = /^\s*\[\s*(AE|VTA|LDS|TRF|OCV)\s*\]/i.exec(nombre);
  return match ? (match[1].toUpperCase() as Objetivo) : null;
}

/**
 * Respaldo: deducir el objetivo del campo de la plataforma.
 *
 * Solo se usa cuando la campaña todavía no lleva sigla. MetriQ lo llama "red
 * de seguridad": sirve para no perder la campaña, pero lo correcto es
 * renombrarla.
 */
export function objetivoDePlataforma(
  provider: string,
  objetivoNativo: string | null,
): Objetivo | null {
  const valor = (objetivoNativo ?? "").toUpperCase();
  if (!valor) return null;

  if (provider === "meta") {
    if (/AWARENESS|REACH|ENGAGEMENT|PAGE_LIKES|VIDEO_VIEWS|EVENT_RESPONSES/.test(valor)) {
      return "AE";
    }
    if (/TRAFFIC|LINK_CLICKS/.test(valor)) return "TRF";
    if (/LEAD/.test(valor)) return "LDS";
    if (/SALES|CONVERSIONS|CATALOG/.test(valor)) return "VTA";
    if (/MESSAGES/.test(valor)) return "OCV";
    return null;
  }

  if (provider === "google") {
    // Solo se deduce awareness, y solo desde los canales visuales.
    //
    // SEARCH NO implica tráfico: una campaña de búsqueda puede ser de leads,
    // de ventas o de tráfico, y el canal no lo distingue. Deducirlo clasificaba
    // mal campañas evidentes — "Conversiones SEM Empresas" aparecía como
    // tráfico. MetriQ lo advierte: para ventas, leads y otras conversiones hay
    // que mirar la categoría de la acción de conversión, no el canal. Sin sigla
    // se deja sin clasificar, que es lo honesto.
    if (/DISPLAY|DEMAND_GEN|VIDEO/.test(valor)) return "AE";
    return null;
  }

  return null;
}

/** Nombre de campaña con la convención de MetriQ. */
export function nombreDeCampana(
  objetivo: Objetivo,
  cliente: string,
  plataforma: string,
  detalle: string,
): string {
  const partes = [cliente.trim(), plataforma.trim(), detalle.trim()].filter(
    Boolean,
  );
  return `[${objetivo}] ${partes.join(" · ")}`;
}

/**
 * Qué métrica es "el resultado" para cada objetivo.
 *
 * No existe un resultado único: en awareness es la interacción, en leads el
 * formulario, en ventas la compra. Reportar una sola cifra para todos mezcla
 * cosas que no se comparan.
 */
export const RESULTADO_POR_OBJETIVO: Record<Objetivo, string> = {
  AE: "Interacciones",
  VTA: "Compras",
  LDS: "Leads",
  TRF: "Clics al enlace",
  OCV: "Conversaciones y llamadas",
};
