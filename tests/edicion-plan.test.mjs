import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { planEdicion } = await import("../lib/edicion-plan.ts");
const {
  detalleAnuncioGaql, detalleAnuncioMeta, detalleCampanaGaql, detalleCampanaMeta,
  detalleConjuntoGaql, detalleConjuntoMeta,
} = await import("../lib/detalle-entidad.ts");

// --- datos reales de Colbún (2026-09-29), recortados ---
const CAMPANA_META = detalleCampanaMeta({
  account_id: "2006250736667023", account_currency: "CLP", campaign_id: "52525140669037",
  campaign: "Concurso Maule", campaign_effective_status: "ACTIVE", campaign_objective: "OUTCOME_AWARENESS",
  campaign_bid_strategy: "LOWEST_COST_WITHOUT_CAP", campaign_daily_budget: null, campaign_lifetime_budget: 64000,
  campaign_special_ad_categories: "[]",
});
const CONJUNTO_META = detalleConjuntoMeta({
  account_id: "2006250736667023", account_currency: "CLP", campaign_id: "52525140669037",
  adset_id: "52528100744637", adset_name: "IG Historias - Maule", adset_effective_status: "ACTIVE",
  adset_daily_budget: null, adset_lifetime_budget: null, adset_bid_strategy: "LOWEST_COST_WITHOUT_CAP", adset_bid_amount: null,
  adsset_optimization_goal: "REACH", adset_end_time: "2026-09-30T23:59:00-0300",
  adset_targeting: '{"age_max": 65, "age_min": 18, "age_range": [20, 55], "custom_audiences": [{"id": "1", "name": "Engagers"}], "geo_locations": {"countries": ["CL"], "location_types": ["home", "recent"]}, "targeting_automation": {"advantage_audience": 1}, "publisher_platforms": ["instagram"], "instagram_positions": ["story"]}',
});
const ANUNCIO_META = detalleAnuncioMeta({
  account_id: "2006250736667023", campaign_id: "52525140669037", adset_id: "52528100744637", ad_id: "52528100744437",
  ad_name: "Concurso", effective_status: "ACTIVE", body: "Participa en el Concurso", title: "Regístrate",
  call_to_action_type: "SIGN_UP", link: "https://forms.gle/ZwbTwSr74XpqWKvN9", image_url: "https://cdn.example/a.jpg",
});
const ANUNCIO_META_POST = detalleAnuncioMeta({
  account_id: "2006250736667023", ad_id: "9", effective_status: "ACTIVE", body: "x",
  link: "https://www.instagram.com/p/Db4KxuEsdIh/",
});

const CAMPANA_GOOGLE = detalleCampanaGaql({
  campaign: { id: "24285672458", name: "Plan Hogar", status: "ENABLED", advertisingChannelType: "SEARCH" },
  campaignBudget: { amountMicros: "20000000" },
}, "423-204-0466");
const GRUPO_GOOGLE = detalleConjuntoGaql({
  adGroup: { id: "200161750683", name: "Principal", status: "ENABLED", type: "SEARCH_STANDARD", cpcBidMicros: "1500000" },
  campaign: { id: "24285672458" },
}, "423-204-0466");
const RSA_GOOGLE = detalleAnuncioGaql({
  adGroupAd: {
    status: "PAUSED",
    ad: {
      id: "825843439416", type: "RESPONSIVE_SEARCH_AD", finalUrls: ["https://colbun.cl"],
      responsiveSearchAd: {
        headlines: [{ text: "Colbún Energía" }, { text: "Conoce Colbún" }, { text: "Descubre Colbún" }],
        descriptions: [{ text: "Visita nuestro sitio." }, { text: "Energía para Chile." }],
      },
    },
  },
  adGroup: { id: "201397147838" }, campaign: { id: "24291743422" },
}, "423-204-0466");
const VIDEO_GOOGLE = detalleAnuncioGaql({ adGroupAd: { status: "ENABLED", ad: { id: "8", type: "VIDEO_RESPONSIVE_AD" } }, adGroup: { id: "7" } }, "423-204-0466");

const CLP = { currency: "CLP" };
const conNativa = { currency: "CLP", nativaGoogle: true };
const bloqueantes = (p) => p.problemas.filter((x) => x.bloqueante);

test("pedir lo mismo que ya tiene no genera ninguna escritura", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META }, { textoPrincipal: "Participa en el Concurso", titulo: "Regístrate", cta: "SIGN_UP" }, CLP);
  assert.equal(p.pasos.length, 0);
  assert.match(p.problemas[0].mensaje, /ya es lo que tiene/);
});

test("un plan sin cambios pedidos lo dice", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META }, {}, CLP);
  assert.match(p.problemas[0].mensaje, /ningún cambio/);
});

test("Meta anuncio: cambiar texto, URL y botón es UN solo update_ad_creative con solo lo que cambió", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META },
    { textoPrincipal: "Nuevo texto", urlDestino: "https://colbun.cl/concurso", cta: "LEARN_MORE", titulo: "Regístrate" }, CLP);
  assert.equal(p.pasos.length, 1);
  const [paso] = p.pasos;
  assert.equal(paso.action, "update_ad_creative");
  assert.equal(paso.via, "windsor");
  assert.deepEqual(paso.params, { ad_id: "52528100744437", message: "Nuevo texto", link: "https://colbun.cl/concurso", call_to_action_type: "LEARN_MORE" });
  assert.deepEqual(p.diff.map((d) => d.campo).sort(), ["cta", "textoPrincipal", "urlDestino"]);
  assert.equal(p.diff.find((d) => d.campo === "urlDestino").antes, "https://forms.gle/ZwbTwSr74XpqWKvN9");
  assert.equal(p.pausaAlAplicar, true);
});

