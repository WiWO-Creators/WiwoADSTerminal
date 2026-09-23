import { getRawDb } from "@/db";
import {
  MARCADOR_PASO_ANTERIOR,
  type CampaignDraft,
  type CuentaCliente,
  type PlanStep,
} from "@/lib/constructor";
import { executeWindsorAction, idDeResultado, type WindsorProvider } from "@/lib/windsor";

/**
 * El bucle real que ejecuta un plan del Constructor contra Windsor —
 * encadenando ids entre pasos, deteniéndose en el primer error. Solo lo llama
 * `app/api/constructor/ejecutar/route.ts`, al publicar desde la pantalla del
 * Constructor con confirmación explícita de una persona — el asistente de IA
 * nunca escribe en una plataforma directamente.
 *
 * No valida el borrador ni resuelve permisos: eso es responsabilidad de quien
 * llama, antes de invocar esto. Lo único que hace es correr los pasos que se
 * le pasan, en orden, contra la cuenta real.
 */

/** Qué id de un paso anterior necesita cada acción, y cómo se llama su campo. */
const PADRE_REQUERIDO: Record<string, { campo: string; de: ClaveId }> = {
  create_ad_group: { campo: "campaign_id", de: "campaign" },
  create_responsive_search_ad: { campo: "ad_group_id", de: "adGroup" },
  push_keywords: { campo: "ad_group_id", de: "adGroup" },
  set_campaign_geo_targeting: { campo: "campaign_id", de: "campaign" },
  // Los tres de acá abajo faltaban: buildPlan (lib/constructor.ts) ya los
  // arma con `campaign_id: MARCADOR_PASO_ANTERIOR` para una campaña nueva,
  // pero sin una entrada acá ese marcador nunca se reemplazaba por el id
  // real — se le mandaba a Windsor el texto literal "(del paso anterior)"
  // como campaign_id. Encontrado en una revisión de código, no en un reporte
  // de usuario: nunca llegó a fallar en vivo porque las pruebas de esta
  // sesión con negativas/tope de CPC/idiomas siempre se hicieron adjuntando
  // a una cuenta con `enCampanaExistente`, el otro camino que sí trae el id.
  push_negative_keywords: { campo: "campaign_id", de: "campaign" },
  set_cpc_bid_ceiling: { campo: "campaign_id", de: "campaign" },
  set_campaign_language_targeting: { campo: "campaign_id", de: "campaign" },
  create_adset: { campo: "campaign_id", de: "campaign" },
  create_ad: { campo: "adset_id", de: "adset" },
  boost_post: { campo: "adset_id", de: "adset" },
};

/** Claves donde cada plataforma deja el id de lo que acaba de crear. */
const CLAVES_DE_ID: Record<string, { guarda: ClaveId; claves: string[] }> = {
  create_campaign: {
    guarda: "campaign",
    claves: ["campaign_id", "campaignId", "id"],
  },
  create_ad_group: {
    guarda: "adGroup",
    claves: ["ad_group_id", "adGroupId", "id"],
  },
  create_adset: { guarda: "adset", claves: ["adset_id", "adsetId", "id"] },
  create_ad_video: { guarda: "video", claves: ["video_id", "videoId", "id"] },
};

/**
 * Acción de cada plataforma que sirve para renombrar una campaña ya creada —
 * verificado contra `list_actions` real: `rename_campaign` en `google_ads`,
 * `update_campaign` (que sí admite `name`) en `facebook`, ninguna de las dos
 * llamada "delete": Windsor no puede borrar una campaña, solo pausarla o
 * renombrarla.
 */
const ACCION_DE_RENOMBRE: Partial<Record<WindsorProvider, string>> = {
  google: "rename_campaign",
  meta: "update_campaign",
};

/**
 * Prefijo que deja una campaña orfanada visible de un vistazo en la propia
 * plataforma — no solo en el chat de WiWO.ADS — cuando un paso hijo (conjunto,
 * grupo o anuncio) falla después de que la campaña sí se creó.
 */
export const PREFIJO_INCOMPLETA = "[INCOMPLETA — revisar] ";

export type ClaveId = "campaign" | "adGroup" | "adset" | "video";

export type PasoEjecutado = {
  platform: string;
  action: string;
  label: string;
  params: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  raw: unknown;
};

