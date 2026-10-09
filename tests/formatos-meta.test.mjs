import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { formatosDeSegmentacion, META_SURFACES, posicionesInvalidas, POSICIONES_META } = await import("../lib/formatos-meta-pura.ts");

test("los formatos se leen de las posiciones de cada red, sin repetir y en orden fijo", () => {
  assert.deepEqual(formatosDeSegmentacion({ facebook_positions: ["feed", "story"], instagram_positions: ["stream", "reels"] }), ["feed", "historias", "reels"]);
  assert.deepEqual(formatosDeSegmentacion({ instagram_positions: ["reels"] }), ["reels"]);
  assert.deepEqual(formatosDeSegmentacion({ facebook_positions: ["facebook_reels"] }), ["reels"]);
});

test("sin posiciones, o con posiciones que no modelamos, no hay formatos", () => {
  assert.deepEqual(formatosDeSegmentacion(null), []);
  assert.deepEqual(formatosDeSegmentacion({ publisher_platforms: ["facebook"] }), []);
  assert.deepEqual(formatosDeSegmentacion({ instagram_positions: ["explore"] }), []);
});

test("cada formato tiene su valor por red", () => {
  assert.equal(META_SURFACES.feed.instagram, "stream");
  assert.equal(META_SURFACES.reels.facebook, "facebook_reels");
});

test("las ubicaciones se validan contra la lista de cada red", () => {
  assert.deepEqual(posicionesInvalidas("instagram", ["stream", "reels", "inventada"]), ["inventada"]);
  assert.deepEqual(posicionesInvalidas("facebook", ["feed", "marketplace", "facebook_reels"]), []);
  assert.ok(POSICIONES_META.audience_network.length > 0);
});
