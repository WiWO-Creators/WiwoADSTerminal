import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { gruposDeRecursosGaql } = await import("../lib/detalle-entidad.ts");

test("los grupos de recursos de Performance Max traen sus textos, imágenes y videos", () => {
  const grupos = [{ assetGroup: { id: "10", name: "Ébano #3", status: "ENABLED", finalUrls: ["https://x.cl"], path1: "casas" }, campaign: { id: "99" } }];
  const recursos = [
    { assetGroup: { id: "10" }, assetGroupAsset: { fieldType: "HEADLINE", status: "ENABLED" }, asset: { textAsset: { text: "Tu casa" } } },
    { assetGroup: { id: "10" }, assetGroupAsset: { fieldType: "MARKETING_IMAGE", status: "ENABLED" }, asset: { imageAsset: { fullSize: { url: "https://i.jpg" } } } },
    { assetGroup: { id: "10" }, assetGroupAsset: { fieldType: "YOUTUBE_VIDEO" }, asset: { youtubeVideoAsset: { youtubeVideoId: "abc" } } },
    { assetGroup: { id: "11" }, assetGroupAsset: { fieldType: "HEADLINE" }, asset: { textAsset: { text: "de otro grupo" } } },
  ];
  const [g, ...resto] = gruposDeRecursosGaql(grupos, recursos);
  assert.equal(resto.length, 0);
  assert.equal(g.campaignId, "99");
  assert.deepEqual(g.urlsFinales, ["https://x.cl"]);
  assert.equal(g.recursos.length, 3);
  assert.equal(g.recursos[0].texto, "Tu casa");
  assert.equal(g.recursos[1].imagenUrl, "https://i.jpg");
  assert.equal(g.recursos[2].videoYoutube, "abc");
});

test("un grupo sin recursos queda con la lista vacía y las filas sin ids se ignoran", () => {
  assert.deepEqual(gruposDeRecursosGaql([{ assetGroup: { id: "1" }, campaign: { id: "2" } }, { assetGroup: {} }], [])[0].recursos, []);
  assert.equal(gruposDeRecursosGaql([{ assetGroup: {} }], []).length, 0);
});
