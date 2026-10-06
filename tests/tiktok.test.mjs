import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { adaptarFilaTiktok, estadoDeTiktok } = await import("../lib/tiktok.ts");

test("una fila de TikTok se traduce al vocabulario común sin perder lo original", () => {
  const f = adaptarFilaTiktok({
    campaign_name: "[AE] Truecaller | TT | Alcance",
    campaign_id: "1",
    ad_group_name: "Grupo 1",
    ad_group_id: "2",
    ad_id: "3",
    ad_name: "Anuncio 1",
    campaign_operation_status: "ENABLE",
    ad_operation_status: "DISABLE",
    likes: 10,
    comments: 2,
    shares: 3,
    follows: 5,
    clicks: 7,
    results: 40,
  });
  assert.equal(f.campaign, "[AE] Truecaller | TT | Alcance");
  assert.equal(f.adset_name, "Grupo 1");
  assert.equal(f.campaign_status, "ACTIVE");
  assert.equal(f.effective_status, "PAUSED");
  assert.equal(f.actions_post_engagement, 20);
  assert.equal(f.actions_link_click, 7);
  assert.equal(f.conversions, 40);
  assert.equal(f.campaign_name, "[AE] Truecaller | TT | Alcance"); // la clave original sigue
});

test("sin interacciones el dato queda vacío (no cero) y no pisa lo que ya hay", () => {
  const f = adaptarFilaTiktok({ campaign_name: "X", conversions: 9, results: 4 });
  assert.equal(f.actions_post_engagement, undefined);
  assert.equal(f.conversions, 9); // no pisa
});

test("estados de TikTok al vocabulario común", () => {
  assert.equal(estadoDeTiktok("ENABLE"), "ACTIVE");
  assert.equal(estadoDeTiktok("DISABLE"), "PAUSED");
  assert.equal(estadoDeTiktok("DELETE"), "REMOVED");
  assert.equal(estadoDeTiktok(null), null);
});
