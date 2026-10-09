import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { estadoDeTablero, resumenDeTablero } = await import("../lib/tablero-salud-pura.ts");

const C = (o) => ({ provider: "meta", status: "ACTIVE", accountKey: "a1", accountName: "Cuenta 1", currency: "USD", spendMicros: 10_000_000, objetivo: "trafico", ...o });

test("el estado se agrupa en activa, pausada u otra", () => {
  assert.equal(estadoDeTablero("ENABLED"), "activa");
  assert.equal(estadoDeTablero("paused"), "pausada");
  assert.equal(estadoDeTablero("WITH_ISSUES"), "otra");
  assert.equal(estadoDeTablero(null), "otra");
});

test("el resumen reparte por plataforma, estado y cuenta sin mezclar monedas", () => {
  const r = resumenDeTablero([
    C({}),
    C({ status: "PAUSED", spendMicros: 5_000_000 }),
    C({ provider: "google", accountKey: "g1", accountName: "Google 1", currency: "CLP", spendMicros: 900_000_000, objetivo: null }),
  ]);
  assert.equal(r.total, 3);
  assert.deepEqual(r.porPlataforma, [{ provider: "meta", cantidad: 2 }, { provider: "google", cantidad: 1 }]);
  assert.deepEqual(r.porEstado, [{ estado: "activa", cantidad: 2 }, { estado: "pausada", cantidad: 1 }]);
  assert.deepEqual(r.porCuenta.map((c) => [c.id, c.moneda, c.invertido]), [["g1", "CLP", 900], ["a1", "USD", 15]]);
  assert.equal(r.sinObjetivo, 1);
});

test("sin campañas el resumen queda vacío", () => {
  const r = resumenDeTablero([]);
  assert.equal(r.total, 0);
  assert.deepEqual(r.porEstado, []);
});