test("Meta anuncio: renombrar solo NO pausa (regla del equipo)", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META }, { nombre: "Concurso v2" }, CLP);
  assert.deepEqual(p.pasos.map((s) => s.action), ["update_ad"]);
  assert.equal(p.pausaAlAplicar, false);
});

test("Meta anuncio: renombrar y cambiar contenido son dos pasos y sí pausa", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META }, { nombre: "v2", titulo: "Participa" }, CLP);
  assert.deepEqual(p.pasos.map((s) => s.action), ["update_ad", "update_ad_creative"]);
  assert.equal(p.pausaAlAplicar, true);
});

test("Meta anuncio: URL, imagen y botón inválidos se rechazan antes de escribir", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META },
    { urlDestino: "colbun.cl", imagenUrl: "no-es-url", cta: "HACKEAR" }, CLP);
  assert.equal(p.pasos.length, 0);
  assert.deepEqual(bloqueantes(p).map((x) => x.campo).sort(), ["cta", "imagenUrl", "urlDestino"]);
});

test("Meta anuncio: un anuncio que reusa una publicación no permite editar contenido, con motivo", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META_POST }, { textoPrincipal: "otro" }, CLP);
  assert.equal(p.pasos.length, 0);
  assert.equal(p.diff.length, 0);
  assert.match(bloqueantes(p)[0].mensaje, /publicación existente/);
});

test("Meta anuncio: un nombre sí se puede cambiar aunque el contenido esté bloqueado", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META_POST }, { nombre: "x", textoPrincipal: "y" }, CLP);
  assert.deepEqual(p.pasos.map((s) => s.action), ["update_ad"]);
  assert.deepEqual(p.diff.map((d) => d.campo), ["nombre"]);
});

test("Meta campaña: el presupuesto se envía en la unidad menor de la moneda (CLP no tiene centavos)", () => {
  const p = planEdicion("meta", { nivel: "campana", entidad: CAMPANA_META }, { presupuesto: { tipo: "lifetime", monto: 80000 } }, CLP);
  assert.deepEqual(p.pasos[0].params, { campaign_id: "52525140669037", budget_type: "lifetime", amount: 80000 });
  const usd = planEdicion("meta", { nivel: "campana", entidad: CAMPANA_META }, { presupuesto: { tipo: "lifetime", monto: 800.5 } }, { currency: "USD" });
  assert.equal(usd.pasos[0].params.amount, 80050);
});

test("Meta campaña: cambiar de total a diario avisa que reemplaza al total (no bloquea)", () => {
  const p = planEdicion("meta", { nivel: "campana", entidad: CAMPANA_META }, { presupuesto: { tipo: "daily", monto: 5000 } }, CLP);
  assert.equal(p.pasos.length, 1);
  assert.ok(p.problemas.some((x) => !x.bloqueante && /reemplaza/.test(x.mensaje)));
  assert.equal(bloqueantes(p).length, 0);
});

test("Meta conjunto: si el presupuesto lo reparte la campaña, no se edita en el conjunto", () => {
  const p = planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: CAMPANA_META }, { presupuesto: { tipo: "daily", monto: 3000 } }, CLP);
  assert.equal(p.pasos.length, 0);
  assert.match(bloqueantes(p)[0].mensaje, /reparte la campaña/);
});

test("Meta conjunto: la campaña sin presupuesto propio manda el presupuesto al conjunto", () => {
  const sinPresupuesto = detalleCampanaMeta({ account_id: "1", account_currency: "CLP", campaign_id: "2", campaign: "x" });
  const p = planEdicion("meta", { nivel: "campana", entidad: sinPresupuesto }, { presupuesto: { tipo: "daily", monto: 3000 } }, CLP);
  assert.match(bloqueantes(p)[0].mensaje, /cada conjunto tiene el suyo/);
});

test("Meta conjunto: cambiar la edad envía la segmentación COMPLETA, conservando audiencias, posiciones y Advantage+", () => {
  const p = planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: CAMPANA_META }, { edadMin: 25, edadMax: 55 }, CLP);
  const t = p.pasos[0].params.targeting;
  assert.equal(t.age_min, 25);
  assert.equal(t.age_max, 55);
  assert.deepEqual(t.custom_audiences, [{ id: "1", name: "Engagers" }]);
  assert.deepEqual(t.publisher_platforms, ["instagram"]);
  assert.deepEqual(t.instagram_positions, ["story"]);
  assert.deepEqual(t.targeting_automation, { advantage_audience: 1 });
  assert.deepEqual(t.geo_locations.location_types, ["home", "recent"]);
  // Y no se modificó el "antes".
  assert.equal(CONJUNTO_META.segmentacionCruda.age_min, 18);
});

