import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { ACCION, valoresDeParametros } = await import("../lib/acciones-estado.ts");

test("LinkedIn: campaña = grupo de campañas, conjunto = campaign, anuncio = creative", () => {
  assert.equal(ACCION.linkedin.campana.pause, "pause_campaign_group");
  assert.equal(ACCION.linkedin.conjunto.enable, "enable_campaign");
  assert.equal(ACCION.linkedin.anuncio.pause, "pause_creative");
  const v = valoresDeParametros("linkedin", { campaignId: "G1", adsetId: "C2", adId: "R3" });
  assert.deepEqual(
    [ACCION.linkedin.campana, ACCION.linkedin.conjunto, ACCION.linkedin.anuncio].map((r) => v[r.params[0]]),
    ["G1", "C2", "R3"],
  );
});

test("Google y Meta siguen igual", () => {
  const v = valoresDeParametros("meta", { campaignId: "A", adsetId: "B", adId: "C" });
  assert.equal(v[ACCION.meta.conjunto.params[0]], "B");
  assert.equal(ACCION.google.anuncio.params.join(","), "ad_group_id,ad_id");
  assert.equal(valoresDeParametros("google", { adsetId: "G", adId: "X" }).ad_group_id, "G");
});
