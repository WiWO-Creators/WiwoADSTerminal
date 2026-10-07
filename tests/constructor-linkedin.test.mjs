import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

// LinkedIn dentro del Constructor: validación, plan y traducción del borrador. Ninguna prueba llama a LinkedIn.
const { buildPlan, normalizeDraft } = await import("../lib/constructor.ts");
const L = await import("../lib/constructor-linkedin.ts");
const { CONSTRUCTOR_PLATFORMS, ACTIVE_PLATFORMS, puedeConstruir, isActivePlatform } = await import("../lib/plataformas.ts");

const CUENTA_GOOGLE = { externalId: "111-222-3333", name: "Cuenta Google", provider: "google", currency: "CLP", pageId: null, pixels: [], countries: ["CL"] };
const CUENTA_META = { externalId: "999", name: "Cuenta Meta", provider: "meta", currency: "CLP", pageId: "555", pixels: [{ id: "p1", pixelId: "777", label: null }], countries: ["CL"] };
const CUENTA_LI = { externalId: "555950160", name: "Colbun S.A", provider: "linkedin", currency: "CLP", pageId: "329866", pixels: [], countries: ["CL"] };
const SNAPSHOT = { campaigns: [], rangeStart: "2026-09-01", rangeEnd: "2026-09-28" };
const LI_COMPLETO = { intencionPolitica: "NOT_POLITICAL", costoUnitario: 1500 };

function borrador(over = {}) {
  return normalizeDraft({
    portfolioId: "cliente-1",
    platforms: ["linkedin"],
    name: "Prueba",
    objective: "alcance",
    dailyBudget: 30000,
    landingUrl: "https://ejemplo.com",
    message: "Texto principal",
    mediaUrl: "https://ejemplo.com/i.jpg",
    mediaType: "image",
    targetCountries: ["CL"],
    linkedin: LI_COMPLETO,
    ...over,
  });
}
const plan = (draft, cuentas = [CUENTA_GOOGLE, CUENTA_META, CUENTA_LI]) => buildPlan(draft, null, cuentas, SNAPSHOT);
const ejecutables = (r) => r.steps.filter((s) => !s.informativo);
const bloqueantes = (r) => r.issues.filter((i) => i.blocking);

test("LinkedIn se puede construir pero NO es una plataforma «activa» (no entra al simulador ni al asistente)", () => {
  assert.ok(CONSTRUCTOR_PLATFORMS.includes("linkedin"));
  assert.ok(puedeConstruir("linkedin"));
  assert.ok(!ACTIVE_PLATFORMS.includes("linkedin"));
  assert.ok(!isActivePlatform("linkedin"));
  assert.ok(["google", "meta"].every((p) => CONSTRUCTOR_PLATFORMS.includes(p)));
  assert.ok(!puedeConstruir("tiktok"));
});

test("el borrador conserva LinkedIn como plataforma y sus datos propios", () => {
  const d = borrador({ linkedin: { ...LI_COMPLETO, organizacionId: "12345", tipoCosto: "cpm", ubicacionesGeo: ["1", "x", "22"] } });
  assert.deepEqual(d.platforms, ["linkedin"]);
  assert.equal(d.linkedin.intencionPolitica, "NOT_POLITICAL");
  assert.equal(d.linkedin.organizacionId, "12345");
  assert.equal(d.linkedin.tipoCosto, "CPM");
  assert.deepEqual(d.linkedin.ubicacionesGeo, ["1", "22"]);
  assert.deepEqual(normalizeDraft({}).linkedin, L.LINKEDIN_POR_DEFECTO);
});

test("la declaración política NO tiene valor por defecto: sin elegirla, bloquea", () => {
  assert.equal(borrador({ linkedin: { costoUnitario: 1500 } }).linkedin.intencionPolitica, "");
  const r = plan(borrador({ linkedin: { costoUnitario: 1500 } }));
  assert.ok(bloqueantes(r).some((i) => i.field === "linkedin" && /política/.test(i.message)));
  assert.deepEqual(ejecutables(r), []);
});

test("un borrador completo de LinkedIn no tiene bloqueantes y arma grupo → campaña, en borrador, + aviso del anuncio", () => {
  const r = plan(borrador());
  assert.deepEqual(bloqueantes(r), []);
  assert.deepEqual(ejecutables(r).map((s) => s.action), ["linkedin:create_group", "linkedin:create_campaign"]);
  assert.ok(ejecutables(r).every((s) => s.platform === "linkedin" && s.via === "nativa"));
  const aviso = r.steps.find((s) => s.informativo && s.platform === "linkedin");
  assert.ok(aviso && /rol/.test(String(aviso.params.nota)));
});

