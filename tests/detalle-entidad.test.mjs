import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const {
  detalleAnuncioGoogle,
  detalleAnuncioMeta,
  detalleCampanaGoogle,
  detalleCampanaMeta,
  detalleConjuntoGoogle,
  detalleConjuntoMeta,
  jsonSeguro,
  parseSegmentacionMeta,
  parseTextosRsa,
  reusaPublicacion,
  unicosPorId,
} = await import("../lib/detalle-entidad.ts");

// Filas reales de Windsor (Colbún, 2026-09-29), recortadas.
const RSA = {
  account_id: "423-204-0466",
  campaign_id: "24291743422",
  ad_group_id: "201397147838",
  ad_id: "825843439416",
  ad_type: "RESPONSIVE_SEARCH_AD",
  ad_group_ad_status: "ENABLED",
  ad_responsive_search_ad_headlines:
    '[{"text": "Colb\\u00fan Energ\\u00eda Oficial", "assetPerformanceLabel": "PENDING", "policySummaryInfo": {"reviewStatus": "REVIEWED", "approvalStatus": "APPROVED"}}, {"text": "Conoce Nuestros Planes", "pinnedField": "HEADLINE_1", "assetPerformanceLabel": "GOOD", "policySummaryInfo": {"reviewStatus": "REVIEW_IN_PROGRESS"}}]',
  ad_responsive_search_ad_descriptions:
    '[{"text": "Visita nuestro sitio.", "assetPerformanceLabel": "PENDING", "policySummaryInfo": {"reviewStatus": "REVIEWED", "approvalStatus": "APPROVED"}}]',
  ad_responsive_search_ad_path1: null,
  ad_responsive_search_ad_path2: null,
  ad_final_urls: '["https://colbun.cl"]',
  ad_display_url: null,
  ad_final_url_suffix: null,
};
const VIDEO = { ...RSA, ad_id: "820543908923", ad_type: "VIDEO_RESPONSIVE_AD", ad_responsive_search_ad_headlines: null, ad_responsive_search_ad_descriptions: null };

test("Google: titulares y descripciones llegan como JSON y se decodifican con acentos", () => {
  const a = detalleAnuncioGoogle(RSA);
  assert.equal(a.contenido.titulares.length, 2);
  assert.equal(a.contenido.titulares[0].texto, "Colbún Energía Oficial");
  assert.equal(a.contenido.descripciones[0].texto, "Visita nuestro sitio.");
  assert.deepEqual(a.contenido.urlsFinales, ["https://colbun.cl"]);
  assert.equal(a.contenido.urlDestino, "https://colbun.cl");
});

test("Google: se conserva la posición fijada, el rendimiento y el estado de revisión", () => {
  const [libre, fijado] = detalleAnuncioGoogle(RSA).contenido.titulares;
  assert.equal(libre.fijado, null);
  assert.equal(libre.revision, "APPROVED");
  assert.equal(fijado.fijado, "HEADLINE_1");
  assert.equal(fijado.rendimiento, "GOOD");
  // Sin `approvalStatus` cae al estado de revisión.
  assert.equal(fijado.revision, "REVIEW_IN_PROGRESS");
});

test("Google: el anuncio de búsqueda responsivo es editable por la vía nativa; el de video no", () => {
  const rsa = detalleAnuncioGoogle(RSA).edicionDeContenido;
  assert.equal(rsa.editable, true);
  assert.equal(rsa.via, "nativa");
  assert.equal(rsa.motivo, null);
  const video = detalleAnuncioGoogle(VIDEO).edicionDeContenido;
  assert.equal(video.editable, false);
  assert.match(video.motivo, /anuncio de video.*no está añadida al sistema/);
});

test("Google: un anuncio de video no tiene titulares", () => {
  assert.deepEqual(detalleAnuncioGoogle(VIDEO).contenido.titulares, []);
});

test("un JSON roto se trata como ausente y no tumba la lectura", () => {
  assert.equal(jsonSeguro("{no es json"), null);
  assert.deepEqual(parseTextosRsa("{no es json"), []);
  assert.equal(detalleAnuncioGoogle({ ...RSA, ad_final_urls: "roto" }).contenido.urlDestino, null);
});

