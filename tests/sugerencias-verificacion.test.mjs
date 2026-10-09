import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { sigueVigente, soloVigentes } = await import("../lib/sugerencias-verificacion-pura.ts");

const vivas = new Map([["111", new Map([["c1", { nombre: "A", estado: "ACTIVE" }], ["c2", { nombre: "B", estado: "PAUSED" }]])]]);
const d = (entityId, tipo, extra = {}) => ({ provider: "meta", accountId: "act_111", entityId, entityLevel: "campana", accion: { tipo }, ...extra });

test("una decisión sobre una campaña que no existe en Meta no se muestra", () => {
  assert.equal(sigueVigente(d("fantasma", "revisar"), vivas), false);
});

test("pausar, presupuesto o revisar piden la campaña activa; reactivar, que esté apagada", () => {
  assert.equal(sigueVigente(d("c1", "pausar"), vivas), true);
  assert.equal(sigueVigente(d("c2", "pausar"), vivas), false);
  assert.equal(sigueVigente(d("c2", "reactivar"), vivas), true);
  assert.equal(sigueVigente(d("c1", "reactivar"), vivas), false);
});

test("lo que no es una campaña de Meta, o una cuenta que no se pudo leer, se conserva", () => {
  assert.equal(sigueVigente(d("x", "revisar", { provider: "google" }), vivas), true);
  assert.equal(sigueVigente(d("x", "revisar", { accountId: "999" }), vivas), true);
  assert.equal(sigueVigente({ ...d("x", "revisar"), entityLevel: null }, vivas), true);
  assert.equal(soloVigentes([d("c1", "pausar"), d("zzz", "pausar")], vivas).length, 1);
});

test("«activa pero no entrega» se descarta si Meta muestra que sí entregó; sin dato, se conserva", () => {
  const v = new Map([["111", new Map([["c1", { nombre: "A", estado: "ACTIVE", conEntrega: true }], ["c2", { nombre: "B", estado: "ACTIVE", conEntrega: false }], ["c3", { nombre: "C", estado: "ACTIVE" }]])]]);
  assert.equal(sigueVigente(d("c1", "revisar", { rule: "sin_actividad" }), v), false);
  assert.equal(sigueVigente(d("c2", "revisar", { rule: "sin_actividad" }), v), true);
  assert.equal(sigueVigente(d("c3", "revisar", { rule: "sin_actividad" }), v), true);
  assert.equal(sigueVigente(d("c1", "revisar", { rule: "cpa_empeora" }), v), true);
});

test("no se propone reactivar una campaña cuyo período ya terminó", () => {
  const v = new Map([["111", new Map([["c1", { nombre: "A", estado: "PAUSED", finalizada: true }], ["c2", { nombre: "B", estado: "PAUSED", finalizada: false }]])]]);
  assert.equal(sigueVigente(d("c1", "reactivar"), v), false);
  assert.equal(sigueVigente(d("c2", "reactivar"), v), true);
});
