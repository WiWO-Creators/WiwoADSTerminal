import { getSession } from "@/app/sesion";
import { can } from "@/lib/permisos";
import { isActivePlatform } from "@/lib/plataformas";
import { executeWindsorAction, type WindsorProvider } from "@/lib/windsor";

/**
 * Escrituras sobre algo que ya existe, fuera del flujo de creación del
 * constructor: presupuesto, nombre, estrategia de puja, idiomas, horario,
 * palabras clave negativas y extensiones de anuncio de una campaña o
 * conjunto (`app/gestionar-campana.tsx`), y las audiencias de Customer
 * Match de Google (`app/audiencias-view.tsx`) — crear lista, subir
 * contactos, ver estado de una subida, adjuntar o excluir de un grupo de
 * anuncios, renombrar y eliminar. A diferencia del constructor esto no crea
 * campañas nuevas, y a diferencia de `/api/anuncios/estado` no siempre es
 * reversible con un solo clic contrario (borrar una lista no lo es) — sigue
 * siendo una escritura real, así que exige la misma capacidad que publicar
 * (`aprobar_cambios`).
 *
 * Cada acción es una de las que expone Windsor tal cual (`list_actions` sobre
 * `facebook` y `google_ads`, verificado el 17-09-2026) — la lista blanca de
 * abajo existe para no dejar ejecutar cualquier acción de escritura desde acá
 * (por ejemplo, una que crea o borra algo), no porque el formato del cuerpo
 * cambie: los parámetros viajan tal cual los arma la pantalla, igual que ya
 * hace el ejecutor del constructor con el plan completo.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

const ACCIONES_PERMITIDAS: Record<WindsorProvider, string[]> = {
  google: [
    "set_campaign_budget",
    "rename_campaign",
    "rename_ad_group",
    "set_campaign_bidding_strategy",
    "set_target_cpa",
    "set_target_roas",
    "set_cpc_bid_ceiling",
    "set_campaign_language_targeting",
    "set_ad_schedule",
    "push_negative_keywords",
    "create_ad_asset",
    "create_customer_match_list",
    "upload_customer_match_list",
    "get_customer_match_upload_status",
    "attach_user_list_to_ad_group",
    "detach_user_list_from_ad_group",
    "rename_customer_match_list",
    "delete_customer_match_list",
  ],
  meta: [
    "set_campaign_budget",
    "set_adset_budget",
    "update_campaign",
    "update_adset",
    "update_ad",
    "update_ad_creative",
  ],
  tiktok: [],
  linkedin: [],
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "aprobar_cambios")) {
    return fail("Tu rol no puede editar campañas ya publicadas", 403);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return fail("Origen no permitido", 403);
  }
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return fail("Formato de solicitud no válido", 415);
  }

  const body = (await request.json()) as {
    provider?: string;
    accountId?: string;
    action?: string;
    params?: Record<string, unknown>;
  };

  const provider = body.provider ?? "";
  if (!isActivePlatform(provider)) {
    return fail("Plataforma no reconocida o todavía no activa", 400);
  }
  const action = body.action ?? "";
  if (!ACCIONES_PERMITIDAS[provider].includes(action)) {
    return fail(`Acción no reconocida para ${provider}`, 400);
  }
  if (!body.accountId) return fail("Falta la cuenta", 400);
  if (!body.params || typeof body.params !== "object") {
    return fail("Faltan los parámetros de la acción", 400);
  }

  const resultado = await executeWindsorAction(
    provider,
    body.accountId,
    action,
    body.params,
  );

  if (!resultado.ok) {
    return Response.json(
      { ok: false, error: resultado.error },
      { status: 502, headers: NO_STORE },
    );
  }
  return Response.json({ ok: true, data: resultado.raw }, { headers: NO_STORE });
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