test("una fila sin id no produce entidad", () => {
  assert.equal(detalleAnuncioGoogle({ ...RSA, ad_id: null }), null);
  assert.equal(detalleConjuntoGoogle({ account_id: "1" }), null);
  assert.equal(detalleCampanaMeta({ account_id: "1" }), null);
});

test("Google: un presupuesto en 0 no se presenta como monto", () => {
  const c = detalleCampanaGoogle({
    account_id: "423-204-0466",
    campaign_id: "24123717551",
    campaign_name: "[AE] Colbún | Ag",
    campaign_status: "ENABLED",
    advertising_channel_type: "VIDEO",
    bidding_strategy_type: "TARGET_CPV",
    budget_amount: 0,
    campaign_network_settings_target_google_search: false,
    campaign_network_settings_target_search_network: false,
    campaign_network_settings_target_content_network: true,
  });
  assert.equal(c.presupuesto.diario, null);
  assert.equal(c.puja.estrategia, "TARGET_CPV");
  assert.deepEqual(c.redes, { busqueda: false, asociadas: false, display: true });
});

test("Google: el CPA objetivo sale de micros a la moneda de la cuenta", () => {
  const c = detalleCampanaGoogle({
    account_id: "1", campaign_id: "2", budget_amount: 50,
    campaign_target_cpa_target_cpa_micros: 12_500_000,
  });
  assert.equal(c.puja.objetivoCpa, 12.5);
  assert.equal(c.presupuesto.diario, 50);
});

test("Google: el grupo de anuncios lleva su tipo y no inventa presupuesto", () => {
  const g = detalleConjuntoGoogle({
    account_id: "1", campaign_id: "2", ad_group_id: "3", ad_group_name: "Video 1",
    ad_group_status: "ENABLED", ad_group_type: "VIDEO_RESPONSIVE", ad_group_effective_cpc_bid_micros: null,
  });
  assert.equal(g.tipo, "VIDEO_RESPONSIVE");
  assert.deepEqual(g.presupuesto, { diario: null, total: null });
  assert.equal(g.puja.monto, null);
});

const META_CONJUNTO = {
  account_id: "2006250736667023",
  account_currency: "CLP",
  campaign_id: "52517686558837",
  adset_id: "52517686674037",
  adset_name: "AS | RTG Engagement IG 365d | CL",
  adset_status: "ACTIVE",
  adset_effective_status: "ACTIVE",
  adset_daily_budget: null,
  adset_lifetime_budget: null,
  adset_bid_strategy: null,
  adset_bid_amount: null,
  adset_billing_event: "IMPRESSIONS",
  adsset_optimization_goal: "PROFILE_AND_PAGE_ENGAGEMENT",
  adset_destination_type: "INSTAGRAM_PROFILE",
  adset_start_time: "2026-08-10T19:16:05-0400",
  adset_end_time: "2026-09-30T23:59:00-0300",
  adset_promoted_object: '{"page_id": "286255651767382", "smart_pse_enabled": false}',
  adset_targeting:
    '{"age_max": 65, "age_min": 18, "custom_audiences": [{"id": "52517686618237", "name": "RTG | Engagement IG Colbun | 365d"}], "geo_locations": {"countries": ["CL"], "location_types": ["home", "recent"]}, "targeting_automation": {"advantage_audience": 0}, "publisher_platforms": ["instagram"], "instagram_positions": ["stream", "story", "reels"], "device_platforms": ["mobile", "desktop"]}',
};

test("Meta: el conjunto usa el campo con doble s de Windsor para la optimización", () => {
  const c = detalleConjuntoMeta(META_CONJUNTO);
  assert.equal(c.optimizacion, "PROFILE_AND_PAGE_ENGAGEMENT");
  assert.equal(c.cobroPor, "IMPRESSIONS");
  assert.equal(c.destino, "INSTAGRAM_PROFILE");
  assert.deepEqual(c.objetoPromovido, { page_id: "286255651767382", smart_pse_enabled: false });
});

test("Meta: sin presupuesto en el conjunto, se marca que vive en la campaña (no que falta)", () => {
  const c = detalleConjuntoMeta(META_CONJUNTO);
  assert.equal(c.presupuesto.diario, null);
  assert.equal(c.presupuesto.enLaCampana, true);
});

