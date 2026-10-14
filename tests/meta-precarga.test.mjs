import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { descripcionDeCreativo, ventanaDeAtribucion } = await import("../lib/meta-precarga-pura.ts");

test("la descripción sale del enlace, del video o del anuncio con varios textos", () => {
  assert.equal(descripcionDeCreativo({ object_story_spec: { link_data: { description: " Envío gratis " } } }), "Envío gratis");
  assert.equal(descripcionDeCreativo({ object_story_spec: { video_data: { link_description: "Mira el video" } } }), "Mira el video");
  assert.equal(descripcionDeCreativo({ asset_feed_spec: { descriptions: [{ text: "" }, { text: "Variante A" }] } }), "Variante A");
  assert.equal(descripcionDeCreativo({ object_story_spec: { link_data: {} } }), null);
  assert.equal(descripcionDeCreativo(null), null);
});

test("la ventana de atribución se traduce a las del editor", () => {
  assert.equal(ventanaDeAtribucion(undefined), "default");
  assert.equal(ventanaDeAtribucion([]), "default");
  assert.equal(ventanaDeAtribucion([{ event_type: "CLICK_THROUGH", window_days: 1 }]), "click_1d");
  assert.equal(ventanaDeAtribucion([{ event_type: "CLICK_THROUGH", window_days: 7 }]), "click_7d");
  assert.equal(ventanaDeAtribucion([{ event_type: "VIEW_THROUGH", window_days: 1 }, { event_type: "CLICK_THROUGH", window_days: 1 }]), "click_1d_view_1d");
  assert.equal(ventanaDeAtribucion([{ event_type: "CLICK_THROUGH", window_days: 7 }, { event_type: "VIEW_THROUGH", window_days: 1 }]), "default");
  assert.equal(ventanaDeAtribucion([{ event_type: "ENGAGED_VIDEO_VIEW", window_days: 1 }]), null);
});
