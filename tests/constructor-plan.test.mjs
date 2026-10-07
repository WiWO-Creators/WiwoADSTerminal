import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

// Pruebas de caracterización de `lib/constructor.ts`: fijan lo que el
// Constructor hace HOY para poder refactorizarlo (adaptadores por plataforma,
// modo edición) sin cambiarlo por accidente. Ninguna llama a una plataforma.
const { buildPlan, normalizeDraft, validateDraft } = await import("../lib/constructor.ts");

const CUENTA_GOOGLE = {
  externalId: "111-222-3333",
  name: "Cuenta Google",
  provider: "google",
  currency: "CLP",
  pageId: null,
  pixels: [],
  countries: ["CL"],
};
const CUENTA_META = {
  externalId: "999",
  name: "Cuenta Meta",
  provider: "meta",
  currency: "CLP",
  pageId: "555",
  pixels: [{ id: "p1", pixelId: "777", label: null }],
  countries: ["CL"],
};
const SNAPSHOT = { campaigns: [], rangeStart: "2026-09-01", rangeEnd: "2026-09-28" };

function borrador(over = {}) {
  return normalizeDraft({
    portfolioId: "cliente-1",
    platforms: ["google", "meta"],
    name: "Prueba",
    objective: "leads",
    dailyBudget: 20,
    landingUrl: "https://ejemplo.com",
    headlines: ["Titular uno", "Titular dos", "Titular tres"],
    descriptions: ["Descripción número uno", "Descripción número dos"],
    keywords: ["zapatos"],
    message: "Texto principal",
    mediaUrl: "https://ejemplo.com/i.jpg",
    mediaType: "image",
    targetCountries: ["CL"],
    ...over,
  });
}

function plan(draft, cuentas = [CUENTA_GOOGLE, CUENTA_META]) {
  return buildPlan(draft, null, cuentas, SNAPSHOT);
}

const ejecutables = (r) => r.steps.filter((s) => !s.informativo);
const bloqueantes = (r) => r.issues.filter((i) => i.blocking);

test("un borrador completo en Google y Meta no tiene bloqueantes", () => {
  assert.deepEqual(bloqueantes(plan(borrador())), []);
});

test("Google arma campaña → grupo → anuncio → keywords → geo, en ese orden", () => {
  const r = plan(borrador({ platforms: ["google"] }));
  assert.deepEqual(
    ejecutables(r).map((s) => s.action),
    [
      "create_campaign",
      "create_ad_group",
      "create_responsive_search_ad",
      "push_keywords",
      "set_campaign_geo_targeting",
    ],
  );
  assert.ok(r.steps.every((s) => s.platform === "google"));
});

test("Meta arma campaña → conjunto → anuncio", () => {
  const r = plan(borrador({ platforms: ["meta"] }));
  assert.deepEqual(
    ejecutables(r).map((s) => s.action),
    ["create_campaign", "create_adset", "create_ad"],
  );
});

test("con las dos plataformas, cada una conserva su propia cadena", () => {
  const r = plan(borrador());
  const porPlataforma = (p) => ejecutables(r).filter((s) => s.platform === p).map((s) => s.action);
  assert.equal(porPlataforma("google")[0], "create_campaign");
  assert.equal(porPlataforma("meta")[0], "create_campaign");
  assert.equal(porPlataforma("google").length, 5);
  assert.equal(porPlataforma("meta").length, 3);
});

test("decisión del equipo: nada nace pausado, la campaña nueva queda corriendo (la revisión es antes, en la aprobación)", () => {
  const r = plan(borrador({ activarConjuntoYAnuncio: true }));
  for (const s of ejecutables(r).filter((x) => x.action === "create_campaign")) {
    assert.equal(s.params.status, s.platform === "google" ? "enabled" : "active", `${s.platform} debe nacer activa`);
  }
});

test("Google convierte el presupuesto a micros", () => {
  const r = plan(borrador({ platforms: ["google"], dailyBudget: 20 }));
  const campana = ejecutables(r).find((s) => s.action === "create_campaign");
  assert.equal(campana.params.budget_amount_micros, 20_000_000);
});

test("el presupuesto por plataforma pisa al compartido solo en esa plataforma", () => {
  const r = plan(borrador({ dailyBudget: 20, budgetByPlatform: { google: 50 } }));
  const google = ejecutables(r).find((s) => s.platform === "google" && s.action === "create_campaign");
  assert.equal(google.params.budget_amount_micros, 50_000_000);
});