test("Meta: el presupuesto se lee en la unidad menor de cada moneda (CLP no tiene centavos)", () => {
  const clp = detalleConjuntoMeta({ ...META_CONJUNTO, adset_daily_budget: 5000 });
  assert.equal(clp.presupuesto.diario, 5000);
  assert.equal(clp.presupuesto.enLaCampana, false);
  const usd = detalleConjuntoMeta({ ...META_CONJUNTO, account_currency: "USD", adset_daily_budget: 5000 });
  assert.equal(usd.presupuesto.diario, 50);
});

test("Meta: la segmentación se interpreta y la cruda se conserva intacta para editar", () => {
  const c = detalleConjuntoMeta(META_CONJUNTO);
  assert.deepEqual(c.segmentacion.paises, ["CL"]);
  assert.equal(c.segmentacion.edadMin, 18);
  assert.equal(c.segmentacion.edadMax, 65);
  assert.deepEqual(c.segmentacion.audiencias, [{ id: "52517686618237", name: "RTG | Engagement IG Colbun | 365d" }]);
  assert.deepEqual(c.segmentacion.plataformas, ["instagram"]);
  assert.deepEqual(c.segmentacion.posiciones, { instagram: ["stream", "story", "reels"] });
  assert.equal(c.segmentacion.advantageAudience, false);
  // Lo que el resumen no modela no se pierde: está en la cruda.
  assert.equal(c.segmentacionCruda.targeting_automation.advantage_audience, 0);
  assert.deepEqual(c.segmentacionCruda.custom_audiences[0].id, "52517686618237");
});

test("Meta: Advantage+ con rango de edad sugerido y una región", () => {
  const s = parseSegmentacionMeta({
    age_max: 65, age_min: 18, age_range: [20, 55],
    geo_locations: { regions: [{ key: "672", name: "Maule Region", country: "CL" }], location_types: ["home"] },
    targeting_automation: { advantage_audience: 1 },
  });
  assert.deepEqual(s.edadSugerida, [20, 55]);
  assert.equal(s.advantageAudience, true);
  assert.deepEqual(s.regiones, [{ key: "672", name: "Maule Region", country: "CL" }]);
  assert.deepEqual(s.paises, []);
});

test("Meta: sin targeting no hay segmentación", () => {
  assert.equal(parseSegmentacionMeta(null), null);
  assert.equal(detalleConjuntoMeta({ ...META_CONJUNTO, adset_targeting: null }).segmentacion, null);
});

test("Meta: la campaña con presupuesto total marca que el presupuesto está en la campaña", () => {
  const c = detalleCampanaMeta({
    account_id: "2006250736667023", account_currency: "CLP", campaign_id: "52517660741437",
    campaign: "[AE] Colbún | IG", campaign_effective_status: "ACTIVE",
    campaign_objective: "OUTCOME_AWARENESS", campaign_bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    campaign_daily_budget: null, campaign_lifetime_budget: 1100000,
    campaign_special_ad_categories: "[]",
    campaign_start_time: "2026-08-10T16:40:18-0400", campaign_stop_time: "2026-09-30T23:59:00-0300",
  });
  assert.equal(c.presupuesto.total, 1_100_000);
  assert.equal(c.presupuesto.diario, null);
  assert.equal(c.presupuesto.enLaCampana, true);
  assert.equal(c.objetivo, "OUTCOME_AWARENESS");
  assert.deepEqual(c.categoriasEspeciales, []);
  assert.equal(c.fin, "2026-09-30T23:59:00-0300");
});

const META_ANUNCIO = {
  account_id: "2006250736667023", campaign_id: "1", adset_id: "2", ad_id: "52528100744437",
  ad_name: "Concurso", effective_status: "ACTIVE", creative_id: "1346179064044883",
  image_hash: "3fab31212eb06f6af184f2ebb6d96d4d", image_url: "https://cdn.example/img.jpg",
  url_tags: null, link: "https://forms.gle/ZwbTwSr74XpqWKvN9", link_url: null,
  body: "Participa en el Concurso", title: "Regístrate", call_to_action_type: "SIGN_UP",
  thumbnail_url: "https://cdn.example/t.jpg",
  instagram_permalink_url: "https://www.instagram.com/p/DdZX5ZxM5A1/",
  ad_preview_shareable_link: "https://fb.me/1T8GNceDLSfZWgm",
};

