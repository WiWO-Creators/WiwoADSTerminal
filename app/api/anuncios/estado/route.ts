import { getSession } from "@/app/sesion";
import { can } from "@/lib/permisos";
import { isActivePlatform } from "@/lib/plataformas";
import { executeWindsorAction, type WindsorProvider } from "@/lib/windsor";

/**
 * Pausa o activa una campaña, un conjunto o un anuncio ya existente.
 *
 * A diferencia del constructor, esto no crea nada: cambia el estado de algo
 * que ya está en la plataforma. Es reversible en el sentido más literal — la
 * acción contraria deshace exactamente esto — pero sigue siendo una escritura
 * real, así que exige la misma capacidad que publicar (`aprobar_cambios`).
 *
 * Las acciones y sus parámetros son las que expone Windsor
 * (`list_actions` sobre `facebook` y `google_ads`, verificado el 10-09-2026):
 * Google separa campaña, grupo de anuncios y anuncio con `enable_*`/`pause_*`
 * propios; Meta hace lo mismo con campaña, conjunto y anuncio.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

type Nivel = "campana" | "conjunto" | "anuncio";

const ACCION: Record<
  WindsorProvider,
  Record<Nivel, { enable: string; pause: string; params: string[] }>
> = {
  google: {
    campana: {
      enable: "enable_campaign",
      pause: "pause_campaign",
      params: ["campaign_id"],
    },
    conjunto: {
      enable: "enable_ad_group",
      pause: "pause_ad_group",
      params: ["ad_group_id"],
    },
    anuncio: {
      enable: "enable_ad",
      pause: "pause_ad",
      params: ["ad_group_id", "ad_id"],
    },
  },
  meta: {
    campana: {
      enable: "enable_campaign",
      pause: "pause_campaign",
      params: ["campaign_id"],
    },
    conjunto: {
      enable: "enable_adset",
      pause: "pause_adset",
      params: ["adset_id"],
    },
    anuncio: { enable: "enable_ad", pause: "pause_ad", params: ["ad_id"] },
  },
  // Declaradas pero inactivas: si algún día se activan, sus acciones de
  // pausa/activación reales van acá, no antes.
  tiktok: {
    campana: { enable: "", pause: "", params: [] },
    conjunto: { enable: "", pause: "", params: [] },
    anuncio: { enable: "", pause: "", params: [] },
  },
  linkedin: {
    campana: { enable: "", pause: "", params: [] },
    conjunto: { enable: "", pause: "", params: [] },
    anuncio: { enable: "", pause: "", params: [] },
  },
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return fail("Tu cuenta no tiene acceso a WiWO.ADS", 403);
  if (!can(session.actor, "aprobar_cambios")) {
    return fail("Tu rol no puede pausar ni activar anuncios", 403);
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
    nivel?: string;
    accountId?: string;
    campaignId?: string | null;
    adsetId?: string | null;
    adId?: string | null;
    activar?: boolean;
  };

  const provider = body.provider ?? "";
  if (!isActivePlatform(provider)) {
    return fail("Plataforma no reconocida o todavía no activa", 400);
  }
  const nivel = body.nivel as Nivel;
  if (!["campana", "conjunto", "anuncio"].includes(nivel)) {
    return fail("Nivel no reconocido", 400);
  }
  if (!body.accountId) return fail("Falta la cuenta", 400);

  const receta = ACCION[provider][nivel];
  const action = body.activar ? receta.enable : receta.pause;
  if (!action) {
    return fail(`${provider} todavía no tiene esta acción disponible`, 400);
  }

  const valores: Record<string, string | null | undefined> = {
    campaign_id: body.campaignId,
    ad_group_id: body.adsetId,
    adset_id: body.adsetId,
    ad_id: body.adId,
  };
  const params: Record<string, unknown> = {};
  for (const clave of receta.params) {
    const valor = valores[clave];
    if (!valor) {
      return fail(
        `Falta el identificador (${clave}) para ${nivel === "campana" ? "la campaña" : nivel === "conjunto" ? "el conjunto" : "el anuncio"}`,
        400,
      );
    }
    params[clave] = valor;
  }

  const resultado = await executeWindsorAction(
    provider,
    body.accountId,
    action,
    params,
  );

  if (!resultado.ok) {
    return Response.json(
      { ok: false, error: resultado.error },
      { status: 502, headers: NO_STORE },
    );
  }
  return Response.json({ ok: true }, { headers: NO_STORE });
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
