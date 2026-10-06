import type { PasoEjecutado } from "@/lib/constructor-ejecutar";
import type { CambiosRsa, CredencialesGoogle } from "@/lib/google-ads-nativo";
import {
  actualizarAnuncioRsa,
  actualizarCampanaGoogle,
  GoogleAdsNativoError,
  type CambiosCampanaGoogle,
} from "@/lib/google-ads-nativo";
import type { PasoEdicion } from "@/lib/edicion-plan";
import type { NivelEntidad, Platform } from "@/lib/plataformas";
import { executeWindsorAction } from "@/lib/windsor";

/**
 * Acción de Windsor que pausa cada nivel, con los parámetros que pide. Google
 * pausa un anuncio con su grupo y su id; Meta, solo con el id.
 */
function pausa(
  provider: Platform,
  nivel: NivelEntidad,
  ids: { campaignId: string | null; conjuntoId: string | null; id: string },
): { action: string; params: Record<string, unknown> } | null {
  if (provider === "google") {
    if (nivel === "campana") return { action: "pause_campaign", params: { campaign_id: ids.id } };
    if (nivel === "conjunto") return { action: "pause_ad_group", params: { ad_group_id: ids.id } };
    return ids.conjuntoId
      ? { action: "pause_ad", params: { ad_group_id: ids.conjuntoId, ad_id: ids.id } }
      : null;
  }
  if (provider === "meta") {
    if (nivel === "campana") return { action: "pause_campaign", params: { campaign_id: ids.id } };
    if (nivel === "conjunto") return { action: "pause_adset", params: { adset_id: ids.id } };
    return { action: "pause_ad", params: { ad_id: ids.id } };
  }
  if (provider === "linkedin") {
    // Campaña (UI) = grupo de campañas; conjunto (UI) = campaign.
    if (nivel === "campana") return { action: "pause_campaign_group", params: { campaign_group_id: ids.id } };
    if (nivel === "conjunto") return { action: "pause_campaign", params: { campaign_id: ids.id } };
    return { action: "pause_creative", params: { creative_id: ids.id } };
  }
  return null;
}

export type ResultadoEdicion = {
  ok: boolean;
  pasos: PasoEjecutado[];
  /** null: no se pidió pausar. `ok:false` conserva que el cambio SÍ se aplicó. */
  pausa: { ok: boolean; error: string | null } | null;
};

/**
 * Ejecuta los pasos en orden y se detiene en el primer error, igual que el
 * constructor: lo que ya se aplicó queda aplicado, y se devuelve para que
 * nadie tenga que adivinar en qué estado quedó la entidad.
 *
 * La pausa posterior solo corre si todo lo anterior salió bien. Si falla, el
 * cambio ya está en la plataforma: se avisa, no se finge que se revirtió.
 */
export async function ejecutarPasosDeEdicion({
  provider,
  accountId,
  nivel,
  ids,
  pasos,
  pausarAlFinal,
  credencialesGoogle,
}: {
  provider: Platform;
  accountId: string;
  nivel: NivelEntidad;
  ids: { campaignId: string | null; conjuntoId: string | null; id: string };
  pasos: PasoEdicion[];
  pausarAlFinal: boolean;
  credencialesGoogle: CredencialesGoogle | null;
}): Promise<ResultadoEdicion> {
  const realizados: PasoEjecutado[] = [];

  for (const paso of pasos) {
    let ok = false;
    let error: string | null = null;
    let raw: unknown = null;

    if (paso.via === "nativa") {
      if (!credencialesGoogle) {
        error = "Falta conectar tu cuenta de Google en Integraciones.";
      } else {
        try {
          const r =
            paso.action === "ads:update_campaign"
              ? await actualizarCampanaGoogle(
                  credencialesGoogle,
                  accountId,
                  String(paso.params.campaign_id),
                  paso.params.cambios as CambiosCampanaGoogle,
                )
              : await actualizarAnuncioRsa(credencialesGoogle, accountId, String(paso.params.ad_id), paso.params.cambios as CambiosRsa);
          ok = true;
          raw = r;
        } catch (e) {
          error = e instanceof GoogleAdsNativoError ? e.message : "No se pudo editar el anuncio en Google Ads.";
          raw = e instanceof GoogleAdsNativoError ? e.detalle : String(e);
        }
      }
    } else {
      const r = await executeWindsorAction(provider, accountId, paso.action, paso.params);
      ok = r.ok;
      error = r.ok ? null : (r.error ?? "Windsor rechazó el cambio");
      raw = r.raw;
    }

    realizados.push({
      platform: paso.platform,
      action: paso.action,
      label: paso.label,
      params: paso.params,
      ok,
      error,
      raw,
    });
    if (!ok) return { ok: false, pasos: realizados, pausa: null };
  }

  let resultadoPausa: ResultadoEdicion["pausa"] = null;
  if (pausarAlFinal) {
    const receta = pausa(provider, nivel, ids);
    if (!receta) {
      resultadoPausa = { ok: false, error: "No se pudo determinar cómo pausar esto." };
    } else {
      const r = await executeWindsorAction(provider, accountId, receta.action, receta.params);
      resultadoPausa = { ok: r.ok, error: r.ok ? null : (r.error ?? null) };
      realizados.push({
        platform: provider,
        action: receta.action,
        label: "Pausar tras el cambio, para revisarlo",
        params: receta.params,
        ok: r.ok,
        error: r.ok ? null : (r.error ?? null),
        raw: r.raw,
      });
    }
  }
  return { ok: true, pasos: realizados, pausa: resultadoPausa };
}