test("Meta: un anuncio propio expone todo su contenido y es editable", () => {
  const a = detalleAnuncioMeta(META_ANUNCIO);
  assert.equal(a.contenido.textoPrincipal, "Participa en el Concurso");
  assert.equal(a.contenido.titulo, "Regístrate");
  assert.equal(a.contenido.cta, "SIGN_UP");
  assert.equal(a.contenido.urlDestino, "https://forms.gle/ZwbTwSr74XpqWKvN9");
  assert.equal(a.contenido.imageHash, "3fab31212eb06f6af184f2ebb6d96d4d");
  assert.equal(a.contenido.vistaPreviaUrl, "https://fb.me/1T8GNceDLSfZWgm");
  assert.equal(a.edicionDeContenido.editable, true);
  assert.equal(a.edicionDeContenido.via, "windsor");
  assert.equal(a.edicionDeContenido.motivo, null);
});

test("Meta: un anuncio que reusa una publicación de Instagram no es editable, con motivo", () => {
  const a = detalleAnuncioMeta({ ...META_ANUNCIO, link: "https://www.instagram.com/p/Db4KxuEsdIh/" });
  assert.equal(a.edicionDeContenido.editable, false);
  assert.match(a.edicionDeContenido.motivo, /publicación existente/);
});

test("reusaPublicacion reconoce publicaciones y no sitios propios", () => {
  assert.equal(reusaPublicacion("https://www.instagram.com/p/Db4KxuEsdIh/"), true);
  assert.equal(reusaPublicacion("https://www.instagram.com/reel/Abc/"), true);
  assert.equal(reusaPublicacion("https://www.facebook.com/colbun/posts/123"), true);
  assert.equal(reusaPublicacion("https://www.colbun.cl/"), false);
  assert.equal(reusaPublicacion("https://forms.gle/x"), false);
  assert.equal(reusaPublicacion(null), false);
});

test("Meta: 'link' manda sobre 'link_url', que Windsor entrega vacío", () => {
  assert.equal(detalleAnuncioMeta({ ...META_ANUNCIO, link: null, link_url: "https://x.cl" }).contenido.urlDestino, "https://x.cl");
});

test("unicosPorId se queda con una entidad por id", () => {
  const filas = [{ id: "1", n: "a" }, { id: "1", n: "b" }, { id: "2", n: "c" }];
  assert.deepEqual(unicosPorId(filas), [{ id: "1", n: "a" }, { id: "2", n: "c" }]);
});

// --- Google vía API nativa (GAQL): forma de `searchStream`, camelCase, ids como texto ---
const { detalleAnuncioGaql, detalleCampanaGaql, detalleConjuntoGaql } = await import("../lib/detalle-entidad.ts");

const FILA_ANUNCIO_GAQL = {
  adGroupAd: {
    status: "PAUSED",
    policySummary: { approvalStatus: "APPROVED_LIMITED" },
    ad: {
      id: "825843439416",
      type: "RESPONSIVE_SEARCH_AD",
      finalUrls: ["https://colbun.cl/hogar"],
      finalUrlSuffix: "utm_source=g",
      responsiveSearchAd: {
        headlines: [
          { text: "Colbún Energía", pinnedField: "HEADLINE_1", assetPerformanceLabel: "GOOD" },
          { text: "Conoce Colbún", pinnedField: "UNSPECIFIED" },
        ],
        descriptions: [{ text: "Visita nuestro sitio." }],
        path1: "hogar",
        path2: "planes",
      },
    },
  },
  adGroup: { id: "201397147838" },
  campaign: { id: "24291743422" },
};

test("GAQL: un anuncio pausado sin actividad se lee completo, con sus padres", () => {
  const a = detalleAnuncioGaql(FILA_ANUNCIO_GAQL, "423-204-0466");
  assert.equal(a.id, "825843439416");
  assert.equal(a.estado, "PAUSED");
  assert.equal(a.conjuntoId, "201397147838");
  assert.equal(a.campaignId, "24291743422");
  assert.equal(a.contenido.titulares[0].texto, "Colbún Energía");
  assert.equal(a.contenido.path1, "hogar");
  assert.equal(a.contenido.path2, "planes");
  assert.equal(a.contenido.sufijoUrl, "utm_source=g");
  assert.deepEqual(a.contenido.urlsFinales, ["https://colbun.cl/hogar"]);
});

