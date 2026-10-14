import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { altoDePieza, medidasDeVista } = await import("../lib/vista-previa-meta-pura.ts");

test("la pieza del feed se acota entre 1,91:1 y 4:5; sin proporción conocida se asume la más alta", () => {
  assert.equal(altoDePieza(16 / 9), 180);
  assert.equal(altoDePieza(1), 320);
  assert.equal(altoDePieza(4 / 5), 400);
  assert.equal(altoDePieza(9 / 16), 400, "una pieza más vertical que 4:5 se recorta a 4:5");
  assert.equal(altoDePieza(3), 168, "una más apaisada que 1,91:1 se recorta a 1,91:1");
  assert.equal(altoDePieza(null), 400);
});

test("el feed de Facebook mide lo que mide Meta: una pieza vertical con botón, unos 650 px (medido: 648)", () => {
  const m = medidasDeVista("MOBILE_FEED_STANDARD", 4 / 5, true);
  assert.equal(m.ancho, 335);
  assert.ok(Math.abs(m.alto - 648) <= 10, `alto ${m.alto}`);
  assert.ok(medidasDeVista("MOBILE_FEED_STANDARD", 16 / 9, false).alto < m.alto, "una pieza apaisada sin botón es más baja");
});

test("el feed de Instagram esconde la barra de Meta solo cuando el contenido pasa de 567 px", () => {
  const alta = medidasDeVista("INSTAGRAM_STANDARD", 4 / 5, true);
  assert.equal(alta.alto, 567);
  assert.equal(alta.recorteDerecho, 16);
  const baja = medidasDeVista("INSTAGRAM_STANDARD", 16 / 9, true);
  assert.ok(baja.alto < 567);
  assert.equal(baja.recorteDerecho, 0);
});

test("historias y reels tienen tamaño fijo, sin blanco ni cortes", () => {
  assert.deepEqual(medidasDeVista("INSTAGRAM_STORY", 1, false), { ancho: 320, alto: 567, recorteDerecho: 0 });
  assert.deepEqual(medidasDeVista("INSTAGRAM_REELS", null, true), { ancho: 320, alto: 625, recorteDerecho: 0 });
});