test("Meta conjunto: la edad fuera de rango se rechaza", () => {
  for (const cambios of [{ edadMin: 10 }, { edadMax: 80 }, { edadMin: 50, edadMax: 30 }]) {
    const p = planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: null }, cambios, CLP);
    assert.equal(p.pasos.length, 0, JSON.stringify(cambios));
    assert.ok(bloqueantes(p).length > 0);
  }
});

test("Meta conjunto: cambiar países se hace, pero no si pisaría regiones o ciudades", () => {
  const ok = planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: null }, { paises: ["cl", "pe"] }, CLP);
  assert.deepEqual(ok.pasos[0].params.targeting.geo_locations.countries, ["CL", "PE"]);
  const conRegion = detalleConjuntoMeta({
    account_id: "1", adset_id: "2",
    adset_targeting: '{"age_min": 18, "age_max": 65, "geo_locations": {"regions": [{"key": "672", "name": "Maule Region", "country": "CL"}]}}',
  });
  const bloqueado = planEdicion("meta", { nivel: "conjunto", entidad: conRegion, campana: null }, { paises: ["PE"] }, CLP);
  assert.equal(bloqueado.pasos.length, 0);
  assert.match(bloqueantes(bloqueado)[0].mensaje, /regiones, ciudades o radio/);
});

test("Meta conjunto: países mal formados o vacíos se rechazan", () => {
  for (const paises of [[], ["CHILE"], ["c1"]]) {
    const p = planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: null }, { paises }, CLP);
    assert.equal(p.pasos.length, 0, JSON.stringify(paises));
  }
});

test("Meta conjunto: no se edita la segmentación a ciegas si no se pudo leer", () => {
  const sinSeg = detalleConjuntoMeta({ account_id: "1", adset_id: "2", adset_targeting: null });
  const p = planEdicion("meta", { nivel: "conjunto", entidad: sinSeg, campana: null }, { edadMin: 20 }, CLP);
  assert.equal(p.pasos.length, 0);
  assert.match(bloqueantes(p)[0].mensaje, /a ciegas/);
});

test("Meta conjunto: nombre + edad + fin van en UN update_adset", () => {
  const fin = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const p = planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: null }, { nombre: "Nuevo", edadMin: 22, fin }, CLP);
  assert.equal(p.pasos.length, 1);
  assert.equal(p.pasos[0].action, "update_adset");
  assert.equal(p.pasos[0].params.name, "Nuevo");
  assert.equal(p.pasos[0].params.end_time, fin);
  assert.equal(p.pasos[0].params.targeting.age_min, 22);
});

test("Meta conjunto: la fecha de término debe ser futura y de menos de un año", () => {
  const cambios = (fin) => planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: null }, { fin }, CLP);
  assert.match(bloqueantes(cambios("2020-01-01T00:00:00Z"))[0].mensaje, /ya pasó/);
  assert.match(bloqueantes(cambios(new Date(Date.now() + 400 * 86_400_000).toISOString()))[0].mensaje, /un año/);
  assert.match(bloqueantes(cambios("mañana"))[0].mensaje, /no es válida/);
});

test("Meta conjunto: una puja sin tope avisa que Meta la ignora (no bloquea)", () => {
  const p = planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: null }, { puja: 1500 }, CLP);
  assert.equal(p.pasos[0].params.bid_amount, 1500);
  assert.ok(p.problemas.some((x) => !x.bloqueante && /sin tope/.test(x.mensaje)));
});

test("Google campaña: el presupuesto va en micros y Google no admite total", () => {
  const p = planEdicion("google", { nivel: "campana", entidad: CAMPANA_GOOGLE }, { presupuesto: { tipo: "daily", monto: 35.5 } }, CLP);
  assert.deepEqual(p.pasos[0].params, { campaign_id: "24285672458", budget_type: "daily", amount_micros: 35_500_000 });
  const total = planEdicion("google", { nivel: "campana", entidad: CAMPANA_GOOGLE }, { presupuesto: { tipo: "lifetime", monto: 100 } }, CLP);
  assert.equal(total.pasos.length, 0);
  assert.match(bloqueantes(total)[0].mensaje, /diario/);
});

test("Google grupo: renombrar y CPC máximo son acciones de Windsor distintas", () => {
  const p = planEdicion("google", { nivel: "conjunto", entidad: GRUPO_GOOGLE, campana: CAMPANA_GOOGLE }, { nombre: "Nuevo", puja: 2.25 }, CLP);
  assert.deepEqual(p.pasos.map((s) => s.action), ["rename_ad_group", "set_max_cpc"]);
  assert.equal(p.pasos[1].params.amount_micros, 2_250_000);
  assert.equal(p.pausaAlAplicar, true);
});

test("Google anuncio: editar titulares y URL es UN paso nativo, en el mismo anuncio", () => {
  const p = planEdicion("google", { nivel: "anuncio", entidad: RSA_GOOGLE }, {
    titulares: [{ texto: "Nuevo titular" }, { texto: "Conoce Colbún" }, { texto: "Descubre Colbún" }],
    urlsFinales: ["https://colbun.cl/hogar"],
  }, conNativa);
  assert.equal(p.pasos.length, 1);
  const [paso] = p.pasos;
  assert.equal(paso.via, "nativa");
  assert.equal(paso.params.ad_id, "825843439416");
  assert.equal(paso.params.ad_group_id, "201397147838");
  assert.deepEqual(paso.params.cambios.urlsFinales, ["https://colbun.cl/hogar"]);
  assert.equal(paso.params.cambios.titulares[0].texto, "Nuevo titular");
  assert.equal("descripciones" in paso.params.cambios, false);
  assert.deepEqual(bloqueantes(p), []);
  assert.equal(p.diff.find((d) => d.campo === "urlsFinales").antes, "https://colbun.cl");
});

