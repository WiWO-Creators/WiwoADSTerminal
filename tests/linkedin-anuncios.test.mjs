import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const a = await import("../lib/linkedin-anuncios-pura.ts");

test("la publicación patrocinada es oculta (NONE), va ligada a la cuenta y firmada por la página", () => {
  const plan = a.planDePostPatrocinado({ cuentaId: "558457797", organizacion: "urn:li:organization:2641874", texto: "  Hola  ", nombre: "Mi anuncio" });
  assert.equal(plan.ruta, "/rest/posts");
  const c = plan.cuerpo;
  assert.equal(c.author, "urn:li:organization:2641874");
  assert.equal(c.commentary, "Hola");
  assert.equal(c.distribution.feedDistribution, "NONE");
  assert.equal(c.lifecycleState, "PUBLISHED");
  assert.deepEqual(c.adContext, { dscAdAccount: "urn:li:sponsoredAccount:558457797", dscStatus: "ACTIVE", dscName: "Mi anuncio" });
  assert.deepEqual(plan.esperado, { commentary: "Hola", "distribution.feedDistribution": "NONE" });
});

test("la publicación exige página, texto y un largo razonable", () => {
  const base = { cuentaId: "1", organizacion: "urn:li:organization:2", texto: "x" };
  assert.throws(() => a.planDePostPatrocinado({ ...base, organizacion: "urn:li:person:abc" }), /urn:li:organization/);
  assert.throws(() => a.planDePostPatrocinado({ ...base, texto: "   " }), /texto/);
  assert.throws(() => a.planDePostPatrocinado({ ...base, texto: "x".repeat(3001) }), /3000/);
  assert.throws(() => a.planDePostPatrocinado({ ...base, cuentaId: "1&x" }), /inválido/);
});

test("el creativo nace en borrador y apunta a la publicación", () => {
  const plan = a.planDeCreativo({ cuentaId: "558457797", campanaId: "901694774", postUrn: "urn:li:ugcPost:123" });
  assert.equal(plan.ruta, "/rest/adAccounts/558457797/creatives");
  assert.deepEqual(plan.cuerpo, { campaign: "urn:li:sponsoredCampaign:901694774", content: { reference: "urn:li:ugcPost:123" }, intendedStatus: "DRAFT" });
  assert.equal(plan.esperado["content.reference"], "urn:li:ugcPost:123");
});

test("el creativo rechaza publicaciones que no sean share o ugcPost, y ids no numéricos", () => {
  for (const malo of ["", "123", "urn:li:person:1", "urn:li:ugcPost:abc"]) {
    assert.throws(() => a.planDeCreativo({ cuentaId: "1", campanaId: "2", postUrn: malo }), /publicación/);
  }
  assert.throws(() => a.planDeCreativo({ cuentaId: "1", campanaId: "2/3", postUrn: "urn:li:share:1" }), /inválido/);
});

test("la ruta de verificación codifica el URN", () => {
  assert.equal(a.rutaParaVerificarAnuncio("post", "1", "urn:li:ugcPost:9"), "/rest/posts/urn%3Ali%3AugcPost%3A9?viewContext=AUTHOR");
  assert.equal(a.rutaParaVerificarAnuncio("creativo", "55", "urn:li:sponsoredCreative:7"), "/rest/adAccounts/55/creatives/urn%3Ali%3AsponsoredCreative%3A7");
});
