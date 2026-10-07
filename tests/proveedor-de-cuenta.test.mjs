import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { inferirProveedorDeCuenta } = await import("../lib/proveedor-de-cuenta-pura.ts");

test("el proveedor de una cuenta se deduce de la forma de su identificador", () => {
  assert.equal(inferirProveedorDeCuenta("985-043-3091"), "google");
  assert.equal(inferirProveedorDeCuenta("9850433091"), "google");
  assert.equal(inferirProveedorDeCuenta("2006250736667023"), "meta");
  assert.equal(inferirProveedorDeCuenta("act_1494126595605892"), "meta");
  assert.equal(inferirProveedorDeCuenta("7606087454329372673"), "tiktok");
  assert.equal(inferirProveedorDeCuenta("512345678"), "linkedin");
  assert.equal(inferirProveedorDeCuenta("cuenta-rara"), null);
  assert.equal(inferirProveedorDeCuenta("123"), null);
});
