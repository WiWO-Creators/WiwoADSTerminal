import assert from "node:assert/strict";
import test from "node:test";

import { BASE_MINIMA_CONTEO, SENTIDO_POR_COLUMNA, cambioDeColumna, variacionRelativa } from "../lib/comparacion.ts";

test("variación relativa: sin base honesta no compara", () => {
  assert.equal(variacionRelativa(120, 100), 0.2);
  assert.equal(variacionRelativa(80, 100), -0.2);
  assert.equal(variacionRelativa(50, 0), null);
  assert.equal(variacionRelativa(50, -3), null);
  assert.equal(variacionRelativa(null, 100), null);
  assert.equal(variacionRelativa(100, null), null);
  assert.equal(variacionRelativa(Number.NaN, 100), null);
});

test("más resultados es bueno; un costo más alto es malo", () => {
  assert.deepEqual(cambioDeColumna("resultados", 15, 10), { texto: "+50%", tono: "bueno", variacion: 0.5 });
  assert.equal(cambioDeColumna("costo", 150, 100).tono, "malo");
  assert.equal(cambioDeColumna("costo", 80, 100).tono, "bueno", "un costo que baja es bueno");
  assert.equal(cambioDeColumna("resultados", 6, 10).tono, "malo", "menos resultados es malo");
});

test("el gasto y la frecuencia son neutros: subir no es bueno ni malo por sí solo", () => {
  assert.equal(cambioDeColumna("invertido", 200, 100).tono, "neutro");
  assert.equal(cambioDeColumna("invertido", 50, 100).tono, "neutro");
  assert.equal(cambioDeColumna("frecuencia", 3, 2).tono, "neutro");
});

test("CTR, CPC y CPM siguen su sentido natural", () => {
  assert.equal(cambioDeColumna("ctr", 0.02, 0.01).tono, "bueno");
  assert.equal(cambioDeColumna("cpc", 200, 100).tono, "malo");
  assert.equal(cambioDeColumna("cpm", 50, 100).tono, "bueno");
});

test("un conteo con base chica no se compara: 1 → 3 no es +200%", () => {
  assert.equal(cambioDeColumna("resultados", 3, 1), null);
  assert.equal(cambioDeColumna("leads", 8, BASE_MINIMA_CONTEO - 1), null);
  assert.notEqual(cambioDeColumna("leads", 8, BASE_MINIMA_CONTEO), null);
  // Las que no son conteo sí se comparan con cualquier base positiva.
  assert.notEqual(cambioDeColumna("invertido", 3, 1), null);
});

test("los cambios ínfimos no se muestran", () => {
  assert.equal(cambioDeColumna("invertido", 100.2, 100), null);
  assert.equal(cambioDeColumna("invertido", 100, 100), null);
});

test("formato: signo explícito, entero, y tope para lo desorbitado", () => {
  assert.equal(cambioDeColumna("invertido", 133, 100).texto, "+33%");
  assert.equal(cambioDeColumna("invertido", 67, 100).texto, "-33%");
  assert.equal(cambioDeColumna("invertido", 1_000_000, 100).texto, "+999%+");
});

test("una columna desconocida se trata como neutra en vez de fallar", () => {
  assert.equal(cambioDeColumna("inventada", 20, 10).tono, "neutro");
});

test("toda columna con sentido declarado es 'mas', 'menos' o 'neutro'", () => {
  for (const [id, s] of Object.entries(SENTIDO_POR_COLUMNA)) {
    assert.ok(["mas", "menos", "neutro"].includes(s), id);
  }
});