test("Google anuncio: sin la cuenta de Google conectada avisa qué hacer", () => {
  const p = planEdicion("google", { nivel: "anuncio", entidad: RSA_GOOGLE }, { urlsFinales: ["https://x.cl"] }, CLP);
  assert.match(bloqueantes(p)[0].mensaje, /conectar tu cuenta de Google en Integraciones/);
});

test("Google anuncio: los límites de Google se validan antes de llamar", () => {
  const p = planEdicion("google", { nivel: "anuncio", entidad: RSA_GOOGLE }, {
    titulares: [{ texto: "x".repeat(31) }, { texto: "b" }, { texto: "c" }],
  }, conNativa);
  assert.ok(bloqueantes(p).some((x) => /30/.test(x.mensaje)));
});

test("Google anuncio: pedir los mismos titulares no escribe nada", () => {
  const p = planEdicion("google", { nivel: "anuncio", entidad: RSA_GOOGLE }, {
    titulares: RSA_GOOGLE.contenido.titulares.map((t) => ({ texto: t.texto, fijado: t.fijado })),
  }, conNativa);
  assert.equal(p.pasos.length, 0);
});

test("Google anuncio de video: el contenido no se edita y dice por qué", () => {
  const p = planEdicion("google", { nivel: "anuncio", entidad: VIDEO_GOOGLE }, { urlsFinales: ["https://x.cl"] }, conNativa);
  assert.equal(p.pasos.length, 0);
  assert.match(bloqueantes(p)[0].mensaje, /VIDEO_RESPONSIVE_AD/);
});

test("una plataforma sin edición implementada no arma pasos", () => {
  const p = planEdicion("tiktok", { nivel: "campana", entidad: CAMPANA_GOOGLE }, { nombre: "x" }, CLP);
  assert.equal(p.pasos.length, 0);
  assert.ok(bloqueantes(p).length > 0);
});

const { verificarCambios } = await import("../lib/edicion-plan.ts");

test("verificación: lo que la plataforma ya refleja coincide, lo que no, no", () => {
  const plan = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META }, { titulo: "Participa", cta: "LEARN_MORE" }, CLP);
  const despues = { nivel: "anuncio", entidad: { ...ANUNCIO_META, contenido: { ...ANUNCIO_META.contenido, titulo: "Participa", cta: "SIGN_UP" } } };
  const v = verificarCambios(plan, despues);
  assert.equal(v.find((x) => x.campo === "titulo").coincide, true);
  assert.equal(v.find((x) => x.campo === "cta").coincide, false);
  assert.equal(v.find((x) => x.campo === "cta").actual, "SIGN_UP");
});

test("verificación: si no se pudo releer, no se da nada por confirmado", () => {
  const plan = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META }, { titulo: "Participa" }, CLP);
  assert.deepEqual(verificarCambios(plan, null).map((x) => x.coincide), [null]);
});

test("verificación: el presupuesto y la segmentación no son verificables desde acá y lo dicen", () => {
  const plan = planEdicion("meta", { nivel: "campana", entidad: CAMPANA_META }, { presupuesto: { tipo: "lifetime", monto: 80000 } }, CLP);
  const v = verificarCambios(plan, { nivel: "campana", entidad: CAMPANA_META });
  assert.equal(v[0].coincide, null);
  assert.match(v[0].actual, /No verificable/);
});

test("verificación: un renombre se comprueba contra el nombre releído", () => {
  const plan = planEdicion("meta", { nivel: "campana", entidad: CAMPANA_META }, { nombre: "Concurso 2" }, CLP);
  assert.equal(verificarCambios(plan, { nivel: "campana", entidad: { ...CAMPANA_META, nombre: "Concurso 2" } })[0].coincide, true);
  assert.equal(verificarCambios(plan, { nivel: "campana", entidad: CAMPANA_META })[0].coincide, false);
});

// Filas reales de Colbún (2026-09-29): las piezas armadas desde una publicación
// de Instagram traen `source_instagram_media_id`; las propias, no. Incluye el
// caso que la heurística anterior fallaba: `link` en null.
const REUSA_CON_LINK = detalleAnuncioMeta({
  account_id: "2006250736667023", ad_id: "52517746640837", effective_status: "ACTIVE",
  body: "Presentamos a Termi…", link: "https://www.instagram.com/p/Db30I30sZg3/",
  source_instagram_media_id: "17999013323794260", effective_object_story_id: "286255651767382_1302424781967439",
});
const REUSA_SIN_LINK = detalleAnuncioMeta({
  account_id: "2006250736667023", ad_id: "52517746640637", effective_status: "ACTIVE",
  body: "Avanzamos con energía limpia", link: null, image_hash: null, image_url: null,
  source_instagram_media_id: "18072626501267702", effective_object_story_id: "286255651767382_1619757206482093",
});
const PROPIO = detalleAnuncioMeta({
  account_id: "2006250736667023", ad_id: "52528100744437", effective_status: "ACTIVE",
  body: "Participa", link: "https://forms.gle/ZwbTwSr74XpqWKvN9", image_hash: "3fab31212eb06f6af184f2ebb6d96d4d",
  source_instagram_media_id: null, effective_object_story_id: "286255651767382_1538380521652067",
});
const MENSAJES_PROPIO = detalleAnuncioMeta({
  account_id: "2006250736667023", ad_id: "52517717599237", effective_status: "PAUSED",
  body: "Hay historias…", title: "Chat with us", link: null, image_hash: null, image_url: null,
  source_instagram_media_id: null, effective_object_story_id: "286255651767382_1503004668522986",
});

