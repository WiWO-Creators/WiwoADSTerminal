import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { distribuirGasto, concentracion } = await import("../lib/distribucion.ts");
const M = 1_000_000;

const camp = (over = {}) => ({
  provider: "meta", name: "C", currency: "CLP", spendMicros: 100 * M, clicks: 10, impressions: 1000,
  conActividad: true, objetivo: "LDS", ...over,
});

test("sin gasto no hay distribución: no se muestra una tarjeta vacía", () => {
  assert.equal(distribuirGasto([]), null);
  assert.equal(distribuirGasto([camp({ spendMicros: 0 })]), null);
  assert.equal(distribuirGasto([camp({ conActividad: false })]), null);
});

test("reparte por plataforma, objetivo y campaña, de mayor a menor", () => {
  const d = distribuirGasto([
    camp({ name: "A", provider: "meta", spendMicros: 600 * M, objetivo: "AE" }),
    camp({ name: "B", provider: "google", spendMicros: 300 * M, objetivo: "LDS" }),
    camp({ name: "C", provider: "google", spendMicros: 100 * M, objetivo: null }),
  ]);
  assert.equal(d.moneda, "CLP");
  assert.equal(d.totalMicros, 1000 * M);
  assert.deepEqual(d.porPlataforma.map((s) => [s.clave, Math.round(s.fraccion * 100)]), [["meta", 60], ["google", 40]]);
  assert.deepEqual(d.porObjetivo.map((s) => s.clave), ["AE", "LDS", "sin_sigla"]);
  assert.deepEqual(d.topCampanas.map((c) => c.nombre), ["A", "B", "C"]);
  assert.equal(concentracion(d), 0.6);
});

test("las monedas no se mezclan: manda la de mayor gasto y se avisa de las otras", () => {
  const d = distribuirGasto([
    camp({ currency: "CLP", spendMicros: 900 * M }),
    camp({ currency: "USD", spendMicros: 5000 * M }),
  ]);
  assert.equal(d.moneda, "USD");
  assert.equal(d.totalMicros, 5000 * M);
  assert.deepEqual(d.otrasMonedas, ["CLP"]);
});

test("el top se limita y las fracciones suman 1 por segmento", () => {
  const muchas = Array.from({ length: 8 }, (_, i) => camp({ name: `c${i}`, spendMicros: (i + 1) * 10 * M }));
  const d = distribuirGasto(muchas, 3);
  assert.equal(d.topCampanas.length, 3);
  const suma = d.porPlataforma.reduce((s, x) => s + x.fraccion, 0);
  assert.ok(Math.abs(suma - 1) < 1e-9);
});
