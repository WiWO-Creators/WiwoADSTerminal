import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const p = await import("../lib/linkedin-nativo-pura.ts");
const { adaptarFilaLinkedin } = await import("../lib/linkedin.ts");

test("la URL de autorización lleva el state y los alcances separados por espacio", () => {
  const url = new URL(p.urlDeAutorizacion({ clientId: "abc", redirectUri: "https://ads.wiwo.me/cb", state: "s1", alcances: ["r_ads", "r_ads_reporting"] }));
  assert.equal(url.origin + url.pathname, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "s1");
  assert.equal(url.searchParams.get("scope"), "r_ads r_ads_reporting");
  assert.equal(url.searchParams.get("redirect_uri"), "https://ads.wiwo.me/cb");
});

test("los cuerpos de canje y renovación llevan el grant_type correcto", () => {
  const canje = p.cuerpoCanjeDeCodigo({ code: "c", clientId: "i", clientSecret: "s", redirectUri: "r" });
  assert.equal(canje.get("grant_type"), "authorization_code");
  assert.equal(canje.get("code"), "c");
  const renov = p.cuerpoDeRenovacion({ refreshToken: "rt", clientId: "i", clientSecret: "s" });
  assert.equal(renov.get("grant_type"), "refresh_token");
  assert.equal(renov.get("refresh_token"), "rt");
});

test("tokensDeRespuesta calcula la caducidad absoluta y exige un token", () => {
  const t = p.tokensDeRespuesta({ access_token: "T", expires_in: 5184000, scope: "r_ads" }, 1000);
  assert.equal(t.accessToken, "T");
  assert.equal(t.refreshToken, null);
  assert.equal(t.expiraEn, 1000 + 5184000 * 1000);
  assert.throws(() => p.tokensDeRespuesta({}, 0), /token de acceso/);
});

test("fechaRest quita los ceros a la izquierda y rechaza formatos raros", () => {
  assert.equal(p.fechaRest("2026-10-05"), "(year:2026,month:10,day:5)");
  assert.equal(p.fechaRest("2026-01-09"), "(year:2026,month:1,day:9)");
  assert.throws(() => p.fechaRest("05/10/2026"), /Fecha inválida/);
});

test("la ruta de analytics deja los paréntesis literales y codifica solo el URN", () => {
  const ruta = p.rutaDeAnalytics({ cuentaId: "555950160", desde: "2026-10-01", hasta: "2026-10-05" });
  assert.match(ruta, /^\/rest\/adAnalytics\?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&/);
  assert.ok(ruta.includes("dateRange=(start:(year:2026,month:10,day:1),end:(year:2026,month:10,day:5))"));
  assert.ok(ruta.includes("accounts=List(urn%3Ali%3AsponsoredAccount%3A555950160)"));
  assert.ok(ruta.includes("fields=dateRange,pivotValues,impressions"));
});

test("un id que no es numérico no entra a la ruta (evita inyectar parámetros)", () => {
  assert.throws(() => p.rutaDeAnalytics({ cuentaId: "1&x=2", desde: "2026-10-01", hasta: "2026-10-02" }), /Id de cuenta inválido/);
  assert.throws(() => p.rutaDeCampanas("12/../9"), /Id de cuenta inválido/);
  assert.throws(() => p.rutaDeLeads("abc"), /Id de cuenta inválido/);
  assert.equal(p.rutaDeGrupos("77"), "/rest/adAccounts/77/adCampaignGroups?q=search&pageSize=100");
});

test("la ruta de leads usa el URN de la cuenta como dueño", () => {
  const ruta = p.rutaDeLeads("555900177");
  assert.ok(ruta.includes("owner=(sponsoredAccount:urn%3Ali%3AsponsoredAccount%3A555900177)"));
  assert.ok(ruta.includes("leadType=(leadType:SPONSORED)"));
});

test("filaDeAnalytics usa los nombres de Windsor y el resultado pasa por adaptarFilaLinkedin", () => {
  const fila = p.filaDeAnalytics(
    {
      dateRange: { start: { year: 2026, month: 10, day: 3 }, end: { year: 2026, month: 10, day: 3 } },
      pivotValues: ["urn:li:sponsoredCampaign:12345"],
      impressions: 1000, clicks: 40, costInLocalCurrency: "123.45", landingPageClicks: 30,
      totalEngagements: 55, oneClickLeads: 3, externalWebsiteConversions: 2, approximateMemberReach: 800,
    },
    { id: "555950160", nombre: "Colbun S.A", moneda: "CLP" },
  );
  assert.equal(fila.date, "2026-10-03");
  assert.equal(fila.campaign_id, "12345");
  assert.equal(fila.spend, 123.45);
  assert.equal(fila.landingpageclicks, 30);
  const adaptada = adaptarFilaLinkedin(fila);
  assert.equal(adaptada.actions_link_click, 30);
  assert.equal(adaptada.actions_lead, 3);
  assert.equal(adaptada.actions_post_engagement, 55);
  assert.equal(adaptada.reach, 800);
});

test("filaDeAnalytics no inventa datos cuando faltan campos", () => {
  const fila = p.filaDeAnalytics({}, { id: "1" });
  assert.equal(fila.date, null);
  assert.equal(fila.campaign_id, null);
  assert.equal(fila.spend, 0);
});

test("respuestaDeLead extrae las respuestas de texto y descarta las vacías", () => {
  const lead = p.respuestaDeLead({
    id: "L1", submittedAt: 1760000000000, versionedForm: "urn:li:versionedLeadGenForm:9", associatedEntity: "urn:li:sponsoredCampaign:5",
    formResponse: { answers: [
      { questionId: 11, answerDetails: { textQuestionAnswer: { answer: "Ana" } } },
      { questionId: 12, answerDetails: { textQuestionAnswer: { answer: "" } } },
      { questionId: 13, answerDetails: {} },
    ] },
  });
  assert.equal(lead.id, "L1");
  assert.equal(lead.formularioId, "9");
  assert.equal(lead.campanaId, "5");
  assert.deepEqual(lead.respuestas, [{ pregunta: "11", respuesta: "Ana" }]);
});

test("elementos devuelve vacío ante cualquier cuerpo inesperado", () => {
  assert.deepEqual(p.elementos(null), []);
  assert.deepEqual(p.elementos({ elements: "x" }), []);
  assert.deepEqual(p.elementos({ elements: [{ a: 1 }, 5, null] }), [{ a: 1 }]);
});

test("mensajeDeError distingue token vencido, permisos y versión retirada", () => {
  assert.match(p.mensajeDeError(null, 401), /reconectar/);
  assert.match(p.mensajeDeError({ message: "x" }, 403), /producto aprobado/);
  assert.match(p.mensajeDeError(null, 426), /LINKEDIN_API_VERSION/);
});