test("reuso: source_instagram_media_id lo detecta aunque el link venga en null", () => {
  for (const a of [REUSA_CON_LINK, REUSA_SIN_LINK]) {
    assert.equal(a.publicacion.existente, true);
    assert.equal(a.edicionDeContenido.editable, false);
  }
});

test("reuso: un anuncio propio no se marca como reuso, con o sin link", () => {
  for (const a of [PROPIO, MENSAJES_PROPIO]) {
    assert.equal(a.publicacion.existente, false);
    assert.equal(a.edicionDeContenido.editable, true);
  }
});

test("reuso: todo anuncio de Meta trae el id de su publicación, que es lo que pide boost_post", () => {
  assert.equal(PROPIO.publicacion.id, "286255651767382_1538380521652067");
  assert.equal(REUSA_SIN_LINK.publicacion.id, "286255651767382_1619757206482093");
  assert.match(REUSA_CON_LINK.publicacion.id, /^\d+_\d+$/);
});

test("reuso: editar contenido de un anuncio que reusa una publicación se bloquea, aunque no tenga link", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: REUSA_SIN_LINK }, { textoPrincipal: "otro" }, CLP);
  assert.equal(p.pasos.length, 0);
  assert.equal(p.diff.length, 0);
  assert.match(bloqueantes(p)[0].mensaje, /publicación existente/);
});

test("reuso: un anuncio propio de mensajes (sin imagen ni link) SÍ se puede editar", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: MENSAJES_PROPIO }, { textoPrincipal: "otro" }, CLP);
  assert.equal(p.pasos.length, 1);
  assert.equal(bloqueantes(p).length, 0);
  assert.equal(p.problemas.length, 0);
});

test("Meta anuncio: con imagen o destino propios no hay aviso de reuso", () => {
  const p = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META }, { titulo: "Nuevo" }, CLP);
  assert.equal(p.problemas.length, 0);
});

// ---------------------------------------------------------------------------
// Google: palabras clave de un grupo
// ---------------------------------------------------------------------------
const { palabraClaveGaql } = await import("../lib/detalle-entidad.ts");
const { formatearPalabraClave, parsearPalabraClave, problemaDePalabraClave } = await import("../lib/palabras-clave.ts");

const KW = (id, texto, match, estado = "ENABLED", cpc) => palabraClaveGaql({
  adGroupCriterion: { criterionId: id, keyword: { text: texto, matchType: match }, status: estado, ...(cpc ? { cpcBidMicros: cpc } : {}) },
  adGroup: { id: "200161750683" },
}).palabra;

const GRUPO_CON_KW = {
  ...GRUPO_GOOGLE,
  palabrasClave: [
    KW("111", "plan hogar", "BROAD"),
    KW("222", "cambiar de compañía", "PHRASE"),
    KW("333", "colbún energía", "EXACT", "PAUSED", "1500000"),
  ],
};
const planKw = (palabrasClave, grupo = GRUPO_CON_KW) =>
  planEdicion("google", { nivel: "conjunto", entidad: grupo, campana: CAMPANA_GOOGLE }, { palabrasClave }, CLP);

test("palabras clave: la sintaxis de Google va y viene sin perder la concordancia", () => {
  assert.deepEqual(parsearPalabraClave("[plan hogar]"), { text: "plan hogar", match_type: "EXACT" });
  assert.deepEqual(parsearPalabraClave('"plan hogar"'), { text: "plan hogar", match_type: "PHRASE" });
  assert.deepEqual(parsearPalabraClave("plan hogar"), { text: "plan hogar", match_type: "BROAD" });
  for (const m of ["EXACT", "PHRASE", "BROAD"]) {
    const { text, match_type } = parsearPalabraClave(formatearPalabraClave("luz", m));
    assert.equal(match_type, m);
    assert.equal(text, "luz");
  }
});

test("palabras clave: límites de Google (80 caracteres, 10 palabras, no vacía)", () => {
  assert.equal(problemaDePalabraClave("ok"), null);
  assert.match(problemaDePalabraClave("x".repeat(81)), /80/);
  assert.match(problemaDePalabraClave("a b c d e f g h i j k"), /10 palabras/);
  assert.match(problemaDePalabraClave("  "), /vacía/);
});

test("palabras clave GAQL: se leen el id de criterio, la concordancia, el estado y el CPC propio", () => {
  const k = GRUPO_CON_KW.palabrasClave[2];
  assert.equal(k.criterionId, "333");
  assert.equal(k.concordancia, "EXACT");
  assert.equal(k.estado, "PAUSED");
  assert.equal(k.cpc, 1.5);
  assert.equal(palabraClaveGaql({ adGroupCriterion: {}, adGroup: { id: "1" } }), null);
});

