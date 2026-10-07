import type { PasoEjecutado } from "@/lib/constructor-ejecutar";
import type { CambiosRsa, CredencialesGoogle } from "@/lib/google-ads-nativo";
import {
  actualizarAnuncioRsa,
  actualizarCampanaGoogle,
  GoogleAdsNativoError,
  type CambiosCampanaGoogle,
} from "@/lib/google-ads-nativo";
import type { PasoEdicion } from "@/lib/edicion-plan";
import type { CredencialesLinkedin } from "@/lib/linkedin-conexion";
import { diferenciasConLoEsperado, planDeActualizacion, rutaDeEntidad, type Cambios } from "@/lib/linkedin-escritura-pura";
import { enviarPlanALinkedin, leerDeLinkedin } from "@/lib/linkedin-nativo";
import { ErrorDeLinkedin } from "@/lib/linkedin-nativo-pura";
import type { NivelEntidad, Platform } from "@/lib/plataformas";
import { executeWindsorAction } from "@/lib/windsor";

/** Acción de Windsor que ACTIVA cada nivel (Google y Meta). LinkedIn no tiene una receta verificada. */
function activacion(
  provider: Platform,
  nivel: NivelEntidad,
  ids: { campaignId: string | null; conjuntoId: string | null; id: string },
): { action: string; params: Record<string, unknown> } | null {
  if (provider === "google") {
    if (nivel === "campana") return { action: "enable_campaign", params: { campaign_id: ids.id } };
    if (nivel === "conjunto") return { action: "enable_ad_group", params: { ad_group_id: ids.id } };
    return ids.conjuntoId ? { action: "enable_ad", params: { ad_group_id: ids.conjuntoId, ad_id: ids.id } } : null;
  }
  if (provider === "meta") {
    if (nivel === "campana") return { action: "enable_campaign", params: { campaign_id: ids.id } };
    if (nivel === "conjunto") return { action: "enable_adset", params: { adset_id: ids.id } };
    return { action: "enable_ad", params: { ad_id: ids.id } };
  }
  return null;
}

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

/**
 * Aplica un cambio en LinkedIn por su API directa y lo LEE DE VUELTA de LinkedIn (no de Windsor, que va con retraso): si lo
 * leído no coincide con lo pedido, el paso falla en vez de darse por bueno. Nunca reintenta.
 */
async function aplicarEnLinkedin(
  credenciales: CredencialesLinkedin,
  accountId: string,
  nivel: "grupo" | "campana",
  id: string,
  cambios: Cambios,
): Promise<{ ok: boolean; error: string | null; raw: unknown }> {
  try {
    const plan = planDeActualizacion({ nivel, cuentaId: accountId, id, cambios });
    await enviarPlanALinkedin(plan, credenciales.token);
    const actual = await leerDeLinkedin(rutaDeEntidad(nivel, accountId, id), credenciales.token);
    const diferencias = diferenciasConLoEsperado(plan.esperado, actual);
    return diferencias.length === 0
      ? { ok: true, error: null, raw: { verificado: true } }
      : { ok: false, error: `LinkedIn aceptó el cambio pero al leerlo no coincide: ${diferencias.map((d) => d.campo).join(", ")}.`, raw: { diferencias } };
  } catch (e) {
    return { ok: false, error: e instanceof ErrorDeLinkedin ? e.message : "No se pudo aplicar el cambio en LinkedIn.", raw: String(e) };
  }
}

/** Nivel de la interfaz → nivel de la API de LinkedIn (campaña = grupo; conjunto = campaña). El anuncio no se edita por esta vía. */
const nivelNativoLinkedin = (nivel: NivelEntidad): "grupo" | "campana" | null =>
  nivel === "campana" ? "grupo" : nivel === "conjunto" ? "campana" : null;

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
  activarAlFinal = false,
  credencialesGoogle,
  credencialesLinkedin = null,
}: {
  provider: Platform;
  accountId: string;
  nivel: NivelEntidad;
  ids: { campaignId: string | null; conjuntoId: string | null; id: string };
  pasos: PasoEdicion[];
  pausarAlFinal: boolean;
  /** Volver a activar la entidad tras aplicar los pasos. */
  activarAlFinal?: boolean;
  credencialesGoogle: CredencialesGoogle | null;
  /** Con esto, LinkedIn se edita por su API directa; sin esto, por Windsor. */
  credencialesLinkedin?: CredencialesLinkedin | null;
}): Promise<ResultadoEdicion> {
  const realizados: PasoEjecutado[] = [];

  for (const paso of pasos) {
    let ok = false;
    let error: string | null = null;
    let raw: unknown = null;

    if (paso.via === "nativa" && paso.platform === "linkedin") {
      const nivelNativo = paso.params.nivel === "grupo" || paso.params.nivel === "campana" ? paso.params.nivel : null;
      if (!credencialesLinkedin) {
        error = "Falta conectar tu cuenta de LinkedIn en Integraciones.";
      } else if (!nivelNativo) {
        error = "Este cambio de LinkedIn no es válido.";
      } else {
        const r = await aplicarEnLinkedin(credencialesLinkedin, accountId, nivelNativo, String(paso.params.id), (paso.params.cambios ?? {}) as Cambios);
        ok = r.ok;
        error = r.error;
        raw = r.raw;
      }
    } else if (paso.via === "nativa") {
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
    const nativoPausa = provider === "linkedin" && credencialesLinkedin ? nivelNativoLinkedin(nivel) : null;
    if (nativoPausa && credencialesLinkedin) {
      const r = await aplicarEnLinkedin(credencialesLinkedin, accountId, nativoPausa, ids.id, { estado: "PAUSED" });
      resultadoPausa = { ok: r.ok, error: r.error };
      realizados.push({
        platform: provider, action: "linkedin:actualizar", label: "Pausar tras el cambio, para revisarlo",
        params: { nivel: nativoPausa, id: ids.id, cambios: { estado: "PAUSED" } }, ok: r.ok, error: r.error, raw: r.raw,
      });
    } else if (!receta) {
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
  if (activarAlFinal && provider === "linkedin" && credencialesLinkedin && nivelNativoLinkedin(nivel)) {
    const nativoActivar = nivelNativoLinkedin(nivel)!;
    const r = await aplicarEnLinkedin(credencialesLinkedin, accountId, nativoActivar, ids.id, { estado: "ACTIVE" });
    realizados.push({
      platform: provider, action: "linkedin:actualizar", label: "Activar",
      params: { nivel: nativoActivar, id: ids.id, cambios: { estado: "ACTIVE" } }, ok: r.ok, error: r.error, raw: r.raw,
    });
    if (!r.ok) return { ok: false, pasos: realizados, pausa: null };
  } else if (activarAlFinal) {
    const receta = activacion(provider, nivel, ids);
    if (!receta) return { ok: false, pasos: realizados, pausa: null };
    const r = await executeWindsorAction(provider, accountId, receta.action, receta.params);
    realizados.push({
      platform: provider,
      action: receta.action,
      label: "Activar",
      params: receta.params,
      ok: r.ok,
      error: r.ok ? null : (r.error ?? null),
      raw: r.raw,
    });
    if (!r.ok) return { ok: false, pasos: realizados, pausa: null };
  }

  return { ok: true, pasos: realizados, pausa: resultadoPausa };
}