export type ResultadoEjecucion = {
  ok: boolean;
  pasos: PasoEjecutado[];
  ids: Partial<Record<ClaveId, string>>;
  /**
   * Cuando un paso hijo falla después de que la campaña ya se creó de
   * verdad: qué campaña quedó así y si se pudo marcar en la plataforma real
   * (renombrándola con `PREFIJO_INCOMPLETA`) para que no pase inadvertida.
   * Windsor no tiene forma de borrar una campaña — pausarla no evita
   * confundirla con una intencional, así que el aviso queda en el nombre.
   */
  campanaIncompleta: {
    platform: string;
    campaignId: string;
    nombreOriginal: string;
    marcada: boolean;
  } | null;
};

/** Si un valor de parámetro todavía necesita el id de un paso anterior. */
function esMarcadorDePasoAnterior(valor: unknown): boolean {
  return valor === undefined || valor === MARCADOR_PASO_ANTERIOR;
}

function resumen(step: PlanStep) {
  return {
    platform: step.platform as string,
    action: step.action,
    label: step.label,
  };
}

/** La cuenta elegida para esa plataforma, o la única que tenga el cliente. */
export function cuentaDe(
  step: Pick<PlanStep, "platform">,
  draft: Pick<CampaignDraft, "accountByPlatform">,
  cuentas: CuentaCliente[],
): CuentaCliente | null {
  const delPlatform = cuentas.filter((c) => c.provider === step.platform);
  const elegida = draft.accountByPlatform[step.platform];
  if (elegida) {
    return delPlatform.find((c) => c.externalId === elegida) ?? null;
  }
  return delPlatform.length === 1 ? delPlatform[0] : null;
}

export async function ejecutarPasosDelPlan(
  steps: PlanStep[],
  draft: Pick<CampaignDraft, "accountByPlatform">,
  cuentas: CuentaCliente[],
): Promise<ResultadoEjecucion> {
  const ejecutables = steps.filter((step) => !step.informativo);
  const ids: Partial<Record<ClaveId, string>> = {};
  const realizados: PasoEjecutado[] = [];
  let todoBien = true;
  // Campaña ya creada de verdad para cada plataforma en este plan — para
  // poder marcarla si un paso hijo (conjunto, grupo o anuncio) falla después.
  const campanaPorPlataforma: Partial<
    Record<WindsorProvider, { id: string; nombre: string; accountId: string }>
  > = {};
  let pasoFallido: PlanStep | null = null;

  for (const step of ejecutables) {
    const cuenta = cuentaDe(step, draft, cuentas);
    if (!cuenta) {
      realizados.push({
        ...resumen(step),
        params: step.params,
        ok: false,
        error: `No se pudo resolver la cuenta de ${step.platform}`,
        raw: null,
      });
      todoBien = false;
      pasoFallido = step;
      break;
    }

    const params = { ...step.params };

    const padre = PADRE_REQUERIDO[step.action];
    if (padre && esMarcadorDePasoAnterior(params[padre.campo])) {
      const valor = ids[padre.de];
      if (!valor) {
        realizados.push({
          ...resumen(step),
          params,
          ok: false,
          error: `Falta el identificador del paso anterior (${padre.campo})`,
          raw: null,
        });
        todoBien = false;
        pasoFallido = step;
        break;
      }
      params[padre.campo] = valor;
    }
    if (params.video_id === MARCADOR_PASO_ANTERIOR) {
      if (!ids.video) {
        realizados.push({
          ...resumen(step),
          params,
          ok: false,
          error: "Falta el identificador del video subido",
          raw: null,
        });
        todoBien = false;
        pasoFallido = step;
        break;
      }
      params.video_id = ids.video;
    }

    const resultado = await executeWindsorAction(
      step.platform as WindsorProvider,
      cuenta.externalId,
      step.action,
      params,
    );
    realizados.push({
      ...resumen(step),
      params,
      ok: resultado.ok,
      error: resultado.error,
      raw: resultado.raw,
    });

    if (!resultado.ok) {
      todoBien = false;
      pasoFallido = step;
      break;
    }

    const salida = CLAVES_DE_ID[step.action];
    if (salida) {
      const id = idDeResultado(resultado.raw, salida.claves);
      if (!id) {
        realizados[realizados.length - 1] = {
          ...resumen(step),
          params,
          ok: false,
          error:
            "La plataforma creó el objeto pero no devolvió un identificador reconocible. Revisa la cuenta antes de reintentar: puede haber quedado creado.",
          raw: resultado.raw,
        };
        todoBien = false;
        pasoFallido = step;
        break;
      }
      ids[salida.guarda] = id;
      if (step.action === "create_campaign") {
        campanaPorPlataforma[step.platform as WindsorProvider] = {
          id,
          nombre: typeof params.name === "string" ? params.name : "",
          accountId: cuenta.externalId,
        };
      }
    }
  }

  // Un paso hijo (conjunto, grupo o anuncio) falló después de que la campaña
  // de esa misma plataforma sí se creó: queda huérfana, pausada (nunca gasta
  // sola) pero indistinguible de una campaña real a simple vista. Windsor no
  // puede borrarla — solo renombrarla o pausarla, y ya nace pausada — así que
  // se marca en su nombre real, en la plataforma, no solo en este reporte.
  let campanaIncompleta: ResultadoEjecucion["campanaIncompleta"] = null;
  if (!todoBien && pasoFallido && pasoFallido.action !== "create_campaign") {
    const huerfana = campanaPorPlataforma[pasoFallido.platform as WindsorProvider];
    if (huerfana) {
      const accion = ACCION_DE_RENOMBRE[pasoFallido.platform as WindsorProvider];
      let marcada = false;
      if (accion) {
        const nombreMarcado = `${PREFIJO_INCOMPLETA}${huerfana.nombre}`.slice(0, 255);
        const renombre = await executeWindsorAction(
          pasoFallido.platform as WindsorProvider,
          huerfana.accountId,
          accion,
          { campaign_id: huerfana.id, name: nombreMarcado },
        );
        marcada = renombre.ok;
        realizados.push({
          platform: pasoFallido.platform,
          action: accion,
          label: `Marcar la campaña como incompleta (falló ${pasoFallido.label.toLowerCase()})`,
          params: { campaign_id: huerfana.id, name: nombreMarcado },
          ok: renombre.ok,
          error: renombre.error,
          raw: renombre.raw,
        });
      }
      campanaIncompleta = {
        platform: pasoFallido.platform,
        campaignId: huerfana.id,
        nombreOriginal: huerfana.nombre,
        marcada,
      };
    }
  }

  return { ok: todoBien, pasos: realizados, ids, campanaIncompleta };
}

