import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { estadoDeTiktok, RUTA_DE_RETORNO_TIKTOK, LO_QUE_HABILITA_TIKTOK } = await import("../lib/tiktok-estado-pura.ts");

test("sin App ID ni Secret, TikTok no está configurado y dice qué falta (solo nombres)", () => {
  const e = estadoDeTiktok({});
  assert.equal(e.configurado, false);
  assert.deepEqual(e.falta, ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET"]);
  assert.equal(e.lectura, "windsor");
  assert.equal(e.conexionDirecta, false);
});

test("con las dos claves queda configurado; con una sola, falta la otra", () => {
  assert.equal(estadoDeTiktok({ TIKTOK_APP_ID: "123", TIKTOK_APP_SECRET: "abc" }).configurado, true);
  assert.deepEqual(estadoDeTiktok({ TIKTOK_APP_ID: "123", TIKTOK_APP_SECRET: "  " }).falta, ["TIKTOK_APP_SECRET"]);
});

test("la URL de retorno es la que se declaró ante TikTok", () => {
  assert.equal(RUTA_DE_RETORNO_TIKTOK, "/api/integrations/tiktok/callback");
  assert.ok(LO_QUE_HABILITA_TIKTOK.length >= 4);
});

const { urlDeAutorizacionTiktok, codigoDeRetornoTiktok, anunciantesDeRespuesta, idsDeAnunciantes } = await import("../lib/tiktok-estado-pura.ts");

test("la URL de autorización lleva la app, el estado y la URL de retorno", () => {
  const u = new URL(urlDeAutorizacionTiktok({ appId: "123", state: "abc", redirectUri: "https://ads.wiwo.me/api/integrations/tiktok/callback" }));
  assert.equal(u.origin + u.pathname, "https://business-api.tiktok.com/portal/auth");
  assert.equal(u.searchParams.get("app_id"), "123");
  assert.equal(u.searchParams.get("state"), "abc");
  assert.equal(u.searchParams.get("redirect_uri"), "https://ads.wiwo.me/api/integrations/tiktok/callback");
});

test("el código de retorno llega como auth_code o como code", () => {
  assert.equal(codigoDeRetornoTiktok(new URLSearchParams("auth_code=A1&state=s")), "A1");
  assert.equal(codigoDeRetornoTiktok(new URLSearchParams("code=B2")), "B2");
  assert.equal(codigoDeRetornoTiktok(new URLSearchParams("state=s")), "");
});

test("los anunciantes se leen sin repetir y con lo que falte en null", () => {
  const lista = anunciantesDeRespuesta({ list: [{ advertiser_id: 1, name: " Truecaller ", currency: "USD", status: "STATUS_ENABLE" }, { advertiser_id: "1" }, { advertiser_id: 2 }, { name: "sin id" }] });
  assert.equal(lista.length, 2);
  assert.deepEqual(lista[0], { id: "1", nombre: "Truecaller", moneda: "USD", estado: "STATUS_ENABLE" });
  assert.deepEqual(lista[1], { id: "2", nombre: null, moneda: null, estado: null });
  assert.deepEqual(anunciantesDeRespuesta(null), []);
});

test("los ids de anunciantes salen de ambas respuestas de TikTok y descartan lo que no es un número", () => {
  assert.deepEqual(idsDeAnunciantes({ advertiser_ids: ["7602721778298355728", "x"] }), ["7602721778298355728"]);
  assert.deepEqual(idsDeAnunciantes({ list: [{ advertiser_id: "7606087454329372673" }, { advertiser_id: "7606087454329372673" }] }), ["7606087454329372673"]);
  assert.deepEqual(idsDeAnunciantes(undefined), []);
});
