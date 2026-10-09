import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { limitesDeGoogle, nombreDeTipoGoogle, seccionesDeGoogle } = await import("../lib/google-secciones-pura.ts");

test("Búsqueda tiene redes, extensiones, rotación, palabras clave y contenido propio", () => {
  assert.deepEqual([...seccionesDeGoogle("SEARCH", "campana")].sort(), ["extensiones", "redes", "rotacion"]);
  assert.deepEqual([...seccionesDeGoogle("SEARCH", "conjunto")].sort(), ["cpcMaximo", "palabrasClave"]);
  assert.deepEqual([...seccionesDeGoogle("SEARCH", "anuncio")], ["contenidoRsa"]);
});

test("Performance Max edita grupos de recursos desde la campaña y no tiene CPC ni palabras clave", () => {
  assert.deepEqual([...seccionesDeGoogle("PERFORMANCE_MAX", "campana")], ["gruposDeRecursos"]);
  assert.equal(seccionesDeGoogle("PERFORMANCE_MAX", "conjunto").size, 0);
});

test("Demand Gen y Video no ofrecen campos de Búsqueda y avisan lo que falta", () => {
  for (const tipo of ["DEMAND_GEN", "VIDEO"]) {
    assert.equal(seccionesDeGoogle(tipo, "campana").size, 0);
    assert.equal(seccionesDeGoogle(tipo, "anuncio").size, 0);
    assert.match(limitesDeGoogle(tipo, "anuncio"), /no está añadida al sistema/);
    assert.match(limitesDeGoogle(tipo, "conjunto"), /no está añadida al sistema/);
  }
});

test("Display conserva rotación y CPC máximo del grupo; Búsqueda no tiene límite que avisar", () => {
  assert.ok(seccionesDeGoogle("DISPLAY", "campana").has("rotacion"));
  assert.ok(seccionesDeGoogle("DISPLAY", "conjunto").has("cpcMaximo"));
  assert.equal(limitesDeGoogle("SEARCH", "anuncio"), null);
  assert.equal(limitesDeGoogle("SEARCH", "conjunto"), null);
});

test("el nombre legible del tipo", () => {
  assert.equal(nombreDeTipoGoogle("DEMAND_GEN"), "Generación de demanda");
  assert.equal(nombreDeTipoGoogle(null), "de otro tipo");
});
