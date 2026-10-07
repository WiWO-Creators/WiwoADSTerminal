import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { esFalloDeWindsor, llamadaDeMetaParaAccion } = await import("../lib/respaldo-meta-pura.ts");

test("solo un fallo del propio Windsor dispara el respaldo, nunca un rechazo de Meta", () => {
  assert.equal(esFalloDeWindsor("Windsor respondió 500"), true);
  assert.equal(esFalloDeWindsor("Windsor respondió 503"), true);
  assert.equal(esFalloDeWindsor("Meta API error: El intervalo de atribución no es válido"), false);
  assert.equal(esFalloDeWindsor("Windsor respondió 400"), false);
  assert.equal(esFalloDeWindsor(null), false);
});

test("update_adset se traduce con extra_params aplanado", () => {
  const l = llamadaDeMetaParaAccion("update_adset", { adset_id: "123", name: "Nuevo", extra_params: { pacing_type: ["standard"], adset_schedule: [] } });
  assert.equal(l.id, "123");
  assert.deepEqual(l.params, { name: "Nuevo", pacing_type: ["standard"], adset_schedule: [] });
});

test("presupuesto y estado se traducen a los campos de Meta", () => {
  assert.deepEqual(llamadaDeMetaParaAccion("set_adset_budget", { adset_id: "9", budget_type: "daily", amount: 20000 }), { id: "9", params: { daily_budget: 20000 } });
  assert.deepEqual(llamadaDeMetaParaAccion("set_campaign_budget", { campaign_id: "9", budget_type: "lifetime", amount: 500000 }), { id: "9", params: { lifetime_budget: 500000 } });
  assert.deepEqual(llamadaDeMetaParaAccion("pause_ad", { ad_id: "7" }), { id: "7", params: { status: "PAUSED" } });
  assert.deepEqual(llamadaDeMetaParaAccion("enable_adset", { adset_id: "7" }), { id: "7", params: { status: "ACTIVE" } });
});

test("lo que no se puede traducir con seguridad no se reintenta", () => {
  assert.equal(llamadaDeMetaParaAccion("create_ad", { adset_id: "1", name: "x" }), null);
  assert.equal(llamadaDeMetaParaAccion("update_adset", { adset_id: "abc", name: "x" }), null);
  assert.equal(llamadaDeMetaParaAccion("update_adset", { adset_id: "1" }), null);
  assert.equal(llamadaDeMetaParaAccion("set_adset_budget", { adset_id: "1", budget_type: "daily", amount: 12.5 }), null);
});
