import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { validarCambiosGrupoDeRecursos, armarMutacionGrupoDeRecursos } = await import("../lib/google-ads-nativo.ts");

const tres = ["Uno", "Dos", "Tres"];

test("los límites de Google se validan antes de llamar", () => {
  assert.deepEqual(validarCambiosGrupoDeRecursos({ titulares: tres }), []);
  assert.ok(validarCambiosGrupoDeRecursos({ titulares: ["a", "b"] }).length > 0);
  assert.ok(validarCambiosGrupoDeRecursos({ titulares: ["x".repeat(31), "b", "c"] }).length > 0);
  assert.ok(validarCambiosGrupoDeRecursos({ titulares: ["a", "A", "c"] }).some((m) => m.includes("repetidos")));
  assert.ok(validarCambiosGrupoDeRecursos({ descripciones: ["x".repeat(80), "y".repeat(80)] }).some((m) => m.includes("60")));
  assert.ok(validarCambiosGrupoDeRecursos({ urlsFinales: ["ftp://x"] }).length > 0);
  assert.ok(validarCambiosGrupoDeRecursos({ urlsFinales: ["https://a.cl", "https://b.cl"] }).length > 0);
  assert.ok(validarCambiosGrupoDeRecursos({ path1: "x".repeat(16) }).length > 0);
});

test("un texto nuevo se crea y se enlaza; el que sobra se desenlaza, sin tocar los que quedan", () => {
  const actuales = [
    { enlace: "customers/1/assetGroupAssets/9~1~HEADLINE", campo: "HEADLINE", texto: "Uno" },
    { enlace: "customers/1/assetGroupAssets/9~2~HEADLINE", campo: "HEADLINE", texto: "Dos" },
    { enlace: "customers/1/assetGroupAssets/9~3~HEADLINE", campo: "HEADLINE", texto: "Tres" },
  ];
  const { cuerpo, ruta } = armarMutacionGrupoDeRecursos("123-456-7890", "9", actuales, { titulares: ["Uno", "Dos", "Cuatro"] });
  assert.equal(ruta, "customers/1234567890/googleAds:mutate");
  const ops = cuerpo.mutateOperations;
  assert.equal(ops.filter((o) => o.assetOperation).length, 1);
  assert.equal(ops.find((o) => o.assetOperation).assetOperation.create.textAsset.text, "Cuatro");
  assert.equal(ops.filter((o) => o.assetGroupAssetOperation?.create).length, 1);
  assert.deepEqual(ops.filter((o) => o.assetGroupAssetOperation?.remove).map((o) => o.assetGroupAssetOperation.remove), ["customers/1/assetGroupAssets/9~3~HEADLINE"]);
  // crea antes de quitar, así nunca queda por debajo del mínimo
  assert.ok(ops.findIndex((o) => o.assetOperation) < ops.findIndex((o) => o.assetGroupAssetOperation?.remove));
});

test("en el máximo se quita antes de crear; las URL y rutas van en una actualización con máscara", () => {
  const actuales = Array.from({ length: 15 }, (_, i) => ({ enlace: `e${i}`, campo: "HEADLINE", texto: `T${i}` }));
  const nuevos = [...actuales.slice(1).map((a) => a.texto), "Nuevo"];
  const { cuerpo } = armarMutacionGrupoDeRecursos("1", "9", actuales, { titulares: nuevos, urlsFinales: ["https://a.cl"], path1: "casas" });
  const ops = cuerpo.mutateOperations;
  assert.ok(ops.findIndex((o) => o.assetGroupAssetOperation?.remove) < ops.findIndex((o) => o.assetOperation));
  const act = ops.find((o) => o.assetGroupOperation).assetGroupOperation;
  assert.equal(act.updateMask, "final_urls,path1");
  assert.deepEqual(act.update.finalUrls, ["https://a.cl"]);
});

test("sin diferencias no hay operaciones", () => {
  const actuales = [{ enlace: "e", campo: "HEADLINE", texto: "Uno" }];
  const { cuerpo } = armarMutacionGrupoDeRecursos("1", "9", actuales, { titulares: ["uno"] });
  assert.equal(cuerpo.mutateOperations.length, 0);
});