test("el nombre en la plataforma lleva las siglas propias, no el nombre a secas", () => {
  const r = plan(borrador());
  for (const s of ejecutables(r).filter((x) => x.action === "create_campaign")) {
    assert.notEqual(s.params.name, "Prueba");
    assert.match(String(s.params.name), /Prueba/);
    assert.match(String(s.params.name), /^\[/);
  }
});

test("sin plataformas elegidas hay un bloqueante y ningún paso ejecutable", () => {
  const r = plan(borrador({ platforms: [] }));
  assert.ok(bloqueantes(r).length > 0);
  assert.equal(ejecutables(r).length, 0);
});

test("sin presupuesto el plan queda bloqueado", () => {
  const r = plan(borrador({ dailyBudget: null }));
  assert.ok(bloqueantes(r).some((i) => /presupuesto/i.test(i.message) || /budget/i.test(i.field)));
});

test("una imagen en un plan de Google avisa que solo se usará en Meta (no bloquea)", () => {
  const r = plan(borrador());
  const aviso = r.issues.find((i) => i.field === "mediaUrl");
  assert.ok(aviso);
  assert.equal(aviso.blocking, false);
});

test("adjuntar a una campaña de Google existente no crea otra campaña", () => {
  const draft = borrador({
    platforms: ["google"],
    existingCampaign: {
      platform: "google",
      accountId: "111-222-3333",
      campaignId: "24271920233",
      campaignName: "Campaña previa",
    },
  });
  const acciones = ejecutables(plan(draft)).map((s) => s.action);
  assert.ok(!acciones.includes("create_campaign"));
  assert.ok(acciones.includes("create_ad_group"));
});

test("lo que se adjunta a algo existente también nace activo", () => {
  const draft = borrador({
    platforms: ["google"],
    activarConjuntoYAnuncio: true,
    existingCampaign: {
      platform: "google",
      accountId: "111-222-3333",
      campaignId: "24271920233",
      campaignName: "Campaña previa",
    },
  });
  const grupo = ejecutables(plan(draft)).find((s) => s.action === "create_ad_group");
  assert.equal(grupo.params.status, "enabled");
});

test("un conjunto existente sin campaña existente no llega a ningún paso", () => {
  const draft = borrador({
    platforms: ["google"],
    existingAdset: { adsetId: "1", adsetName: "x" },
  });
  // Da igual si normalizeDraft lo descarta o la validación lo marca: no debe
  // haber un plan que escriba sobre un id de conjunto suelto.
  const r = plan(draft);
  assert.ok(!ejecutables(r).some((s) => s.params.adset_id === "1"));
});

test("normalizeDraft descarta plataformas inactivas o inventadas", () => {
  const d = normalizeDraft({ platforms: ["google", "tiktok", "myspace"] });
  assert.deepEqual(d.platforms, ["google"]);
});

test("normalizeDraft acota edad y objetivo a valores válidos", () => {
  const d = normalizeDraft({ ageMin: 3, ageMax: 200, objective: "cualquiera" });
  assert.equal(d.ageMin, 13);
  assert.equal(d.ageMax, 65);
  assert.equal(d.objective, "trafico");
});

test("normalizeDraft recorta los segmentos de la URL visible a 15 caracteres", () => {
  const d = normalizeDraft({ pathDisplay1: "x".repeat(40) });
  assert.equal(d.pathDisplay1.length, 15);
});

test("validateDraft devuelve una lista, incluso para un borrador vacío", () => {
  const issues = validateDraft(normalizeDraft({}), []);
  assert.ok(Array.isArray(issues));
  assert.ok(issues.some((i) => i.blocking));
});

// ---------------------------------------------------------------------------
// Impulsar una publicación ya publicada (`boost_post`)
// ---------------------------------------------------------------------------
const POST_ID = "555_1538380521652067";
const conBoost = (over = {}) =>
  borrador({ platforms: ["meta"], boostPostId: POST_ID, mediaUrl: "https://cdn.example/t.jpg", mediaType: "image", ...over });
const destinoMeta = (extra = {}) => ({
  platform: "meta", accountId: "999", campaignId: "52517686558837", campaignName: "[AE] Colbún | IG | Engagement Perfil", ...extra,
});
const planBoost = (draft, compat) => buildPlan(draft, null, [CUENTA_META], SNAPSHOT, new Set(), compat);
const COMPAT_CAMPANA = { campana: true, conjunto: false, presupuestoEnCampana: true, motivo: null };
const COMPAT_CONJUNTO = { campana: true, conjunto: true, presupuestoEnCampana: true, motivo: null };

test("impulso en campaña nueva: campaña de interacción, conjunto ON_POST y boost_post", () => {
  const r = planBoost(conBoost(), null);
  assert.deepEqual(ejecutables(r).map((s) => s.action), ["create_campaign", "create_adset", "boost_post"]);
  const [camp, conj, boost] = ejecutables(r);
  assert.equal(camp.params.objective, "OUTCOME_ENGAGEMENT");
  assert.equal(conj.params.destination_type, "ON_POST");
  assert.equal(conj.params.optimization_goal, "POST_ENGAGEMENT");
  assert.equal(boost.params.post_id, POST_ID);
  assert.equal(camp.params.status, "active");
});

test("impulso dentro de una campaña compatible: crea solo el conjunto de impulso y el boost", () => {
  const r = planBoost(conBoost({ existingCampaign: destinoMeta() }), COMPAT_CAMPANA);
  assert.deepEqual(bloqueantes(r), []);
  assert.deepEqual(ejecutables(r).map((s) => s.action), ["create_adset", "boost_post"]);
  const [conj, boost] = ejecutables(r);
  assert.equal(conj.params.campaign_id, "52517686558837");
  assert.equal(conj.params.destination_type, "ON_POST");
  assert.equal("daily_budget" in conj.params, false, "el presupuesto ya lo lleva la campaña");
  assert.equal("lifetime_budget" in conj.params, false);
  assert.equal(conj.params.status, "active", "lo adjuntado a algo existente nace activo");
  assert.equal(boost.params.status, "active");
});

test("impulso directo en un conjunto compatible: solo boost_post, con el id real del conjunto", () => {
  const r = planBoost(
    conBoost({ existingCampaign: destinoMeta(), existingAdset: { adsetId: "9001", adsetName: "Impulso" } }),
    COMPAT_CONJUNTO,
  );
  assert.deepEqual(bloqueantes(r), []);
  assert.deepEqual(ejecutables(r).map((s) => s.action), ["boost_post"]);
  assert.equal(ejecutables(r)[0].params.adset_id, "9001");
});

test("impulso en un conjunto incompatible se BLOQUEA con el motivo de Meta, sin crear un anuncio distinto", () => {
  const compat = { campana: true, conjunto: false, presupuestoEnCampana: true, motivo: "El conjunto «X» no admite impulsar: tiene INSTAGRAM_PROFILE" };
  const r = planBoost(
    conBoost({ existingCampaign: destinoMeta(), existingAdset: { adsetId: "9001", adsetName: "X" } }),
    compat,
  );
  assert.match(bloqueantes(r)[0].message, /INSTAGRAM_PROFILE/);
  assert.equal(ejecutables(r).some((s) => s.action === "create_ad"), false, "no debe degradarse a un anuncio nuevo con imagen");
});

test("impulso en una campaña que no es de interacción se BLOQUEA", () => {
  const compat = { campana: false, conjunto: false, presupuestoEnCampana: false, motivo: "es OUTCOME_AWARENESS" };
  const r = planBoost(conBoost({ existingCampaign: destinoMeta() }), compat);
  assert.match(bloqueantes(r)[0].message, /OUTCOME_AWARENESS/);
});

test("sin compatibilidad confirmada por el servidor, impulsar en algo existente se bloquea", () => {
  const r = planBoost(conBoost({ existingCampaign: destinoMeta() }), null);
  assert.match(bloqueantes(r)[0].message, /no se pudo confirmar/);
});

test("un impulso en algo existente no pide texto ni imagen propios: reutiliza la publicación", () => {
  const r = planBoost(conBoost({ existingCampaign: destinoMeta(), message: "", mediaUrl: "", mediaType: "none" }), COMPAT_CAMPANA);
  assert.equal(bloqueantes(r).some((i) => i.field === "message" || i.field === "mediaUrl"), false);
});

test("sin impulso, adjuntar a una campaña existente sigue igual que antes", () => {
  const r = planBoost(borrador({ platforms: ["meta"], existingCampaign: destinoMeta() }), null);
  assert.equal(bloqueantes(r).some((i) => i.field === "boostPostId"), false);
  assert.ok(ejecutables(r).some((s) => s.action === "create_ad"));
});

test("presupuesto TOTAL: sin fecha de término se bloquea; con ella Google lo reparte por día y avisa", () => {
  const sinFecha = plan(borrador({ platforms: ["google"], budgetMode: "total", dailyBudget: 500000 }));
  assert.ok(bloqueantes(sinFecha).some((i) => i.field === "endDate"));

  const fin = new Date();
  fin.setUTCDate(fin.getUTCDate() + 9); // hoy + 9 = 10 días contando hoy
  const endDate = fin.toISOString().slice(0, 10);
  const r = plan(borrador({ platforms: ["google"], budgetMode: "total", dailyBudget: 500000, endDate }));
  assert.deepEqual(bloqueantes(r), []);
  assert.ok(r.issues.some((i) => !i.blocking && /reparte en 10 días/.test(i.message)));
  const campana = ejecutables(r).find((s) => s.action === "create_campaign");
  // 500.000 en 10 días = 50.000 por día, en micros.
  assert.equal(campana.params.budget_amount_micros, 50_000 * 1_000_000);
});

test("diasHastaFin cuenta hoy y el último día", async () => {
  const { diasHastaFin } = await import("../lib/constructor.ts");
  const hoy = new Date("2026-10-05T15:00:00Z");
  assert.equal(diasHastaFin("2026-10-05", hoy), 1);
  assert.equal(diasHastaFin("2026-10-15", hoy), 11);
  assert.equal(diasHastaFin("2026-10-04", hoy), 0);
});

test("el objetivo Interacción existe y usa OUTCOME_ENGAGEMENT con meta POST_ENGAGEMENT", () => {
  const r = plan(borrador({ platforms: ["meta"], objective: "interaccion" }));
  const campana = ejecutables(r).find((s) => s.action === "create_campaign");
  const conjunto = ejecutables(r).find((s) => s.action === "create_adset");
  assert.equal(campana.params.objective, "OUTCOME_ENGAGEMENT");
  assert.equal(conjunto.params.optimization_goal, "POST_ENGAGEMENT");
});

test("Google en Red de Display arma un paso nativo con imagen (sin anuncio de búsqueda ni palabras clave)", () => {
  const r = plan(
    borrador({
      platforms: ["google"],
      googleChannel: "display",
      displaySquareUrl: "https://ejemplo.com/cuadrada.png",
      displayLongHeadline: "Titulo largo de prueba",
      displayBusinessName: "Mi negocio",
      headlines: ["Titular uno"],
      descriptions: ["Descripción uno"],
    }),
  );
  assert.deepEqual(bloqueantes(r), []);
  assert.deepEqual(
    ejecutables(r).map((s) => s.action),
    ["create_campaign", "create_ad_group", "ads:create_display_ad", "set_campaign_geo_targeting"],
  );
  const paso = ejecutables(r).find((s) => s.action === "ads:create_display_ad");
  assert.equal(paso.via, "nativa");
  assert.equal(paso.params.status, "enabled");
  assert.equal(paso.params.square_image_url, "https://ejemplo.com/cuadrada.png");
});

test("Display sin imagen cuadrada, título largo o nombre del negocio queda bloqueado", () => {
  const r = plan(borrador({ platforms: ["google"], googleChannel: "display", headlines: ["Titular"], descriptions: ["Descripción"] }));
  const campos = bloqueantes(r).map((i) => i.field);
  for (const c of ["displayLongHeadline", "displayBusinessName", "displaySquareUrl"]) assert.ok(campos.includes(c), c);
});

test("Google: el presupuesto diario es siempre en unidades enteras (un total repartido en días no da un monto inválido)", () => {
  const fin = new Date();
  fin.setUTCDate(fin.getUTCDate() + 26); // 27 días contando hoy
  const endDate = fin.toISOString().slice(0, 10);
  const r = plan(borrador({ platforms: ["google"], budgetMode: "total", dailyBudget: 800000, endDate }));
  const micros = ejecutables(r).find((s) => s.action === "create_campaign").params.budget_amount_micros;
  assert.equal(micros % 1_000_000, 0);
  assert.equal(micros, 29_630 * 1_000_000); // 800.000 / 27 = 29.629,6 → 29.630
});

test("un total compartido por varias plataformas avisa que se aplica a cada una; repartido por plataforma, no", () => {
  const fin = new Date();
  fin.setUTCDate(fin.getUTCDate() + 26);
  const endDate = fin.toISOString().slice(0, 10);
  const compartido = plan(borrador({ budgetMode: "total", dailyBudget: 800000, endDate }));
  assert.ok(compartido.issues.some((i) => !i.blocking && /CADA plataforma/.test(i.message)));
  const repartido = plan(borrador({ budgetMode: "total", endDate, dailyBudget: 800000, budgetByPlatform: { google: 410000, meta: 390000 } }));
  assert.ok(!repartido.issues.some((i) => /CADA plataforma/.test(i.message)));
  const meta = ejecutables(repartido).find((s) => s.platform === "meta" && s.action === "create_campaign");
  assert.equal(meta.params.lifetime_budget, 390000);
});

test("impulsar una publicación nombra la campaña con la sigla de interacción (AE), no la del objetivo pedido", () => {
  const r = plan(borrador({ platforms: ["meta"], objective: "leads", boostPostId: "555_999" }));
  const campana = ejecutables(r).find((s) => s.action === "create_campaign");
  assert.match(campana.params.name, /^\[AE\]/);
  assert.equal(campana.params.objective, "OUTCOME_ENGAGEMENT");
});

test("cliente sin conversiones medidas: Google parte con Maximizar clics y lo avisa; con conversiones, Maximizar conversiones", () => {
  const sin = buildPlan(borrador({ platforms: ["google"] }), null, [CUENTA_GOOGLE], SNAPSHOT, new Set(), null, { sinConversionesMedidas: true });
  assert.equal(ejecutables(sin).find((s) => s.action === "create_campaign").params.bidding_strategy, "target_spend");
  assert.ok(sin.issues.some((i) => !i.blocking && i.field === "bidding"));
  const con = buildPlan(borrador({ platforms: ["google"] }), null, [CUENTA_GOOGLE], SNAPSHOT);
  assert.equal(ejecutables(con).find((s) => s.action === "create_campaign").params.bidding_strategy, "maximize_conversions");
  // Un objetivo que no usa conversiones no cambia ni avisa.
  const trafico = buildPlan(borrador({ platforms: ["google"], objective: "trafico" }), null, [CUENTA_GOOGLE], SNAPSHOT, new Set(), null, { sinConversionesMedidas: true });
  assert.ok(!trafico.issues.some((i) => i.field === "bidding"));
});

test("impulsar con un objetivo de leads avisa que la campaña será de interacción (no capta leads)", () => {
  const r = plan(borrador({ platforms: ["meta"], objective: "leads", boostPostId: "555_999" }));
  assert.ok(r.issues.some((i) => !i.blocking && /INTERACCIÓN/.test(i.message)));
  const normal = plan(borrador({ platforms: ["meta"], objective: "alcance", boostPostId: "555_999" }));
  assert.ok(!normal.issues.some((i) => /INTERACCIÓN/.test(i.message)));
});

test("Google Performance Max arma un único paso nativo, sin anuncio de búsqueda ni palabras clave", () => {
  const r = plan(
    borrador({
      platforms: ["google"],
      googleChannel: "pmax",
      displaySquareUrl: "https://ejemplo.com/cuadrada.png",
      displayLogoUrl: "https://ejemplo.com/logo.png",
      displayLongHeadline: "Titulo largo de prueba",
      displayBusinessName: "Mi negocio",
      headlines: ["Uno", "Dos", "Tres"],
      descriptions: ["Descripción corta", "Otra descripción de prueba"],
    }),
  );
  assert.deepEqual(bloqueantes(r), []);
  assert.deepEqual(ejecutables(r).map((s) => s.action), ["ads:create_pmax"]);
  const paso = ejecutables(r)[0];
  assert.equal(paso.via, "nativa");
  assert.equal(paso.params.status, "enabled");
  assert.deepEqual(paso.params.locations, ["2152"]);
  assert.equal(paso.params.daily_budget_micros % 1_000_000, 0);
});

test("Performance Max sin logo ni título largo queda bloqueado", () => {
  const r = plan(borrador({ platforms: ["google"], googleChannel: "pmax", headlines: ["Uno", "Dos", "Tres"], descriptions: ["Corta", "Otra"] }));
  const campos = bloqueantes(r).map((i) => i.field);
  assert.ok(campos.includes("displayLogoUrl") && campos.includes("displayLongHeadline"));
});

test("Meta: un lugar con key real de Meta segmenta por región o ciudad de Meta, no por un círculo", () => {
  const r = plan(
    borrador({
      platforms: ["meta"],
      targetCountries: [],
      targetPlaces: [
        { id: "20000000", nombre: "Maule", countryCode: "CL", tier: "region", metaKey: "672" },
        { id: "21000000", nombre: "Talca", countryCode: "CL", tier: "city", metaKey: "2451234", lat: -35.4, lng: -71.6, radiusKm: 10 },
        { id: "osm:1", nombre: "Cauquenes", countryCode: "CL", tier: "city", lat: -35.9, lng: -72.3, radiusKm: 15 },
      ],
    }),
  );
  const geo = ejecutables(r).find((s) => s.action === "create_adset").params.targeting.geo_locations;
  assert.deepEqual(geo.regions, [{ key: "672" }]);
  assert.deepEqual(geo.cities, [{ key: "2451234" }]);
  assert.equal(geo.custom_locations.length, 1); // solo el que no tiene key (Cauquenes)
  assert.equal(geo.countries, undefined);
  assert.equal(normalizeDraft({ targetPlaces: [{ id: "1", nombre: "X", countryCode: "CL", tier: "region", metaKey: "no-es-numero" }] }).targetPlaces[0].metaKey, undefined);
});

test("cada plataforma usa su propio objetivo cuando se elige uno distinto", () => {
  const r = plan(borrador({ objective: "leads", objectiveByPlatform: { meta: "alcance" } }));
  assert.deepEqual(bloqueantes(r), []);
  const campanaMeta = r.steps.find((s) => s.platform === "meta" && s.action === "create_campaign");
  const campanaGoogle = r.steps.find((s) => s.platform === "google" && s.action === "create_campaign");
  assert.equal(campanaMeta.params.objective, "OUTCOME_AWARENESS");
  assert.match(campanaMeta.params.name, /\[AE\]/);
  assert.match(campanaGoogle.params.name, /\[LDS\]/);
  const conjuntoMeta = r.steps.find((s) => s.platform === "meta" && s.action === "create_adset");
  assert.equal(conjuntoMeta.params.optimization_goal, "REACH");
});

test("un objetivo por plataforma igual al general no cambia nada y uno inválido se ignora", () => {
  const d = borrador({ objective: "trafico", objectiveByPlatform: { meta: "trafico", google: "inventado" } });
  assert.deepEqual(d.objectiveByPlatform, {});
});

test("las audiencias elegidas y excluidas de Meta van al segmento; los ids inválidos se descartan", () => {
  const d = borrador({
    platforms: ["meta"],
    metaCustomAudiences: ["52525141104437", "abc", "52525141104437"],
    metaExcludedAudiences: ["52517686618237"],
    metaInterests: ["6003437140731"],
  });
  assert.deepEqual(d.metaCustomAudiences, ["52525141104437"]);
  const conjunto = plan(d).steps.find((s) => s.action === "create_adset");
  assert.deepEqual(conjunto.params.targeting.custom_audiences, [{ id: "52525141104437" }]);
  assert.deepEqual(conjunto.params.targeting.excluded_custom_audiences, [{ id: "52517686618237" }]);
  assert.deepEqual(conjunto.params.targeting.flexible_spec, [{ interests: [{ id: "6003437140731" }] }]);
});

test("con la configuración nativa, Google crea la campaña de Búsqueda en un solo paso y sin pasos de Windsor", () => {
  const d = borrador({
    platforms: ["google"],
    googleBusqueda: { puja: "auto", enlaces: [{ texto: "Nosotros", descripcion1: "", descripcion2: "", url: "https://ejemplo.com/n" }], programacion: [{ dias: ["MONDAY"], desde: 9, hasta: 18 }], redSocios: false },
  });
  assert.equal(d.googleBusqueda.redSocios, false);
  const r = plan(d);
  assert.deepEqual(ejecutables(r).map((s) => s.action), ["ads:create_search_campaign"]);
  const paso = ejecutables(r)[0];
  assert.equal(paso.via, "nativa");
  assert.equal(paso.params.datos.puja.tipo, "conversiones"); // objetivo leads + cliente que mide conversiones
  assert.equal(paso.params.datos.redes.socios, false);
  assert.equal(paso.params.datos.palabras[0].texto, "zapatos");
  assert.equal(paso.params.datos.enlaces.length, 1);
});

test("la puja automática pasa a clics si el cliente no mide conversiones", () => {
  const d = borrador({ platforms: ["google"], googleBusqueda: { puja: "auto" } });
  const r = buildPlan(d, null, [CUENTA_GOOGLE], SNAPSHOT, undefined, undefined, { sinConversionesMedidas: true });
  assert.equal(r.steps.find((s) => s.action === "ads:create_search_campaign").params.datos.puja.tipo, "clics");
  assert.ok(r.issues.some((i) => /medición de conversiones/.test(i.message) && !i.blocking));
});

test("sin configuración nativa, Google sigue usando la vía de siempre", () => {
  assert.equal(borrador({ platforms: ["google"] }).googleBusqueda, null);
  assert.ok(ejecutables(plan(borrador({ platforms: ["google"] }))).some((s) => s.action === "create_campaign"));
});

test("Meta: estrategia de puja, importe, límite de gasto y atribución llegan al plan", () => {
  const d = borrador({
    platforms: ["meta"],
    objective: "trafico",
    metaBidStrategy: "COST_CAP",
    metaBidAmount: 1250,
    metaSpendCap: 50000,
    metaAttribution: "click_1d",
  });
  const r = plan(d);
  assert.deepEqual(bloqueantes(r), []);
  // Por defecto el presupuesto vive en la campaña (CBO): la estrategia va ahí y el importe en el conjunto.
  const campana = r.steps.find((s) => s.action === "create_campaign");
  assert.equal(campana.params.bid_strategy, "COST_CAP");
  const conjunto = r.steps.find((s) => s.action === "create_adset");
  assert.equal(conjunto.params.bid_strategy, undefined);
  assert.equal(conjunto.params.bid_amount, 1250);
  assert.deepEqual(conjunto.params.extra_params.attribution_spec, [{ event_type: "CLICK_THROUGH", window_days: 1 }]);
  const limite = r.steps.find((s) => s.action === "update_campaign");
  assert.ok(limite, "el límite de gasto es un paso aparte");
  assert.equal(limite.params.spend_cap, 50000);
  // Con presupuesto en el conjunto, la estrategia va en el conjunto.
  const sinCbo = plan(borrador({ platforms: ["meta"], objective: "trafico", metaBudgetLevel: "conjunto", metaBidStrategy: "LOWEST_COST_WITH_BID_CAP", metaBidAmount: 900 }));
  const c2 = sinCbo.steps.find((s) => s.action === "create_adset");
  assert.equal(c2.params.bid_strategy, "LOWEST_COST_WITH_BID_CAP");
  assert.equal(c2.params.bid_amount, 900);
});

test("Meta: una estrategia con importe sin importe, o ROAS fuera de ventas, bloquea", () => {
  const sinImporte = plan(borrador({ platforms: ["meta"], metaBidStrategy: "LOWEST_COST_WITH_BID_CAP" }));
  assert.ok(bloqueantes(sinImporte).some((i) => /necesita un importe/.test(i.message)));
  const roas = plan(borrador({ platforms: ["meta"], objective: "leads", metaBidStrategy: "LOWEST_COST_WITH_MIN_ROAS", metaBidAmount: 3 }));
  assert.ok(bloqueantes(roas).some((i) => /ROAS mínimo solo existe para campañas de ventas/.test(i.message)));
});

test("tráfico no admite ventanas con vista; con ventas sí", () => {
  const trafico = plan(borrador({ platforms: ["meta"], objective: "trafico", metaAttribution: "click_1d_view_1d" }));
  assert.ok(bloqueantes(trafico).some((i) => /solo admite la ventana predeterminada/.test(i.message)));
  const ventas = plan(borrador({ platforms: ["meta"], objective: "ventas", metaAttribution: "click_1d_view_1d" }));
  assert.ok(!bloqueantes(ventas).some((i) => /ventana/.test(i.message)));
});
