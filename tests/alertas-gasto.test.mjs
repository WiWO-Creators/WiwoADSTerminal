import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { alertasDeLimiteDeGasto } = await import("../lib/alertas-gasto.ts");

const cliente = { id: "c1", name: "Colbún", monthlyBudgetMicros: 1_000_000_000, monthlyBudgetCurrency: "CLP" };
const hoy = new Date("2026-10-15T12:00:00Z");
const con = (gasto) => new Map([["c1", { CLP: gasto * 1_000_000 }]]);

test("excedido es crítica, agotado alta, adelantado media y en ritmo no avisa", () => {
  assert.equal(alertasDeLimiteDeGasto([cliente], con(1100), hoy)[0].severidad, "critica");
  assert.equal(alertasDeLimiteDeGasto([cliente], con(990), hoy)[0].severidad, "alta");
  assert.equal(alertasDeLimiteDeGasto([cliente], con(700), hoy)[0].severidad, "media");
  assert.equal(alertasDeLimiteDeGasto([cliente], con(480), hoy).length, 0);
});

test("sin presupuesto o en otra moneda no hay límite que vigilar", () => {
  assert.equal(alertasDeLimiteDeGasto([{ ...cliente, monthlyBudgetMicros: null }], con(5000), hoy).length, 0);
  assert.equal(alertasDeLimiteDeGasto([cliente], new Map([["c1", { USD: 9e12 }]]), hoy).length, 0);
});