test("agregar palabras clave: un solo push_keywords con la concordancia de cada una", () => {
  const p = planKw({ agregar: ["cotizar luz", '"energía residencial"', "[colbún hogar]"] });
  assert.equal(p.pasos.length, 1);
  assert.equal(p.pasos[0].action, "push_keywords");
  assert.equal(p.pasos[0].params.ad_group_id, "200161750683");
  assert.deepEqual(p.pasos[0].params.keywords, [
    { text: "cotizar luz", match_type: "BROAD" },
    { text: "energía residencial", match_type: "PHRASE" },
    { text: "colbún hogar", match_type: "EXACT" },
  ]);
  assert.equal(p.pasos[0].params.status, "enabled");
  assert.match(p.diff[0].despues, /\+ cotizar luz, "energía residencial", \[colbún hogar\]/);
  assert.equal(p.pausaAlAplicar, true);
});

test("agregar: una que ya está (misma concordancia) se omite con aviso; con otra concordancia SÍ entra", () => {
  const dup = planKw({ agregar: ["plan hogar"] });
  assert.equal(dup.pasos.length, 0);
  assert.ok(dup.problemas.some((x) => !x.bloqueante && /ya está en el grupo/.test(x.mensaje)));
  const otraConcordancia = planKw({ agregar: ["[plan hogar]"] });
  assert.equal(otraConcordancia.pasos.length, 1);
});

test("agregar: las repetidas dentro del mismo pedido entran una sola vez y las inválidas bloquean", () => {
  const p = planKw({ agregar: ["luz", "LUZ", "luz"] });
  assert.equal(p.pasos[0].params.keywords.length, 1);
  const mala = planKw({ agregar: ["x".repeat(90)] });
  assert.equal(mala.pasos.length, 0);
  assert.ok(bloqueantes(mala).length > 0);
});

test("quitar, pausar y activar usan las acciones reales con los ids de criterio", () => {
  const p = planKw({ acciones: { "111": "quitar", "222": "pausar", "333": "activar" } });
  assert.deepEqual(p.pasos.map((s) => s.action).sort(), ["remove_keywords", "update_keywords"]);
  const quitar = p.pasos.find((s) => s.action === "remove_keywords");
  assert.deepEqual(quitar.params.criterion_ids, ["111"]);
  const estado = p.pasos.find((s) => s.action === "update_keywords");
  assert.deepEqual(estado.params.updates, [
    { criterion_id: "222", status: "paused" },
    { criterion_id: "333", status: "enabled" },
  ]);
});

test("pausar una ya pausada o activar una ya activa no escribe nada", () => {
  const p = planKw({ acciones: { "333": "pausar", "111": "activar" } });
  assert.equal(p.pasos.length, 0);
});

test("una palabra clave que ya no existe se rechaza en vez de mandar un id ajeno", () => {
  const p = planKw({ acciones: { "999": "quitar" } });
  assert.equal(p.pasos.length, 0);
  assert.match(bloqueantes(p)[0].mensaje, /ya no está/);
});

test("sin poder leer las palabras clave no se edita a ciegas y se dice cómo arreglarlo", () => {
  const p = planKw({ agregar: ["luz"] }, { ...GRUPO_GOOGLE, palabrasClave: null });
  assert.equal(p.pasos.length, 0);
  assert.match(bloqueantes(p)[0].mensaje, /Conecta tu cuenta de Google/);
});

test("dejar el grupo sin palabras clave activas avisa, sin bloquear", () => {
  const p = planKw({ acciones: { "111": "quitar", "222": "quitar" } });
  assert.equal(p.pasos.length, 1);
  assert.ok(p.problemas.some((x) => !x.bloqueante && /sin palabras clave activas/.test(x.mensaje)));
});

test("combinar agregar y quitar da un diff legible con antes y después", () => {
  const p = planKw({ agregar: ["cotizar luz"], acciones: { "111": "quitar" } });
  assert.equal(p.pasos.length, 2);
  assert.match(p.diff[0].antes, /^3:/);
  assert.match(p.diff[0].despues, /\+ cotizar luz/);
  assert.match(p.diff[0].despues, /− plan hogar/);
});

// ---------------------------------------------------------------------------
// Meta: género, redes y límite de gasto
// ---------------------------------------------------------------------------
const planConjuntoMeta = (cambios) =>
  planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_META, campana: null }, cambios, CLP);

test("Meta conjunto: el género se guarda en la segmentación completa y 'todos' lo quita", () => {
  const p = planConjuntoMeta({ generos: "mujeres" });
  assert.deepEqual(p.pasos[0].params.targeting.genders, [2]);
  assert.deepEqual(p.pasos[0].params.targeting.custom_audiences, [{ id: "1", name: "Engagers" }], "no pierde el resto");
  const hombres = detalleConjuntoMeta({ account_id: "1", adset_id: "2", adset_targeting: '{"age_min":18,"age_max":65,"genders":[1],"geo_locations":{"countries":["CL"]}}' });
  const todos = planEdicion("meta", { nivel: "conjunto", entidad: hombres, campana: null }, { generos: "todos" }, CLP);
  assert.equal("genders" in todos.pasos[0].params.targeting, false);
});

test("Meta conjunto: pedir el mismo género que ya tiene no escribe nada", () => {
  assert.equal(planConjuntoMeta({ generos: "todos" }).pasos.length, 0);
});

