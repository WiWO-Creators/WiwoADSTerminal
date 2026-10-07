import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { validarContenido, creativoDeImagen, creativoDeCarrusel, colocacionesDeConjunto, tituloDeContenido } = await import("../lib/anuncios-formato-pura.ts");

const base = { mensaje: "Conoce la nueva línea", enlace: "https://www.ejemplo.cl/linea" };
const img = (n) => ({ url: `https://cdn.ejemplo.cl/${n}.jpg`, titulo: `Tarjeta ${n}` });

test("un carrusel válido lleva entre 2 y 10 tarjetas con título y https", () => {
  assert.deepEqual(validarContenido({ ...base, formato: "carrusel", imagenes: [img(1), img(2), img(3)] }), []);
  assert.match(validarContenido({ ...base, formato: "carrusel", imagenes: [img(1)] }).join(" "), /entre 2 y 10/);
  assert.match(validarContenido({ ...base, formato: "carrusel", imagenes: Array.from({ length: 11 }, (_, i) => img(i)) }).join(" "), /entre 2 y 10/);
  assert.match(validarContenido({ ...base, formato: "carrusel", imagenes: [img(1), { url: "https://cdn.ejemplo.cl/2.jpg", titulo: "" }] }).join(" "), /tarjeta 2 necesita un título/);
});

test("se rechazan imágenes y destinos que no son https, textos vacíos y botones desconocidos", () => {
  const errores = validarContenido({ formato: "imagenes", mensaje: " ", enlace: "http://ejemplo.cl", cta: "INVENTADO", imagenes: [{ url: "http://x.cl/a.jpg" }] }).join(" | ");
  assert.match(errores, /texto principal/);
  assert.match(errores, /destino debe ser un enlace https/);
  assert.match(errores, /no está permitido/);
  assert.match(errores, /imagen 1 debe ser una dirección https/);
});

test("varias imágenes: cada una es un anuncio con su propio enlace si lo trae", () => {
  const destinos = { paginaId: "123", instagramUserId: "456" };
  const c = creativoDeImagen(base, { url: "https://cdn.ejemplo.cl/a.jpg", titulo: "Hola", enlace: "https://www.ejemplo.cl/otra" }, destinos, "Anuncio A");
  const ld = c.object_story_spec.link_data;
  assert.equal(c.object_story_spec.page_id, "123");
  assert.equal(c.object_story_spec.instagram_user_id, "456");
  assert.equal(ld.link, "https://www.ejemplo.cl/otra");
  assert.equal(ld.picture, "https://cdn.ejemplo.cl/a.jpg");
  assert.equal(ld.name, "Hola");
  assert.deepEqual(ld.call_to_action, { type: "LEARN_MORE", value: { link: "https://www.ejemplo.cl/otra" } });
});

test("el carrusel arma una tarjeta por imagen, con el destino general si no traen el suyo", () => {
  const c = creativoDeCarrusel({ ...base, imagenes: [img(1), { ...img(2), enlace: "https://www.ejemplo.cl/dos", descripcion: "detalle" }] }, { paginaId: "123" }, "Carrusel");
  const hijos = c.object_story_spec.link_data.child_attachments;
  assert.equal(hijos.length, 2);
  assert.equal(hijos[0].link, "https://www.ejemplo.cl/linea");
  assert.equal(hijos[1].link, "https://www.ejemplo.cl/dos");
  assert.equal(hijos[1].description, "detalle");
  assert.equal("instagram_user_id" in c.object_story_spec, false);
});

test("sin botón, la tarjeta no lleva enlace de botón", () => {
  const c = creativoDeImagen({ ...base, cta: "NO_BUTTON" }, { url: "https://cdn.ejemplo.cl/a.jpg" }, { paginaId: "1" }, "x");
  assert.deepEqual(c.object_story_spec.link_data.call_to_action, { type: "NO_BUTTON" });
});

test("ubicaciones: sin plataformas elegidas son automáticas; con posiciones explícitas solo cubre lo elegido", () => {
  assert.deepEqual(colocacionesDeConjunto(null), { automaticas: true, feed: true, stories: true, reels: true });
  const soloFeed = colocacionesDeConjunto({ publisher_platforms: ["instagram"], instagram_positions: ["stream"] });
  assert.deepEqual(soloFeed, { automaticas: false, feed: true, stories: false, reels: false });
  const conStories = colocacionesDeConjunto({ publisher_platforms: ["facebook", "instagram"], facebook_positions: ["feed", "story"], instagram_positions: ["stream", "story", "reels"] });
  assert.equal(conStories.stories, true);
  assert.equal(conStories.reels, true);
  assert.equal(colocacionesDeConjunto({ publisher_platforms: ["instagram"] }).stories, true, "plataforma sin posiciones: usa todas las suyas");
});

test("el título dice qué se está subiendo", () => {
  assert.equal(tituloDeContenido({ formato: "carrusel", imagenes: [img(1), img(2), img(3)] }), "un carrusel de 3 imágenes");
  assert.equal(tituloDeContenido({ formato: "imagenes", imagenes: [img(1)] }), "un anuncio de imagen");
  assert.equal(tituloDeContenido({ formato: "imagenes", imagenes: [img(1), img(2)] }), "2 anuncios de imagen");
});
