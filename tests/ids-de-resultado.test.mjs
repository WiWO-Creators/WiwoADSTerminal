import assert from "node:assert/strict";
import test from "node:test";

import { idDeResultado, idEnTextoLibre } from "../lib/ids-de-resultado.ts";

// Textos reales devueltos por las acciones de creación de Windsor.
const CASOS = [
  ["campaña de Google", "Search campaign '[TRF] [GO] X' (id 24271920233) created successfully with target_spend bidding", "24271920233"],
  ["grupo de anuncios de Google", "Ad group 'P · principal' (id 200046612869, type SEARCH_STANDARD) created successfully in campaign 24271920233 with status PAUSED", "200046612869"],
  ["campaña de Meta", "Campaign created successfully with id 52528989290637. Use enable_campaign to activate it", "52528989290637"],
];

for (const [nombre, texto, esperado] of CASOS) {
  test(`reconoce el id de la ${nombre}`, () => {
    assert.equal(idEnTextoLibre(texto), esperado);
    assert.equal(idDeResultado({ result: texto }, ["campaign_id", "id"]), esperado);
  });
}

test("el id de la campaña padre no se confunde con el del grupo", () => {
  assert.notEqual(idEnTextoLibre(CASOS[1][1]), "24271920233");
});

test("un campo estructurado gana sobre el texto", () => {
  assert.equal(idDeResultado({ campaign_id: "111", result: CASOS[0][1] }, ["campaign_id"]), "111");
});

test("sin id devuelve null en vez de inventar uno", () => {
  assert.equal(idDeResultado({ result: "Something failed" }, ["id"]), null);
});

test("boost_post: el id del anuncio es el que sigue a «as ad», no el del conjunto", async () => {
  const { idDeResultado } = await import("../lib/ids-de-resultado.ts");
  const raw = { result: "Post 286255651767382_914886358336034 boosted successfully as ad 52532282766237 in ad set 52532282752237. Use enable_ad to activate it or pause_ad to pause it." };
  assert.equal(idDeResultado(raw, ["ad_id", "adId", "id"]), "52532282766237");
});
