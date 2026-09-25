import { getSession } from "@/app/sesion";
import { mismoOrigen } from "@/lib/origen-publico";
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
 *
 * Un cambio relevante (no un simple renombre) sobre una campaña, conjunto o
 * anuncio que ya existe pausa esa misma entidad después de aplicarse — para
 * que alguien la revise antes de que siga corriendo con lo nuevo. Decisión
 * del 24-09-2026: cambiar el nombre "no afecta el flujo" y queda afuera de
 * la regla; todo lo demás (contenido, presupuesto, fechas, cuenta o número
 * asociado, segmentación…) sí pausa. Ver `entidadDeLaAccion` y
 * `esSoloRenombre`.
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
    "set_max_cpc",
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

type NivelEdicion = "campana" | "conjunto" | "anuncio";

/**
 * Campos de `params` que nunca cuentan como "cambio relevante": el id de la
 * entidad (viaja siempre, sin importar qué se edite) y el nombre (cambiarlo
 * no afecta el flujo de la campaña, conjunto o anuncio — confirmado con el
 * equipo). Si después de sacarlos no queda ningún campo, es un renombre puro
 * y no se pausa nada.
 */
const CAMPOS_SIN_EFECTO_EN_FLUJO = new Set([
  "campaign_id",
  "ad_group_id",
  "adset_id",
  "ad_id",
  "name",
]);

function esSoloRenombre(params: Record<string, unknown>): boolean {
  return Object.keys(params).every((clave) => CAMPOS_SIN_EFECTO_EN_FLUJO.has(clave));
}

/**
 * A qué entidad apunta cada acción y con qué id — para decidir qué pausar
 * después de un cambio relevante. `push_negative_keywords` y
 * `create_ad_asset` sirven tanto a nivel campaña como grupo de anuncios
 * (Windsor lo decide por qué id viene, no por un campo `level` separado):
 * se prueba `ad_group_id` primero porque, si viene, la acción apuntó ahí.
 */
function entidadDeLaAccion(
  provider: WindsorProvider,
  action: string,
  params: Record<string, unknown>,
): { nivel: NivelEdicion; id: string } | null {
  const id = (clave: string): string | null => {
    const valor = params[clave];
    return typeof valor === "string" && valor ? valor : null;
  };

  if (provider === "google") {
    switch (action) {
      case "set_campaign_budget":
      case "rename_campaign":
      case "set_campaign_bidding_strategy":
      case "set_target_cpa":
      case "set_target_roas":
      case "set_cpc_bid_ceiling":
      case "set_campaign_language_targeting":
      case "set_ad_schedule": {
        const campaignId = id("campaign_id");
        return campaignId ? { nivel: "campana", id: campaignId } : null;
      }
      case "rename_ad_group":
      case "set_max_cpc":
      case "attach_user_list_to_ad_group":
      case "detach_user_list_from_ad_group": {
        const adGroupId = id("ad_group_id");
        return adGroupId ? { nivel: "conjunto", id: adGroupId } : null;
      }
      case "push_negative_keywords":
      case "create_ad_asset": {
        const adGroupId = id("ad_group_id");
        if (adGroupId) return { nivel: "conjunto", id: adGroupId };
        const campaignId = id("campaign_id");
        return campaignId ? { nivel: "campana", id: campaignId } : null;
      }
      // Listas de Customer Match sin campaña/grupo puntual (crear, subir,
      // ver estado, renombrar, eliminar): no hay nada que pausar.
      default:
        return null;
    }
  }

  if (provider === "meta") {
    switch (action) {
      case "set_campaign_budget":
      case "update_campaign": {
        const campaignId = id("campaign_id");
        return campaignId ? { nivel: "campana", id: campaignId } : null;
      }
      case "set_adset_budget":
      case "update_adset": {
        const adsetId = id("adset_id");
        return adsetId ? { nivel: "conjunto", id: adsetId } : null;
      }
      case "update_ad":
      case "update_ad_creative": {
        const adId = id("ad_id");
        return adId ? { nivel: "anuncio", id: adId } : null;
      }
      default:
        return null;
    }
  }

  return null;
}

/** Acción real de Windsor que pausa cada nivel, con el nombre del parámetro
 * de id que espera. Google no tiene edición de contenido de anuncio (por
 * eso no aparece "anuncio" acá del lado de Google): esa rama nunca se pisa. */
const PAUSAR_NIVEL: Record<
  WindsorProvider,
  Partial<Record<NivelEdicion, { action: string; param: string }>>
> = {
  google: {
    campana: { action: "pause_campaign", param: "campaign_id" },
    conjunto: { action: "pause_ad_group", param: "ad_group_id" },
  },
  meta: {
    campana: { action: "pause_campaign", param: "campaign_id" },
    conjunto: { action: "pause_adset", param: "adset_id" },
    anuncio: { action: "pause_ad", param: "ad_id" },
  },
  tiktok: {},
  linkedin: {},
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "aprobar_cambios")) {
    return fail("Tu rol no puede editar campañas ya publicadas", 403);
  }

  if (!mismoOrigen(request)) {
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

  // Un cambio relevante (no un simple renombre) sobre algo que ya existe
  // pausa esa misma entidad, para que alguien la revise antes de que siga
  // corriendo con lo nuevo. Encadenada, no condicionada al estado previo:
  // pausar algo que ya estaba pausado es una llamada extra inofensiva, y
  // evita una lectura previa solo para confirmarlo.
  let pausado: { nivel: NivelEdicion } | null = null;
  if (!esSoloRenombre(body.params)) {
    const entidad = entidadDeLaAccion(provider, action, body.params);
    const receta = entidad ? PAUSAR_NIVEL[provider][entidad.nivel] : null;
    if (entidad && receta) {
      const pausa = await executeWindsorAction(provider, body.accountId, receta.action, {
        [receta.param]: entidad.id,
      });
      // Si la pausa falla, el cambio real ya se aplicó igual: se avisa en la
      // respuesta en vez de fingir que se revirtió algo que nunca se tocó.
      if (pausa.ok) pausado = { nivel: entidad.nivel };
    }
  }

  return Response.json(
    { ok: true, data: resultado.raw, pausado },
    { headers: NO_STORE },
  );
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