test("GAQL: la posición fijada UNSPECIFIED de Google significa 'no fijado'", () => {
  const [fijado, libre] = detalleAnuncioGaql(FILA_ANUNCIO_GAQL, "1").contenido.titulares;
  assert.equal(fijado.fijado, "HEADLINE_1");
  assert.equal(libre.fijado, null);
});

test("GAQL: la aprobación es del anuncio y se copia a cada texto", () => {
  const a = detalleAnuncioGaql(FILA_ANUNCIO_GAQL, "1");
  assert.ok(a.contenido.titulares.every((t) => t.revision === "APPROVED_LIMITED"));
  assert.equal(a.contenido.descripciones[0].revision, "APPROVED_LIMITED");
});

test("GAQL: sin id no hay entidad, y un anuncio que no es RSA no tiene titulares", () => {
  assert.equal(detalleAnuncioGaql({ adGroupAd: { ad: {} } }, "1"), null);
  assert.equal(detalleConjuntoGaql({ adGroup: {} }, "1"), null);
  assert.equal(detalleCampanaGaql({ campaign: {} }, "1"), null);
  const video = detalleAnuncioGaql({ adGroupAd: { ad: { id: "9", type: "VIDEO_RESPONSIVE_AD" } } }, "1");
  assert.deepEqual(video.contenido.titulares, []);
  assert.match(video.edicionDeContenido.motivo, /anuncio de video.*no está añadida al sistema/);
});

test("GAQL: la campaña convierte micros y no presenta un presupuesto ausente como cero", () => {
  const c = detalleCampanaGaql(
    {
      campaign: {
        id: "24285672458", name: "Plan Hogar", status: "ENABLED", advertisingChannelType: "SEARCH",
        biddingStrategyType: "TARGET_CPA", targetCpa: { targetCpaMicros: "8500000" },
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false },
        trackingUrlTemplate: "{lpurl}?a=1",
      },
      campaignBudget: { amountMicros: "20000000" },
    },
    "423-204-0466",
  );
  assert.equal(c.presupuesto.diario, 20);
  assert.equal(c.puja.objetivoCpa, 8.5);
  assert.deepEqual(c.redes, { busqueda: true, asociadas: false, display: false });
  assert.equal(c.urlSeguimiento, "{lpurl}?a=1");
  const sinPresupuesto = detalleCampanaGaql({ campaign: { id: "1" } }, "1");
  assert.equal(sinPresupuesto.presupuesto.diario, null);
});

test("GAQL: el grupo de anuncios lee CPC y CPA objetivo en la moneda de la cuenta", () => {
  const g = detalleConjuntoGaql(
    { adGroup: { id: "5", name: "Principal", status: "PAUSED", type: "SEARCH_STANDARD", cpcBidMicros: "1500000", targetCpaMicros: "9000000" }, campaign: { id: "7" } },
    "1",
  );
  assert.equal(g.puja.monto, 1.5);
  assert.equal(g.puja.objetivoCpa, 9);
  assert.equal(g.campaignId, "7");
  assert.equal(g.estado, "PAUSED");
});

test("Meta en USD: el presupuesto TOTAL de campaña viene en la unidad de la moneda y el DIARIO en centavos (datos reales de Windsor)", async () => {
  const { detalleCampanaMeta } = await import("../lib/detalle-entidad.ts");
  const total = detalleCampanaMeta({ campaign_id: "1", account_id: "9", account_currency: "USD", campaign: "[LDS] Ébano | Form Web", campaign_lifetime_budget: 2524.64, campaign_daily_budget: null });
  assert.equal(total.presupuesto.total, 2524.64);
  const diario = detalleCampanaMeta({ campaign_id: "2", account_id: "9", account_currency: "USD", campaign: "RMK Y LAL", campaign_daily_budget: 2000, campaign_lifetime_budget: 0 });
  assert.equal(diario.presupuesto.diario, 20);
});