/**
 * El id nativo que dejó un paso de creación ya ejecutado, releído de su
 * propia respuesta cruda — no de `ids` (que solo guarda uno por tipo, así
 * que una campaña de Google y otra de Meta creadas en el mismo plan se
 * pisan entre sí ahí). Sirve para verificar, por plataforma, que lo que
 * Windsor dijo que creó existe de verdad — ver `actualizarCatalogoDeCuentas`
 * en `lib/windsor.ts`.
 */
export function idDeCreacion(paso: PasoEjecutado): string | null {
  if (!paso.ok) return null;
  const salida = CLAVES_DE_ID[paso.action];
  if (!salida) return null;
  return idDeResultado(paso.raw, salida.claves);
}

/**
 * Última revisión de duplicado antes de ejecutar: si en las últimas 6 horas
 * ya se publicó (o se intentó publicar y algo quedó creado) una campaña con
 * este nombre para este cliente, hay que confirmar antes de repetirla —
 * Windsor no puede borrar lo que ya se creó. Comparte esta regla la ruta HTTP
 * del Constructor y la creación real que puede hacer el asistente de IA.
 */
export async function publicacionReciente(
  portfolioId: string,
  campaignName: string,
): Promise<{ creado: string[]; hace: number } | null> {
  const previa = await getRawDb()
    .prepare(
      `SELECT created_at, steps_json FROM ejecuciones
       WHERE portfolio_id = ? AND campaign_name = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(portfolioId, campaignName, Date.now() - 6 * 60 * 60 * 1000)
    .first<{ created_at: number; steps_json: string }>();
  if (!previa) return null;
  const creados = (JSON.parse(previa.steps_json) as PasoEjecutado[]).filter(
    (paso) => paso.ok,
  );
  if (creados.length === 0) return null;
  return {
    creado: creados.map((paso) => `${paso.platform}: ${paso.label}`),
    hace: Date.now() - Number(previa.created_at),
  };
}

export async function registrarEjecucion(
  draft: Pick<CampaignDraft, "portfolioId" | "name" | "platforms">,
  email: string,
  pasos: PasoEjecutado[],
  ok: boolean,
): Promise<void> {
  try {
    await getRawDb()
      .prepare(
        `INSERT INTO ejecuciones
           (id, portfolio_id, actor_email, campaign_name, platforms,
            steps_json, ok, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        draft.portfolioId,
        email,
        draft.name,
        draft.platforms.join(","),
        JSON.stringify(pasos),
        ok ? 1 : 0,
        Date.now(),
      )
      .run();
  } catch (error) {
    // El registro no puede tumbar la respuesta: lo que se creó ya se creó, y
    // quien lo pidió necesita verlo aunque la bitácora falle.
    console.error("WiWO.ADS no pudo registrar la ejecución", error);
  }
}
