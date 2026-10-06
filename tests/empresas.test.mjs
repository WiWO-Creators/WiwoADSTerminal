import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { agruparPorEmpresa, esEmpresa } = await import("../lib/empresas.ts");

const C = (id, empresa, archivado = false) => ({ id, empresa, archivado });

test("los clientes se agrupan MGC, WIWO y sin empresa; los archivados no se ofrecen", () => {
  const g = agruparPorEmpresa([C("a", "wiwo"), C("b", "mgc"), C("c", null), C("d", "mgc"), C("x", "mgc", true)]);
  assert.deepEqual(g.map((x) => x.etiqueta), ["MGC", "WIWO", "Sin empresa"]);
  assert.deepEqual(g[0].clientes.map((c) => c.id), ["b", "d"]);
  assert.ok(!g.flatMap((x) => x.clientes).some((c) => c.id === "x"));
});

test("con una sola empresa no se muestran títulos", () => {
  const g = agruparPorEmpresa([C("a", "mgc"), C("b", "mgc")]);
  assert.equal(g.length, 1);
  assert.equal(g[0].etiqueta, null);
  assert.equal(esEmpresa("mgc"), true);
  assert.equal(esEmpresa("otra"), false);
});
