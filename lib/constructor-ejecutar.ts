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
        break;
      }
      ids[salida.guarda] = id;
    }
  }

  return { ok: todoBien, pasos: realizados, ids };
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
