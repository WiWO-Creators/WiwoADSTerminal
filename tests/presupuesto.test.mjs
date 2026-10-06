import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { calcularPresupuesto, diasDelMes } = await import("../lib/presupuesto.ts");
const M = 1_000_000;
const dia = (d) => new Date(Date.UTC(2026, 8, d, 12)); // septiembre de 2026: 30 días

test("días del mes, con bisiestos", () => {
  assert.equal(diasDelMes(dia(1)), 30);
  assert.equal(diasDelMes(new Date(Date.UTC(2028, 1, 10))), 29);
  assert.equal(diasDelMes(new Date(Date.UTC(2026, 1, 10))), 28);
});

test("sin presupuesto definido no hay resumen: no se inventa un tope", () => {
  assert.equal(calcularPresupuesto(null, 500 * M, dia(10)), null);
  assert.equal(calcularPresupuesto(0, 500 * M, dia(10)), null);
  assert.equal(calcularPresupuesto(undefined, 1, dia(10)), null);
});

test("ritmo parejo: a mitad de mes se gastó la mitad", () => {
  const r = calcularPresupuesto(3_000 * M, 1_500 * M, dia(15));
  assert.equal(r.estado, "en_ritmo");
  assert.equal(r.restanteMicros, 1_500 * M);
  assert.equal(Math.round(r.proyeccionMicros / M), 3_000);
  assert.equal(r.diasRestantes, 15);
  assert.equal(Math.round(r.disponibleDiarioMicros / M), 100);
});

test("gasto muy adelantado: proyecta pasarse", () => {
  const r = calcularPresupuesto(3_000 * M, 2_000 * M, dia(10));
  assert.equal(r.estado, "adelantado");
  assert.ok(r.proyeccionMicros > 3_000 * M);
});

test("gasto atrasado solo se marca con días suficientes", () => {
  assert.equal(calcularPresupuesto(3_000 * M, 100 * M, dia(3)).estado, "en_ritmo");
  assert.equal(calcularPresupuesto(3_000 * M, 500 * M, dia(20)).estado, "atrasado");
});

test("casi agotado y excedido", () => {
  assert.equal(calcularPresupuesto(1_000 * M, 990 * M, dia(28)).estado, "agotado");
  const e = calcularPresupuesto(1_000 * M, 1_200 * M, dia(25));
  assert.equal(e.estado, "excedido");
  assert.equal(e.restanteMicros, -200 * M);
  assert.equal(e.disponibleDiarioMicros, 0);
});

test("último día del mes no divide por cero", () => {
  const r = calcularPresupuesto(3_000 * M, 2_000 * M, dia(30));
  assert.ok(Number.isFinite(r.disponibleDiarioMicros));
  assert.equal(r.diasRestantes, 0);
});
