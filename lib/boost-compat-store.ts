import { evaluarCompatibilidadBoost, type CompatibilidadBoost } from "@/lib/boost-compat";
import type { CampaignDraft } from "@/lib/constructor";
import { fetchDetalleDeCuenta } from "@/lib/detalle-entidad-store";
import { accountIndex, normalizeAccountId } from "@/lib/portafolios-store";

/**
 * Lee de la plataforma la campaña (y el conjunto) donde se quiere impulsar una
 * publicación y decide si Meta lo admite. Devuelve `null` cuando no aplica
 * (no se está impulsando, o no es dentro de algo existente de Meta): quien
 * llama trata `null` como "sin compatibilidad confirmada", que en `buildPlan`
 * bloquea el impulso dentro de algo existente.
 *
 * La cuenta la dice el navegador, así que se comprueba que pertenezca al
 * cliente del borrador antes de leerla.
 */
export async function cargarCompatibilidadBoost(
  draft: CampaignDraft,
): Promise<CompatibilidadBoost | null> {
  const destino = draft.existingCampaign;
  if (!draft.boostPostId || !destino || destino.platform !== "meta") return null;

  const duenio = (await accountIndex()).get(normalizeAccountId(destino.accountId));
  if (!duenio || duenio.id !== draft.portfolioId) return null;

  try {
    const detalle = await fetchDetalleDeCuenta("meta", destino.accountId);
    const campana = detalle.campanas.find((c) => c.id === destino.campaignId) ?? null;
    const conjunto = draft.existingAdset
      ? (detalle.conjuntos.find((c) => c.id === draft.existingAdset!.adsetId) ?? null)
      : null;
    return evaluarCompatibilidadBoost(draft.boostPostId, campana, conjunto);
  } catch (error) {
    // Sin poder leer la plataforma no se confirma nada: se bloquea, no se adivina.
    console.error("WiWO.ADS compatibilidad de impulso", error);
    return null;
  }
}
