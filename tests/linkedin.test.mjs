import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { adaptarFilaLinkedin } = await import("../lib/linkedin.ts");

test("el grupo de campañas de LinkedIn pasa a ser la campaña y su «campaign» el conjunto", () => {
  const f = adaptarFilaLinkedin({
    account_id: "555950160", campaign_group_name: "[AE] Colbún S.A. | Video Views", campaign_group_id: "G1", campaign_group_status: "ACTIVE",
    campaign: "Posts Generales | Chile", campaign_id: "C9", campaign_status: "COMPLETED", spend: 485000, impressions: 190562, clicks: 923, engagements: 1200,
  });
  assert.equal(f.campaign, "[AE] Colbún S.A. | Video Views");
  assert.equal(f.campaign_id, "G1");
  assert.equal(f.adset_name, "Posts Generales | Chile");
  assert.equal(f.adset_id, "C9");
  assert.equal(f.campaign_status, "ACTIVE");
  assert.equal(f.actions_post_engagement, 1200);
  assert.equal(f.actions_link_click, 923); // sin landingpageclicks: se usan los clics
  assert.equal(f.spend, 485000);
});

test("sin grupo de campañas, la fila queda como vino (la «campaign» sigue siendo la campaña)", () => {
  const f = adaptarFilaLinkedin({ account_id: "1", campaign: "Solo campaña", campaign_id: "5", spend: 10 });
  assert.equal(f.campaign, "Solo campaña");
  assert.equal(f.adset_name, undefined);
});

test("anuncio, leads y conversiones se traducen sin pisar claves existentes", () => {
  const f = adaptarFilaLinkedin({
    creative_id: "urn:li:sponsoredCreative:7", sponsored_creative_content_title: "Título", oneclickleads: 4, externalwebsiteconversions: 2,
    landingpageclicks: 30, clicks: 90, actions_lead: 99,
  });
  assert.equal(f.ad_id, "urn:li:sponsoredCreative:7");
  assert.equal(f.ad_name, "Título");
  assert.equal(f.actions_lead, 99); // ya existía: no se pisa
  assert.equal(f.conversions, 2);
  assert.equal(f.actions_link_click, 30);
});

test("una cadena vacía no cuenta como dato: el anuncio cae al id del creativo", () => {
  const f = adaptarFilaLinkedin({ creative_id: "99", sponsored_creative_content_title: "", landingpageclicks: "", clicks: 7 });
  assert.equal(f.ad_name, "99");
  assert.equal(f.actions_link_click, 7);
});
