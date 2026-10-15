import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const m = await import("../lib/linkedin-anuncios-lectura-pura.ts");

const CREATIVO = {
  id: "urn:li:sponsoredCreative:1516135233",
  campaign: "urn:li:sponsoredCampaign:881631803",
  account: "urn:li:sponsoredAccount:555950160",
  intendedStatus: "ACTIVE",
  review: { status: "APPROVED" },
  name: "",
  content: { reference: "urn:li:ugcPost:7488586645366050816" },
};
const POST = { commentary: "Nuestros clientes están transformando su compromiso. 🌱\n\nConversemos → https://lnkd.in/x\n\n{hashtag|\\#|Sostenibilidad} {hashtag|\\#|Colbún}" };

test("las rutas codifican los URN como pide Rest.li", () => {
  assert.equal(m.rutaDeCreativos("555950160"), "/rest/adAccounts/555950160/creatives?q=criteria&pageSize=100");
  assert.match(m.rutaDeCreativos("555950160", "a+b"), /pageToken=a%2Bb$/);
  assert.equal(m.rutaDePublicaciones(["urn:li:ugcPost:1", "urn:li:ugcPost:2"]), "/rest/posts?ids=List(urn%3Ali%3AugcPost%3A1,urn%3Ali%3AugcPost%3A2)");
  assert.equal(
    m.rutaDeVistaPrevia("555950160", "urn:li:sponsoredCreative:9"),
    "/rest/adPreviews?q=creative&account=urn%3Ali%3AsponsoredAccount%3A555950160&creative=urn%3Ali%3AsponsoredCreative%3A9",
  );
});

test("la publicación se toma de la referencia, del anuncio de documento o de ninguna", () => {
  assert.equal(m.referenciaDeCreativo(CREATIVO), "urn:li:ugcPost:7488586645366050816");
  assert.equal(m.referenciaDeCreativo({ content: { documentAd: { reference: "urn:li:ugcPost:5" } } }), "urn:li:ugcPost:5");
  assert.equal(m.referenciaDeCreativo({ content: {} }), null);
});

test("los hashtags de LinkedIn se vuelven #Tema", () => {
  assert.match(m.textoDeComentario(POST.commentary), /#Sostenibilidad #Colbún$/);
  assert.equal(m.textoDeComentario("  "), null);
});

test("el anuncio toma nombre y texto de su publicación y cuelga de su campaña y su grupo", () => {
  const grupos = m.grupoPorCampana([{ id: 881631803, campaignGroup: "urn:li:sponsoredCampaignGroup:1218471953" }]);
  const d = m.detalleAnuncioNativoLinkedin(CREATIVO, POST, "555950160", grupos);
  assert.equal(d.id, "1516135233");
  assert.equal(d.conjuntoId, "881631803");
  assert.equal(d.campaignId, "1218471953");
  assert.match(d.nombre, /^Nuestros clientes están transformando/);
  assert.match(d.contenido.textoPrincipal, /#Colbún/);
  assert.equal(d.estado, "ACTIVE");
  assert.equal(d.edicionDeContenido.editable, false);
  assert.equal(d.publicacion.id, "urn:li:ugcPost:7488586645366050816");
});

test("sin publicación leída, el anuncio se llama por su número", () => {
  const d = m.detalleAnuncioNativoLinkedin(CREATIVO, null, "555950160", new Map());
  assert.equal(d.nombre, "1516135233");
  assert.equal(d.contenido.textoPrincipal, null);
});

test("el estado refleja el rechazo o la revisión", () => {
  assert.equal(m.estadoDeCreativo({ intendedStatus: "ACTIVE", review: { status: "REJECTED" } }), "DISAPPROVED");
  assert.equal(m.estadoDeCreativo({ intendedStatus: "ACTIVE", review: { status: "PENDING" } }), "PENDING_REVIEW");
  assert.equal(m.estadoDeCreativo({ intendedStatus: "PAUSED", review: { status: "APPROVED" } }), "PAUSED");
});

test("las vistas previas separan escritorio y celular y descartan lo que no es de LinkedIn", () => {
  const cuerpo = {
    elements: [
      { placement: { linkedin: { contentPresentationType: "DESKTOP_WEBSITE" } }, preview: "<iframe src='https://www.linkedin.com/ads/ad-preview/?d=A&amp;x=1' width='650' height='580'></iframe>" },
      { placement: { linkedin: { contentPresentationType: "MOBILE_WEBSITE" } }, preview: "<iframe src='https://www.linkedin.com/mwlite/ads/ad-preview?d=B' width='700' height='375'></iframe>" },
      { placement: { linkedin: { contentPresentationType: "DESKTOP_WEBSITE" } }, preview: "<iframe src='https://malo.example.com/x'></iframe>" },
    ],
  };
  const v = m.vistasPreviasDe(cuerpo);
  assert.equal(v.length, 2);
  assert.deepEqual(v[0], { formato: "escritorio", url: "https://www.linkedin.com/ads/ad-preview/?d=A&x=1", ancho: 650, alto: 580 });
  assert.equal(v[1].formato, "movil");
});