test("la campaña de LinkedIn recibe el grupo recién creado (marcador), la página de la cuenta, la puja y los países", () => {
  const [grupo, campana] = ejecutables(plan(borrador()));
  assert.match(grupo.params.nombre, /^\[AE\] \[LI\] Prueba$/);
  assert.equal(campana.params.grupoId, "(del paso anterior)");
  assert.equal(campana.params.entidadAsociada, "urn:li:organization:329866"); // de la cuenta (pageId)
  assert.deepEqual(campana.params.costoUnitario, { monto: 1500, moneda: "CLP" });
  assert.deepEqual(campana.params.presupuestoDiario, { monto: 30000, moneda: "CLP" });
  assert.deepEqual(campana.params.ubicacionesGeo, ["104621616"]); // Chile
  assert.equal(campana.params.objetivo, "BRAND_AWARENESS");
  assert.equal(campana.params.tipoDeCosto, "CPM");
  assert.equal(campana.params.formato, "STANDARD_UPDATE");
  assert.equal(campana.params.intencionPolitica, "NOT_POLITICAL");
  assert.deepEqual(campana.params.interfaceLocales, ["es_ES"]);
});

test("la página elegida a mano manda sobre la de la cuenta, y un video usa el formato de video", () => {
  const d = borrador({ linkedin: { ...LI_COMPLETO, organizacionId: "2641874" }, mediaType: "video", mediaUrl: "https://ejemplo.com/v.mp4" });
  const campana = ejecutables(plan(d))[1];
  assert.equal(campana.params.entidadAsociada, "urn:li:organization:2641874");
  assert.equal(campana.params.formato, "SINGLE_VIDEO");
});

test("cada objetivo del Constructor se traduce al de LinkedIn con su costo habitual, y el tipo de costo se puede forzar", () => {
  const caso = (objective, extra = {}) => ejecutables(plan(borrador({ objective, ...extra })))[1].params;
  assert.deepEqual([caso("trafico").objetivo, caso("trafico").tipoDeCosto], ["WEBSITE_VISIT", "CPC"]);
  assert.deepEqual([caso("leads").objetivo, caso("leads").tipoDeCosto], ["LEAD_GENERATION", "CPM"]);
  assert.deepEqual([caso("ventas").objetivo, caso("ventas").tipoDeCosto], ["WEBSITE_CONVERSION", "CPM"]);
  assert.deepEqual([caso("interaccion").objetivo, caso("interaccion").tipoDeCosto], ["ENGAGEMENT", "CPM"]);
  assert.equal(caso("alcance", { linkedin: { ...LI_COMPLETO, tipoCosto: "CPC" } }).tipoDeCosto, "CPC");
});

test("presupuesto total: va como total y exige fecha de término", () => {
  const sinFin = plan(borrador({ budgetMode: "total", dailyBudget: 500000 }));
  assert.ok(bloqueantes(sinFin).some((i) => i.field === "linkedin" && /término/.test(i.message)));
  const ok = plan(borrador({ budgetMode: "total", dailyBudget: 500000, endDate: "2099-12-31" }));
  assert.deepEqual(bloqueantes(ok), []);
  const [grupo, campana] = ejecutables(ok);
  assert.deepEqual(campana.params.presupuestoTotal, { monto: 500000, moneda: "CLP" });
  assert.equal("presupuestoDiario" in campana.params, false);
  assert.equal(campana.params.fin, "2099-12-31");
  assert.equal(grupo.params.fin, "2099-12-31");
});

test("sin puja, sin página, sin moneda o sin país bloquea con un motivo claro cada uno", () => {
  const motivos = (d, cuentas) => bloqueantes(plan(d, cuentas)).filter((i) => i.field === "linkedin").map((i) => i.message).join(" | ");
  assert.match(motivos(borrador({ linkedin: { intencionPolitica: "NOT_POLITICAL" } })), /puja|clic o por mil/);
  assert.match(motivos(borrador(), [{ ...CUENTA_LI, pageId: null }]), /página de empresa/);
  assert.match(motivos(borrador(), [{ ...CUENTA_LI, currency: null }]), /moneda/);
  assert.match(motivos(borrador({ targetCountries: [] }), [{ ...CUENTA_LI, countries: [] }]), /país/);
});

test("un país sin id de LinkedIn no se segmenta a ciegas: se pide el id a mano", () => {
  const d = borrador({ targetCountries: ["CL", "BO"] });
  const r = plan(d, [{ ...CUENTA_LI, countries: ["CL", "BO"] }]);
  // BO existe en la lista de Google pero no tiene id de LinkedIn en la tabla: debe bloquear, no segmentar a otro lugar.
  assert.ok(d.targetCountries.includes("BO"));
  assert.ok(bloqueantes(r).some((i) => /id de LinkedIn/.test(i.message) && /BO/.test(i.message)));
  assert.deepEqual(ejecutables(r), []);
  const conId = plan(borrador({ targetCountries: ["BO"], linkedin: { ...LI_COMPLETO, ubicacionesGeo: ["100808673"] } }), [CUENTA_LI]);
  assert.deepEqual(bloqueantes(conId), []);
  assert.deepEqual(ejecutables(conId)[1].params.ubicacionesGeo, ["100808673"]);
});