test("Meta conjunto: cambiar las redes conserva las posiciones de las que siguen y quita las de las que se van", () => {
  const dosRedes = detalleConjuntoMeta({
    account_id: "1", adset_id: "2",
    adset_targeting: '{"age_min":18,"age_max":65,"geo_locations":{"countries":["CL"]},"publisher_platforms":["facebook","instagram"],"facebook_positions":["feed"],"instagram_positions":["story","reels"]}',
  });
  const p = planEdicion("meta", { nivel: "conjunto", entidad: dosRedes, campana: null }, { plataformas: ["instagram"] }, CLP);
  const t = p.pasos[0].params.targeting;
  assert.deepEqual(t.publisher_platforms, ["instagram"]);
  assert.deepEqual(t.instagram_positions, ["story", "reels"]);
  assert.equal("facebook_positions" in t, false, "posiciones de una red que ya no está");
});

test("Meta conjunto: redes automáticas (vacío) quita redes y posiciones juntas", () => {
  const p = planConjuntoMeta({ plataformas: [] });
  const t = p.pasos[0].params.targeting;
  assert.equal("publisher_platforms" in t, false);
  assert.equal("instagram_positions" in t, false);
  assert.equal(t.age_min, 18, "el resto de la segmentación queda igual");
});

test("Meta conjunto: una red desconocida se rechaza", () => {
  const p = planConjuntoMeta({ plataformas: ["myspace"] });
  assert.equal(p.pasos.length, 0);
  assert.ok(bloqueantes(p).length > 0);
});

test("Meta campaña: el límite de gasto va en la unidad menor y se lee sin confundir 0 con 'sin tope'", () => {
  const sinTope = detalleCampanaMeta({ account_id: "1", account_currency: "CLP", campaign_id: "2", campaign_spend_cap: 0 });
  assert.equal(sinTope.limiteGasto, null);
  const p = planEdicion("meta", { nivel: "campana", entidad: sinTope }, { limiteGasto: 150000 }, CLP);
  assert.deepEqual(p.pasos[0].params, { campaign_id: "2", spend_cap: 150000 });
  assert.equal(p.diff[0].antes, "Sin límite");
  const usd = planEdicion("meta", { nivel: "campana", entidad: sinTope }, { limiteGasto: 1500.5 }, { currency: "USD" });
  assert.equal(usd.pasos[0].params.spend_cap, 150050);
  assert.equal(planEdicion("meta", { nivel: "campana", entidad: sinTope }, { limiteGasto: 0 }, CLP).pasos.length, 0);
});

test("Presupuesto: subirlo pausa; bajarlo no; bajarlo junto a otro cambio sí pausa", () => {
  const diario = CAMPANA_GOOGLE.presupuesto.diario;
  assert.ok(diario > 0);
  const sube = planEdicion("google", { nivel: "campana", entidad: CAMPANA_GOOGLE }, { presupuesto: { tipo: "daily", monto: diario * 2 } }, CLP);
  assert.equal(sube.pausaAlAplicar, true);
  const baja = planEdicion("google", { nivel: "campana", entidad: CAMPANA_GOOGLE }, { presupuesto: { tipo: "daily", monto: diario / 2 } }, CLP);
  assert.equal(baja.pasos.length, 1);
  assert.equal(baja.pausaAlAplicar, false);
  const mixto = planEdicion("google", { nivel: "campana", entidad: CAMPANA_GOOGLE }, { nombre: "Otro", presupuesto: { tipo: "daily", monto: diario / 2 } }, CLP);
  assert.equal(mixto.pausaAlAplicar, false); // renombre + baja: ninguno obliga a pausar
});

test("Meta anuncio con publicación existente: los parámetros de URL sí se editan; el contenido se bloquea con motivo", () => {
  const sinContenido = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META_POST }, { urlTags: "utm_source=ig&utm_medium=paid" }, CLP);
  assert.deepEqual(sinContenido.pasos.map((s) => s.action), ["update_ad_creative"]);
  assert.deepEqual(sinContenido.pasos[0].params, { ad_id: ANUNCIO_META_POST.id, url_tags: "utm_source=ig&utm_medium=paid" });
  assert.equal(bloqueantes(sinContenido).length, 0);
  const mixto = planEdicion("meta", { nivel: "anuncio", entidad: ANUNCIO_META_POST }, { urlTags: "utm_source=x", textoPrincipal: "otro texto" }, CLP);
  assert.deepEqual(mixto.pasos[0].params, { ad_id: ANUNCIO_META_POST.id, url_tags: "utm_source=x" });
  assert.ok(bloqueantes(mixto).some((x) => x.campo === "contenido"));
  assert.deepEqual(mixto.diff.map((d) => d.campo), ["urlTags"]);
});

