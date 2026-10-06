/**
 * Enlaces directos para revisar fuera de WiWO.ADS lo que una alerta o una
 * sugerencia señala: Google Analytics, Tag Manager o la campaña en la
 * plataforma. Solo construye URLs públicas de esas herramientas (no lee nada).
 *
 * Los de Analytics y las campañas apuntan a la pantalla exacta; Tag Manager no
 * permite ir a un contenedor sin el id de su cuenta, así que abre la página
 * principal y el contenedor se indica en la etiqueta.
 */
export type Enlace = { etiqueta: string; url: string };

const soloDigitos = (v: string) => v.replace(/\D/g, "");

export function enlaceDeAnalytics(propiedad: string | null | undefined): Enlace | null {
  // Con varias propiedades (separadas por coma) se abre la primera.
  const id = propiedad ? soloDigitos(propiedad.split(/[\s,;]+/)[0] ?? "") : "";
  if (!id) return null;
  return {
    etiqueta: "Abrir eventos en Google Analytics",
    url: `https://analytics.google.com/analytics/web/#/p${id}/admin/events/overview`,
  };
}

export function enlaceDeTagManager(contenedor: string | null | undefined): Enlace {
  return {
    etiqueta: contenedor ? `Abrir Tag Manager (${contenedor})` : "Abrir Google Tag Manager",
    url: "https://tagmanager.google.com/",
  };
}

export function enlaceDeCampana(
  provider: string | null | undefined,
  accountId: string | null | undefined,
  campaignId: string | null | undefined,
): Enlace | null {
  if (!provider || !accountId || !campaignId) return null;
  const cuenta = soloDigitos(accountId);
  const campana = soloDigitos(campaignId);
  if (!cuenta || !campana) return null;
  if (provider === "meta") {
    return {
      etiqueta: "Ver en Meta Ads Manager",
      url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${cuenta}&selected_campaign_ids=${campana}`,
    };
  }
  if (provider === "google") {
    return { etiqueta: "Ver en Google Ads", url: `https://ads.google.com/aw/campaigns?campaignId=${campana}` };
  }
  return null;
}

type DatosDeCliente = { ga4PropertyId?: string | null; gtmContainerId?: string | null } | null | undefined;

const sinNulos = (lista: Array<Enlace | null>): Enlace[] => lista.filter((e): e is Enlace => e !== null);

/** Alertas: `sin-gtm-…` → Tag Manager; `sin-actividad|desperdicio|degradacion-<proveedor>:<cuenta>:<campaña>` → la campaña. */
export function enlacesDeAlerta(id: string, cliente: DatosDeCliente): Enlace[] {
  if (id.startsWith("sin-gtm-")) return [enlaceDeTagManager(cliente?.gtmContainerId)];
  const m = /^[a-z-]+?-(meta|google):([^:]+):(.+)$/.exec(id);
  if (m) return sinNulos([enlaceDeCampana(m[1], m[2], m[3])]);
  return [];
}

/** Sugerencias: las de medición → Analytics y Tag Manager; las que nombran una campaña → esa campaña. */
export function enlacesDeSugerencia(
  regla: string,
  cliente: DatosDeCliente,
  entidad: { provider: string | null; accountId: string | null; entityId: string | null },
): Enlace[] {
  if (regla.startsWith("medicion_")) {
    return sinNulos([enlaceDeAnalytics(cliente?.ga4PropertyId), enlaceDeTagManager(cliente?.gtmContainerId)]);
  }
  return sinNulos([enlaceDeCampana(entidad.provider, entidad.accountId, entidad.entityId)]);
}
