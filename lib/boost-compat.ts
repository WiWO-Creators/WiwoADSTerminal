/**
 * ¿Se puede impulsar una publicación DENTRO de una campaña o conjunto que ya
 * existe? Lo decide Meta, no WiWO.ADS, y `boost_post` lo documenta así
 * (`list_actions` de Windsor, 2026-09-29): el conjunto "MUST belong to an
 * engagement campaign (OUTCOME_ENGAGEMENT) and name the post's page in its
 * promoted_object", con una de dos formas — `ON_POST` + `POST_ENGAGEMENT`, o
 * `FACEBOOK_PAGE` + `PROFILE_AND_PAGE_ENGAGEMENT` (esta última exige además un
 * botón de acción, que el Constructor no fija: solo se admite la primera).
 *
 * Es puro: recibe lo que ya se leyó de la plataforma (`detalle-entidad.ts`). El
 * plan se decide con datos reales leídos por el servidor, nunca con lo que diga
 * el navegador.
 */
import type { DetalleCampana, DetalleConjunto } from "./detalle-entidad";

export type CompatibilidadBoost = {
  /** Se puede crear un conjunto nuevo de impulso dentro de esta campaña. */
  campana: boolean;
  /** Se puede impulsar directo en este conjunto, sin crear nada más. */
  conjunto: boolean;
  /**
   * true: el presupuesto vive en la campaña (Advantage Campaign Budget), así
   * que un conjunto nuevo NO debe llevar el suyo: Meta rechaza tenerlo en los
   * dos niveles a la vez.
   */
  presupuestoEnCampana: boolean;
  /** Por qué no, en palabras del equipo. `null` cuando es compatible. */
  motivo: string | null;
};

const NO_COMPATIBLE = (motivo: string): CompatibilidadBoost => ({
  campana: false,
  conjunto: false,
  presupuestoEnCampana: false,
  motivo,
});

/** La página es la primera mitad del id: `{page_id}_{post_id}`. */
export function paginaDelPost(postId: string): string | null {
  const [pagina, publicacion] = postId.split("_");
  return pagina && publicacion && /^\d+$/.test(pagina) ? pagina : null;
}

export function evaluarCompatibilidadBoost(
  postId: string,
  campana: DetalleCampana | null,
  conjunto: DetalleConjunto | null,
): CompatibilidadBoost {
  const pagina = paginaDelPost(postId);
  if (!pagina) {
    return NO_COMPATIBLE("El id de la publicación no tiene el formato de Meta (página_publicación).");
  }
  if (!campana) {
    return NO_COMPATIBLE(
      "No se pudo leer la campaña de destino, así que no se puede confirmar que admita impulsar. Si está pausada hace mucho, Windsor no la entrega.",
    );
  }
  if (campana.objetivo !== "OUTCOME_ENGAGEMENT") {
    return NO_COMPATIBLE(
      `Meta solo deja impulsar una publicación dentro de una campaña de interacción (OUTCOME_ENGAGEMENT); «${campana.nombre ?? campana.id}» es ${campana.objetivo ?? "de otro tipo"}.`,
    );
  }

  const base = {
    campana: true,
    presupuestoEnCampana: campana.presupuesto.enLaCampana === true,
  };
  if (!conjunto) return { ...base, conjunto: false, motivo: null };

  const nombre = conjunto.nombre ?? conjunto.id;
  const promovida = conjunto.objetoPromovido?.page_id;
  if (conjunto.destino !== "ON_POST" || conjunto.optimizacion !== "POST_ENGAGEMENT") {
    return {
      ...base,
      conjunto: false,
      motivo: `El conjunto «${nombre}» no admite impulsar: necesita destino ON_POST y optimización POST_ENGAGEMENT, y tiene ${conjunto.destino ?? "—"} / ${conjunto.optimizacion ?? "—"}. Elige la campaña para crear un conjunto de impulso nuevo dentro de ella.`,
    };
  }
  if (String(promovida ?? "") !== pagina) {
    return {
      ...base,
      conjunto: false,
      motivo: `El conjunto «${nombre}» promueve otra página (${promovida ?? "ninguna"}) distinta a la de la publicación (${pagina}).`,
    };
  }
  return { ...base, conjunto: true, motivo: null };
}