test("las comunas y el radio no se envían a LinkedIn y el plan lo avisa sin bloquear", () => {
  const d = borrador({ geoRadius: { lat: -33.4, lng: -70.6, radiusKm: 10 } });
  const r = plan(d);
  assert.deepEqual(bloqueantes(r), []);
  assert.ok(r.issues.some((i) => i.field === "linkedin" && !i.blocking && /país/.test(i.message)));
});

test("los idiomas del borrador se traducen a idiomas de interfaz de LinkedIn", () => {
  assert.deepEqual(L.localesLinkedin([]), ["es_ES"]);
  assert.deepEqual(L.localesLinkedin(["es", "en", "pt", "es"]), ["es_ES", "en_US", "pt_BR"]);
  const campana = ejecutables(plan(borrador({ targetLanguages: ["en"] })))[1];
  assert.deepEqual(campana.params.interfaceLocales, ["en_US"]);
});

test("sin cuenta de LinkedIn el cliente no se puede publicar, y no se inventa ningún paso", () => {
  const r = plan(borrador(), [CUENTA_GOOGLE, CUENTA_META]);
  assert.ok(bloqueantes(r).some((i) => i.field === "accountByPlatform" && /LinkedIn/.test(i.message)));
  assert.deepEqual(ejecutables(r), []);
});

test("Google, Meta y LinkedIn a la vez: cada plataforma arma lo suyo sin pisar a las otras", () => {
  const r = plan(borrador({
    platforms: ["google", "meta", "linkedin"],
    headlines: ["Titular uno", "Titular dos", "Titular tres"],
    descriptions: ["Descripción número uno", "Descripción número dos"],
    keywords: ["zapatos"],
  }));
  assert.deepEqual(bloqueantes(r), []);
  const por = (p) => ejecutables(r).filter((s) => s.platform === p).map((s) => s.action);
  assert.deepEqual(por("linkedin"), ["linkedin:create_group", "linkedin:create_campaign"]);
  assert.ok(por("google").includes("create_campaign"));
  assert.ok(por("meta").includes("create_campaign"));
  assert.ok(!por("google").some((a) => a.startsWith("linkedin")));
  assert.ok(!por("meta").some((a) => a.startsWith("linkedin")));
});

test("LinkedIn solo no cambia nada de lo que ya armaban Google y Meta", () => {
  const sinLi = plan(borrador({ platforms: ["google", "meta"], headlines: ["Titular uno", "Titular dos", "Titular tres"], descriptions: ["Descripción número uno", "Descripción número dos"], keywords: ["zapatos"] }));
  assert.ok(sinLi.steps.every((s) => s.platform !== "linkedin"));
});

test("parametrosLinkedin: sin lo mínimo devuelve los motivos, con lo mínimo devuelve los parámetros", () => {
  const entrada = {
    linkedin: { ...L.LINKEDIN_POR_DEFECTO, intencionPolitica: "NOT_POLITICAL", costoUnitario: 2 },
    objetivo: "trafico", mediaType: "none", paises: ["US"], haySegmentacionFina: false, idiomas: ["en"],
    presupuesto: 10, modo: "diaria", fin: null, moneda: "USD", paginaDeLaCuenta: "2641874", hoy: "2026-10-07", nombre: "[TRF] [LI] X",
  };
  const ok = L.parametrosLinkedin(entrada);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.campana.ubicacionesGeo, ["103644278"]);
  assert.equal(ok.campana.entidadAsociada, "urn:li:organization:2641874");
  const mal = L.parametrosLinkedin({ ...entrada, moneda: null, presupuesto: null });
  assert.equal(mal.ok, false);
  assert.ok(mal.motivos.length >= 2);
});

test("la tabla de ubicaciones tiene un nombre verificado para cada país y ninguno de los ids dudosos", () => {
  assert.deepEqual(Object.keys(L.LINKEDIN_GEO_IDS).sort(), Object.keys(L.NOMBRE_VERIFICADO_DE_UBICACION).sort());
  assert.equal(L.LINKEDIN_GEO_IDS.PA, "100808673"); // Panama (el id anterior era Gatineau, Quebec)
  for (const malo of ["108309114", "104383777", "100877708", "109088308"]) {
    assert.ok(!Object.values(L.LINKEDIN_GEO_IDS).includes(malo), "id verificado como equivocado: " + malo);
  }
  for (const pais of ["BO", "GT", "DO"]) assert.equal(L.LINKEDIN_GEO_IDS[pais], undefined);
});

test("con varios idiomas se usa el primero y el plan avisa de los demás (LinkedIn admite uno por campaña)", () => {
  const r = plan(borrador({ targetLanguages: ["es", "en"] }));
  assert.deepEqual(bloqueantes(r), []);
  assert.deepEqual(ejecutables(r)[1].params.interfaceLocales, ["es_ES"]);
  assert.ok(r.issues.some((i) => i.field === "linkedin" && !i.blocking && /un solo idioma/.test(i.message) && /en_US/.test(i.message)));
});
