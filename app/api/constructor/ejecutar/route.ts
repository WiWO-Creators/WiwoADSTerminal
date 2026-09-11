import { getSession } from "@/app/sesion";
import { getRawDb } from "@/db";
import { detalleClientes } from "@/lib/clientes-detalle";
import {
  buildPlan,
  MARCADOR_PASO_ANTERIOR,
  normalizeDraft,
  type CampaignDraft,
  type CuentaCliente,
  type PlanStep,
} from "@/lib/constructor";
import { getPerformanceSnapshot } from "@/lib/performance-store";
import { can, type Actor } from "@/lib/permisos";
import {
  executeWindsorAction,
  idDeResultado,
  type WindsorProvider,
} from "@/lib/windsor";

/**
 * Ejecuta de verdad el plan del constructor: crea en Google y en Meta.
 *
 * Es la única ruta del sistema que cambia algo fuera de WiWO.ADS. Sus
 * guardarraíles:
 *
 *  - **El plan se reconstruye acá.** No se aceptan los pasos que mande el
 *    navegador: se recibe el mismo borrador que alimenta la simulación y se
 *    vuelve a armar el plan en el servidor. Lo que se aprobó en pantalla es
 *    exactamente lo que corre.
 *  - **Cero problemas bloqueantes.** Si la validación encuentra uno, no se
 *    ejecuta nada.
 *  - **Confirmación explícita.** Sin el campo `confirmacion: "CREAR"` no
 *    arranca, así que una petición perdida no puede crear una campaña.
 *  - **Solo quien aprueba cambios.** Capacidad `aprobar_cambios`.
 *  - **Todo nace pausado.** Lo pone `buildPlan` y Windsor lo respeta: nada
 *    empieza a gastar por esta vía.
 *  - **Se detiene en el primer error** y devuelve qué alcanzó a crear, para
 *    que nadie tenga que adivinar en qué estado quedó la cuenta.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/** Qué id de un paso anterior necesita cada acción, y cómo se llama su campo. */
