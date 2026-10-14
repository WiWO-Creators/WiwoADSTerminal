/**
 * Públicos personalizados de Meta que se arman con la interacción de la gente: quienes vieron un video, interactuaron con la página o
 * con el perfil de Instagram, o abrieron/enviaron un formulario instantáneo. Son los públicos de retargeting. Puro (sin red).
 *
 * Cada uno es una `rule` de `POST /act_{id}/customaudiences` con `subtype: ENGAGEMENT`. La retención va en segundos (máximo 365 días).
 */

export type TipoDePublico =
  /** Quienes vieron los videos de la página (Meta no deja armarlo por un video suelto con la regla actual). */
  | { tipo: "video"; pageId: string; porcentaje: 3 | 10 | 25 | 50 | 75 | 95 | 100 }
  | { tipo: "pagina"; pageId: string }
  | { tipo: "instagram"; instagramId: string }
  | { tipo: "formulario"; formularioId: string; quien: "abrieron" | "abrieron_sin_enviar" | "enviaron" };

export type DatosDePublico = TipoDePublico & {
  nombre: string;
  /** Días que se recuerda a la persona (1 a 365; los públicos de formulario admiten hasta 90). */
  dias: number;
};

const ids = (xs: string[]) => xs.length > 0 && xs.every((x) => /^\d+$/.test(x));

/** El evento de Meta que corresponde a «vio el X % del video». */
export function eventoDeVideo(porcentaje: number): string {
  switch (porcentaje) {
    case 3:
      return "video_watched";
    case 10:
      return "video_view_10s";
    case 25:
      return "video_view_25_percent";
    case 50:
      return "video_view_50_percent";
    case 75:
      return "video_view_75_percent";
    case 95:
      return "video_view_95_percent";
    default:
      return "video_completed";
  }
}

export function problemasDelPublico(d: DatosDePublico): string[] {
  const p: string[] = [];
  if (d.nombre.trim().length < 3) p.push("Ponle un nombre al público (mínimo 3 letras).");
  const max = d.tipo === "formulario" ? 90 : 365;
  if (!(Number.isInteger(d.dias) && d.dias >= 1 && d.dias <= max)) p.push(`Los días de retención deben estar entre 1 y ${max}.`);
  if (d.tipo === "video" && !ids([d.pageId])) p.push("Falta la página de Facebook de los videos.");
  if (d.tipo === "pagina" && !ids([d.pageId])) p.push("Falta la página de Facebook.");
  if (d.tipo === "instagram" && !ids([d.instagramId])) p.push("Falta la cuenta de Instagram.");
  if (d.tipo === "formulario" && !ids([d.formularioId])) p.push("Elige el formulario instantáneo.");
  return p;
}

type Filtro = { field: string; operator: string; value: string };

function regla(fuentes: Array<{ id: string; type: string }>, segundos: number, filtros: Filtro[], exclusiones?: Array<{ fuentes: Array<{ id: string; type: string }>; filtros: Filtro[] }>) {
  return {
    inclusions: { operator: "or", rules: [{ event_sources: fuentes, retention_seconds: segundos, filter: { operator: "and", filters: filtros } }] },
    ...(exclusiones
      ? { exclusions: { operator: "or", rules: exclusiones.map((e) => ({ event_sources: e.fuentes, retention_seconds: segundos, filter: { operator: "and", filters: e.filtros } })) } }
      : {}),
  };
}

const evento = (value: string): Filtro => ({ field: "event", operator: "eq", value });

/** El cuerpo de `POST /act_{id}/customaudiences`. */
export function cuerpoDelPublico(d: DatosDePublico): Record<string, unknown> {
  const segundos = d.dias * 86_400;
  // Sin `subtype`: con ENGAGEMENT Meta rechaza la regla («nombre de evento no válido»); sin él la acepta (verificado en una cuenta de prueba).
  const base = { name: d.nombre.trim().slice(0, 100), prefill: 1 };
  switch (d.tipo) {
    case "video":
      return { ...base, rule: regla([{ id: d.pageId, type: "page" }], segundos, [evento(eventoDeVideo(d.porcentaje))]) };
    case "pagina":
      return { ...base, rule: regla([{ id: d.pageId, type: "page" }], segundos, [evento("page_engaged")]) };
    case "instagram":
      return { ...base, rule: regla([{ id: d.instagramId, type: "ig_business" }], segundos, [evento("ig_business_profile_all")]) };
    case "formulario": {
      const fuente = [{ id: d.formularioId, type: "lead" }];
      if (d.quien === "enviaron") return { ...base, rule: regla(fuente, segundos, [evento("lead_generation_submitted")]) };
      if (d.quien === "abrieron") return { ...base, rule: regla(fuente, segundos, [evento("lead_generation_opened")]) };
      // Abrieron el formulario y NO lo enviaron: incluye a quienes lo abrieron y excluye a quienes lo enviaron.
      return { ...base, rule: regla(fuente, segundos, [evento("lead_generation_opened")], [{ fuentes: fuente, filtros: [evento("lead_generation_submitted")] }]) };
    }
  }
}
