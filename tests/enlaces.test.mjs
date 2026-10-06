import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { enlacesDeAlerta, enlacesDeSugerencia, enlaceDeAnalytics, enlaceDeCampana } = await import("../lib/enlaces.ts");

test("alerta sin GTM: abre Tag Manager y nombra el contenedor", () => {
  const e = enlacesDeAlerta("sin-gtm-colbun", { gtmContainerId: "GTM-ABC123" });
  assert.equal(e.length, 1);
  assert.match(e[0].etiqueta, /GTM-ABC123/);
  assert.match(e[0].url, /^https:\/\/tagmanager\.google\.com/);
});

test("alerta de campaña sin actividad: lleva a la campaña en su plataforma", () => {
  const meta = enlacesDeAlerta("sin-actividad-meta:act_2006:1202", null);
  assert.match(meta[0].url, /act=2006&selected_campaign_ids=1202/);
  const google = enlacesDeAlerta("desperdicio-google:423-204-0466:555", null);
  assert.match(google[0].url, /campaignId=555/);
  assert.deepEqual(enlacesDeAlerta("otra-cosa", null), []);
});

test("sugerencias de medición → Analytics (si hay propiedad) y Tag Manager", () => {
  const e = enlacesDeSugerencia("medicion_x", { ga4PropertyId: "properties/123456", gtmContainerId: null }, { provider: null, accountId: null, entityId: null });
  assert.equal(e.length, 2);
  assert.match(e[0].url, /#\/p123456\/admin\/events/);
  assert.equal(enlacesDeSugerencia("medicion_x", {}, { provider: null, accountId: null, entityId: null }).length, 1);
});

test("sugerencia de presupuesto sin campaña no lleva enlaces; sin ids tampoco se inventan", () => {
  assert.deepEqual(enlacesDeSugerencia("presupuesto_ritmo", null, { provider: null, accountId: null, entityId: null }), []);
  assert.equal(enlaceDeAnalytics(""), null);
  assert.equal(enlaceDeCampana("tiktok", "1", "2"), null);
});
