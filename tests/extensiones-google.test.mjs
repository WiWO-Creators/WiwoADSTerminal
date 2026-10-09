import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { validarCambiosExtensiones, armarMutacionExtensiones, extensionesActualesDeFilas } = await import("../lib/google-ads-nativo.ts");

const enlace = (texto, url = "https://x.cl/a", d1 = "", d2 = "") => ({ texto, url, descripcion1: d1, descripcion2: d2 });

test("los límites de enlaces de sitio y textos destacados se validan antes de llamar", () => {
  assert.deepEqual(validarCambiosExtensiones({ sitelinks: [enlace("Contacto")], destacados: ["Envío gratis"] }), []);
  assert.ok(validarCambiosExtensiones({ sitelinks: [enlace("x".repeat(26))] }).length > 0);
  assert.ok(validarCambiosExtensiones({ sitelinks: [enlace("Uno", "ftp://x")] }).length > 0);
  assert.ok(validarCambiosExtensiones({ sitelinks: [enlace("Uno", "https://x.cl", "solo una")] }).some((m) => m.includes("dos descripciones")));
  assert.ok(validarCambiosExtensiones({ sitelinks: [enlace("Uno"), enlace("uno")] }).some((m) => m.includes("repetidos")));
  assert.ok(validarCambiosExtensiones({ destacados: ["x".repeat(26)] }).length > 0);
  assert.ok(validarCambiosExtensiones({ destacados: Array.from({ length: 21 }, (_, i) => `t${i}`) }).length > 0);
});

test("lo nuevo se crea y se enlaza, lo que sobra se desenlaza y lo igual no se toca", () => {
  const actuales = [
    { enlace: "customers/1/campaignAssets/9~1~SITELINK", tipo: "SITELINK", texto: "Contacto", url: "https://x.cl/a", descripcion1: "", descripcion2: "" },
    { enlace: "customers/1/campaignAssets/9~2~SITELINK", tipo: "SITELINK", texto: "Viejo", url: "https://x.cl/v", descripcion1: "", descripcion2: "" },
    { enlace: "customers/1/campaignAssets/9~3~CALLOUT", tipo: "CALLOUT", texto: "Envío gratis", url: "", descripcion1: "", descripcion2: "" },
  ];
  const { cuerpo, resumen } = armarMutacionExtensiones("123-456-7890", "9", actuales, {
    sitelinks: [enlace("Contacto"), enlace("Nuevo", "https://x.cl/n", "d uno", "d dos")],
    destacados: ["envío GRATIS", "Garantía"],
  });
  const ops = cuerpo.mutateOperations;
  const creados = ops.filter((o) => o.assetOperation).map((o) => o.assetOperation.create);
  assert.equal(creados.length, 2);
  assert.equal(creados[0].sitelinkAsset.linkText, "Nuevo");
  assert.equal(creados[0].sitelinkAsset.description1, "d uno");
  assert.equal(creados[1].calloutAsset.calloutText, "Garantía");
  assert.deepEqual(ops.filter((o) => o.campaignAssetOperation?.remove).map((o) => o.campaignAssetOperation.remove), ["customers/1/campaignAssets/9~2~SITELINK"]);
  assert.equal(ops.filter((o) => o.campaignAssetOperation?.create).length, 2);
  assert.deepEqual(resumen, ["enlaces de sitio: +1 −1", "textos destacados: +1 −0"]);
});

test("sin diferencias no hay operaciones, y un campo ausente no se toca", () => {
  const actuales = [{ enlace: "e", tipo: "SITELINK", texto: "Contacto", url: "https://x.cl/a", descripcion1: "", descripcion2: "" }];
  assert.equal(armarMutacionExtensiones("1", "9", actuales, { sitelinks: [enlace("contacto")] }).cuerpo.mutateOperations.length, 0);
  assert.equal(armarMutacionExtensiones("1", "9", actuales, { destacados: [] }).cuerpo.mutateOperations.length, 0);
});

test("las filas de Google se leen por campaña", () => {
  const filas = [
    { campaign: { id: "9" }, campaignAsset: { resourceName: "r1", fieldType: "SITELINK" }, asset: { finalUrls: ["https://x.cl"], sitelinkAsset: { linkText: "Hola", description1: "a", description2: "b" } } },
    { campaign: { id: "9" }, campaignAsset: { resourceName: "r2", fieldType: "CALLOUT" }, asset: { calloutAsset: { calloutText: "Oferta" } } },
    { campaign: { id: "10" }, campaignAsset: { resourceName: "r3", fieldType: "CALLOUT" }, asset: { calloutAsset: { calloutText: "Otra campaña" } } },
  ];
  const ext = extensionesActualesDeFilas(filas, "9");
  assert.equal(ext.length, 2);
  assert.equal(ext[0].url, "https://x.cl");
  assert.equal(ext[1].texto, "Oferta");
});
