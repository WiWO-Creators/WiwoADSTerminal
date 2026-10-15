import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const m = await import("../lib/linkedin-publicaciones-pura.ts");
const { textoDeComentario } = await import("../lib/linkedin-anuncios-lectura-pura.ts");
const { planDeCreativo } = await import("../lib/linkedin-anuncios-pura.ts");

const VIDEO = { content: { media: { id: "urn:li:video:D4D" } }, commentary: "Un video" };
const DOC = { content: { media: { id: "urn:li:document:C5" } }, commentary: "Un documento" };
const ARTICULO = { content: { article: { source: "https://x.cl", title: "T" } }, commentary: "Un artículo" };

test("cada tipo de publicación apunta al formato de campaña que LinkedIn exige", () => {
  assert.equal(m.formatoDePublicacion(VIDEO).formatoDeCampana, "SINGLE_VIDEO");
  assert.equal(m.formatoDePublicacion(DOC).formatoDeCampana, "SPONSORED_UPDATE_NATIVE_DOCUMENT");
  assert.equal(m.formatoDePublicacion(DOC).contenido, "documentAd");
  assert.equal(m.formatoDePublicacion(ARTICULO).formatoDeCampana, "STANDARD_UPDATE");
  assert.equal(m.formatoDePublicacion({ commentary: "solo texto" }).tipo, "texto");
  assert.equal(m.formatoDePublicacion({ content: { multiImage: {} } }).formatoDeCampana, null);
});

test("una campaña de otro formato rechaza la publicación y dice por qué", () => {
  const v = m.compatibleConCampana(m.formatoDePublicacion(VIDEO), "STANDARD_UPDATE");
  assert.equal(v.ok, false);
  assert.match(v.motivo, /video/i);
  assert.equal(m.compatibleConCampana(m.formatoDePublicacion(VIDEO), "SINGLE_VIDEO").ok, true);
  assert.equal(m.compatibleConCampana(m.formatoDePublicacion(VIDEO), null).ok, true);
  assert.equal(m.compatibleConCampana(m.formatoDePublicacion({ content: { poll: {} } }), "STANDARD_UPDATE").ok, false);
});

test("el enlace pegado se reconoce, también codificado", () => {
  assert.equal(m.urnDePublicacionPegada("urn:li:ugcPost:7488586645366050816"), "urn:li:ugcPost:7488586645366050816");
  assert.equal(m.urnDePublicacionPegada("https://www.linkedin.com/feed/update/urn:li:ugcPost:7488586645366050816/"), "urn:li:ugcPost:7488586645366050816");
  assert.equal(m.urnDePublicacionPegada("https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A123/"), "urn:li:share:123");
  assert.equal(m.urnDePublicacionPegada("https://lnkd.in/eVkxtUcw"), null);
  assert.equal(m.urnDePublicacionPegada(""), null);
});

test("las candidatas ponen primero las compatibles y cuentan sus usos", () => {
  const posts = new Map([
    ["urn:li:ugcPost:1", VIDEO],
    ["urn:li:ugcPost:2", DOC],
  ]);
  const lista = m.candidatasDePublicacion(["urn:li:ugcPost:2", "urn:li:ugcPost:1", "urn:li:ugcPost:1", "urn:li:ugcPost:9"], posts, "SINGLE_VIDEO", textoDeComentario);
  assert.equal(lista.length, 2, "la publicación que no se pudo leer no aparece");
  assert.equal(lista[0].urn, "urn:li:ugcPost:1");
  assert.equal(lista[0].compatible, true);
  assert.equal(lista[0].anunciosQueLaUsan, 2);
  assert.equal(lista[1].compatible, false);
  assert.ok(lista[1].motivo);
});

test("el anuncio de un documento guarda la publicación en documentAd y el estado se elige", () => {
  const doc = planDeCreativo({ cuentaId: "1", campanaId: "2", postUrn: "urn:li:ugcPost:5", contenido: "documentAd", estado: "ACTIVE" });
  assert.deepEqual(doc.cuerpo.content, { documentAd: { reference: "urn:li:ugcPost:5" } });
  assert.equal(doc.cuerpo.intendedStatus, "ACTIVE");
  const normal = planDeCreativo({ cuentaId: "1", campanaId: "2", postUrn: "urn:li:ugcPost:5" });
  assert.deepEqual(normal.cuerpo.content, { reference: "urn:li:ugcPost:5" });
  assert.equal(normal.cuerpo.intendedStatus, "DRAFT");
});