test("Meta (anuncio): dominio de conversión y mensaje de bienvenida arman sus pasos; un dominio inválido se rechaza", async () => {
  const { planEdicion } = await import("../lib/edicion-plan.ts");
  const anuncio = {
    provider: "meta", accountId: "1", campaignId: "c", conjuntoId: "j", id: "99", nombre: "A", estado: "PAUSED", tipo: null,
    contenido: { textoPrincipal: "x", titulo: null, titulares: [], descripciones: [], urlDestino: null, urlsFinales: [], path1: null, path2: null, sufijoUrl: null, urlVisible: null, cta: null, imagenUrl: null, miniaturaUrl: null, imageHash: null, urlTags: null, creativeId: null, publicacionInstagram: null, vistaPreviaUrl: null },
    edicionDeContenido: { editable: true, via: "windsor", motivo: null },
    publicacion: { id: null, existente: false },
  };
  const bueno = planEdicion("meta", { nivel: "anuncio", entidad: anuncio }, { dominioConversion: "https://www.Colbun.cl/x", mensajeBienvenida: "Hola, ¿en qué te ayudamos?" }, "CLP");
  const acciones = bueno.pasos.map((p) => p.action);
  assert.ok(acciones.includes("update_ad") && acciones.includes("set_page_welcome_message"));
  assert.equal(bueno.pasos.find((p) => p.action === "update_ad").params.conversion_domain, "www.colbun.cl");
  const malo = planEdicion("meta", { nivel: "anuncio", entidad: anuncio }, { dominioConversion: "no es un dominio" }, "CLP");
  assert.ok(malo.problemas.some((p) => p.campo === "dominioConversion" && p.bloqueante));
});

// ---------------------------------------------------------------------------
// Meta conjunto: intereses, audiencias y atribución. Google campaña: puja, ubicación y seguimiento
// ---------------------------------------------------------------------------
const CONJUNTO_CON_INTERESES = detalleConjuntoMeta({
  account_id: "1", adset_id: "2",
  adset_targeting: '{"age_min":18,"age_max":65,"geo_locations":{"countries":["CL"]},"flexible_spec":[{"interests":[{"id":"6003437140731","name":"Energía solar"}]}],"custom_audiences":[{"id":"52525141104437","name":"Engagers"}]}',
});
const planMeta2 = (cambios) => planEdicion("meta", { nivel: "conjunto", entidad: CONJUNTO_CON_INTERESES, campana: null }, cambios, CLP);

test("Meta conjunto: agregar un interés lo suma a la segmentación completa sin perder lo demás", () => {
  const p = planMeta2({ interesesIds: ["6003437140731", "6003254673882"] });
  assert.deepEqual(bloqueantes(p), []);
  const t = p.pasos[0].params.targeting;
  assert.deepEqual(t.flexible_spec[0].interests, [{ id: "6003437140731" }, { id: "6003254673882" }]);
  assert.deepEqual(t.custom_audiences, [{ id: "52525141104437", name: "Engagers" }], "no pierde las audiencias");
  assert.match(p.diff[0].antes, /Energía solar/);
});

test("Meta conjunto: quitar todos los intereses elimina la segmentación detallada", () => {
  const p = planMeta2({ interesesIds: [] });
  assert.equal("flexible_spec" in p.pasos[0].params.targeting, false);
});

test("Meta conjunto: incluir y excluir audiencias reemplaza solo esas listas", () => {
  const p = planMeta2({ audienciasIncluir: [], audienciasExcluir: ["52517686618237"] });
  const t = p.pasos[0].params.targeting;
  assert.equal("custom_audiences" in t, false);
  assert.deepEqual(t.excluded_custom_audiences, [{ id: "52517686618237" }]);
  assert.deepEqual(t.flexible_spec[0].interests, [{ id: "6003437140731", name: "Energía solar" }], "los intereses quedan");
});

test("Meta conjunto: ids inválidos se rechazan y pedir lo mismo no escribe nada", () => {
  assert.ok(bloqueantes(planMeta2({ interesesIds: ["abc"] })).length > 0);
  assert.equal(planMeta2({ interesesIds: ["6003437140731"], audienciasIncluir: ["52525141104437"] }).pasos.length, 0);
});

test("Meta conjunto: la atribución va como parámetro directo del conjunto", () => {
  const p = planMeta2({ atribucion: "click_7d" });
  assert.deepEqual(p.pasos[0].params.extra_params.attribution_spec, [{ event_type: "CLICK_THROUGH", window_days: 7 }]);
});

test("Google campaña: la puja, la ubicación y el seguimiento van en un solo paso nativo", () => {
  const p = planEdicion("google", { nivel: "campana", entidad: CAMPANA_GOOGLE }, {
    pujaGoogle: { tipo: "conversiones", cpaObjetivo: 5000 },
    presencia: "presencia",
    plantillaSeguimiento: "{lpurl}?utm_source=google",
  }, conNativa);
  assert.deepEqual(bloqueantes(p), []);
  const paso = p.pasos.find((x) => x.action === "ads:update_campaign");
  assert.deepEqual(paso.params.cambios.puja, { tipo: "conversiones", cpaObjetivoMicros: 5_000_000_000 });
  assert.equal(paso.params.cambios.presencia, "presencia");
  assert.equal(paso.params.cambios.plantillaSeguimiento, "{lpurl}?utm_source=google");
  assert.deepEqual(p.diff.map((d) => d.campo), ["pujaGoogle", "presencia", "plantillaSeguimiento"]);
});

test("Google campaña: la cuota de impresiones exige CPC máximo", () => {
  const p = planEdicion("google", { nivel: "campana", entidad: CAMPANA_GOOGLE }, { pujaGoogle: { tipo: "cuota_impresiones", cuotaPorcentaje: 60 } }, conNativa);
  assert.ok(bloqueantes(p).some((x) => /CPC máximo/.test(x.mensaje)));
});