const PADRE_REQUERIDO: Record<string, { campo: string; de: ClaveId }> = {
  create_ad_group: { campo: "campaign_id", de: "campaign" },
  create_responsive_search_ad: { campo: "ad_group_id", de: "adGroup" },
  push_keywords: { campo: "ad_group_id", de: "adGroup" },
  set_campaign_geo_targeting: { campo: "campaign_id", de: "campaign" },
  create_adset: { campo: "campaign_id", de: "campaign" },
  create_ad: { campo: "adset_id", de: "adset" },
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

type ClaveId = "campaign" | "adGroup" | "adset" | "video";

type PasoEjecutado = {
  platform: string;
  action: string;
  label: string;
  params: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  raw: unknown;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "aprobar_cambios")) {
    return fail(
      "Tu rol puede armar campañas pero no publicarlas. Pídele a un administrador que la apruebe.",
      403,
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fail("Origen no permitido", 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415);
  }

  const body = (await request.json()) as {
    draft?: Partial<CampaignDraft>;
    confirmacion?: string;
  };
  if (body.confirmacion !== "CREAR") {
    return fail("Falta la confirmación explícita", 400);
  }

  // Mismo normalizado que la simulación: una sola definición de qué es un
  // borrador válido, para que no puedan divergir.
  const draft = normalizeDraft(body.draft ?? {});

  const [snapshot, { clientes }] = await Promise.all([
    getPerformanceSnapshot(session.actor),
    detalleClientes(session.actor, new Date()),
  ]);
  // El alcance sale de los permisos, no del gasto: se crean campañas
  // precisamente para clientes que hoy no tienen nada corriendo.
  if (!enAlcance(session.actor, draft.portfolioId)) {
    return fail("Ese cliente no está en tu alcance", 403);
  }
  const portfolio =
    snapshot.portfolios.find((item) => item.id === draft.portfolioId) ?? null;
  const cliente = clientes.find((item) => item.id === draft.portfolioId);
  const cuentas: CuentaCliente[] = cliente?.accounts ?? [];

  const plan = buildPlan(draft, portfolio, cuentas, snapshot);
  const bloqueantes = plan.issues.filter((issue) => issue.blocking);
  if (bloqueantes.length > 0) {
    return Response.json(
      {
        error: "El plan todavía tiene problemas por resolver",
        issues: bloqueantes,
      },
      { status: 422, headers: NO_STORE },
    );
  }

  const ejecutables = plan.steps.filter((step) => !step.informativo);
  if (ejecutables.length === 0) {
    return fail("El plan no tiene ningún paso que ejecutar", 422);
  }

  const ids: Partial<Record<ClaveId, string>> = {};
  const realizados: PasoEjecutado[] = [];
  let todoBien = true;

  for (const step of ejecutables) {
    const cuenta = cuentaDe(step, draft, cuentas);
    if (!cuenta) {
      realizados.push({
        ...resumen(step),
        ok: false,
        error: `No se pudo resolver la cuenta de ${step.platform}`,
        raw: null,
      });
      todoBien = false;
      break;
    }

    const params = { ...step.params };

    // Encadenar con lo creado antes — pero solo cuando el paso todavía no
    // trae el id real. `buildPlan` marca "esto hace falta encadenar" de dos
    // formas: o el campo directamente no está (create_ad_group al crear
    // campaña nueva), o queda con el texto `MARCADOR_PASO_ANTERIOR` (los
    // demás pasos). Las dos cuentan como "hace falta encadenar"; cualquier
    // otro valor es un id real —de adjuntar a algo que ya existe— y no se
    // toca. Añadir un conjunto a una campaña real manda su `campaign_id`
    // desde el principio, sin haber creado nada en este plan; sobreescribirlo
    // con `ids` (vacío, porque acá no se creó ninguna campaña) rompía
    // justo ese caso con un error falso.
    const padre = PADRE_REQUERIDO[step.action];
    if (padre && esMarcadorDePasoAnterior(params[padre.campo])) {
      const valor = ids[padre.de];
      if (!valor) {
        realizados.push({
          ...resumen(step),
          ok: false,
          error: `Falta el identificador del paso anterior (${padre.campo})`,
          raw: null,
        });
        todoBien = false;
        break;
      }
      params[padre.campo] = valor;
    }
    // El video se sube en un paso previo; el anuncio lo referencia.
    if (params.video_id === MARCADOR_PASO_ANTERIOR) {
      if (!ids.video) {
        realizados.push({
          ...resumen(step),
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
        // Se creó algo pero no sabemos su id: seguir encadenando a ciegas
        // crearía huérfanos, así que se corta y se dice exactamente eso.
        realizados.push({
          ...resumen(step),
          ok: false,
          error:
            "La plataforma creó el objeto pero no devolvió un identificador reconocible. Revisa la cuenta antes de reintentar: puede haber quedado creado.",
          raw: resultado.raw,
        });
        todoBien = false;
        break;
      }
      ids[salida.guarda] = id;
    }
  }

  await registrar(draft, session.actor.email, realizados, todoBien);

  return Response.json(
    {
      ok: todoBien,
      steps: realizados,
      ids,
      // Lo creado nace pausado: hay que activarlo en la plataforma.
      aviso: todoBien
        ? "Creado y pausado. Revísalo en la plataforma y actívalo ahí cuando quieras que empiece a entregar."
        : "Se detuvo en el primer error. Los pasos marcados como correctos sí se crearon.",
    },
    { status: todoBien ? 200 : 502, headers: NO_STORE },
  );
}

/** Si un valor de parámetro todavía necesita el id de un paso anterior. */
function esMarcadorDePasoAnterior(valor: unknown): boolean {
  return valor === undefined || valor === MARCADOR_PASO_ANTERIOR;
}

function resumen(step: PlanStep) {
  return {
    platform: step.platform as string,
    action: step.action,
    label: step.label,
    params: step.params,
  };
}

/** La cuenta elegida para esa plataforma, o la única que tenga el cliente. */
function cuentaDe(
  step: PlanStep,
  draft: CampaignDraft,
  cuentas: CuentaCliente[],
): CuentaCliente | null {
  const delPlatform = cuentas.filter((c) => c.provider === step.platform);
  const elegida = draft.accountByPlatform[step.platform];
  if (elegida) {
    return delPlatform.find((c) => c.externalId === elegida) ?? null;
  }
  return delPlatform.length === 1 ? delPlatform[0] : null;
}

async function registrar(
  draft: CampaignDraft,
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
    // el usuario necesita verlo aunque la bitácora falle.
    console.error("WiWO.ADS no pudo registrar la ejecución", error);
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

/** Ver la nota en la ruta de simulación: alcance por permisos, no por gasto. */
function enAlcance(actor: Actor, portfolioId: string): boolean {
  if (can(actor, "ver_todos_los_clientes")) return true;
  return actor.portfolioIds.includes(portfolioId);
}
