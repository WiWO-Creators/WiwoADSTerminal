import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { propiedadesDeGa4, problemaDeGa4, guardarPropiedadesGa4 } = await import("../lib/ga4.ts");
const { enlaceDeAnalytics } = await import("../lib/enlaces.ts");

test("una o varias propiedades de GA4, sin repetidos ni espacios", () => {
  assert.deepEqual(propiedadesDeGa4("307451372"), ["307451372"]);
  assert.deepEqual(propiedadesDeGa4(" 435206026, 435204611;435206026\n442886097 "), ["435206026", "435204611", "442886097"]);
  assert.deepEqual(propiedadesDeGa4(null), []);
  assert.equal(guardarPropiedadesGa4("435206026 , 435204611"), "435206026,435204611");
  assert.equal(guardarPropiedadesGa4("  "), null);
});

test("un ID que no es de GA4 se rechaza con el valor a la vista", () => {
  assert.equal(problemaDeGa4("307451372, 435204611"), null);
  assert.match(problemaDeGa4("307451372, UA-123"), /UA-123/);
  assert.match(problemaDeGa4(Array.from({ length: 13 }, (_, i) => String(100000 + i)).join(",")), /Máximo/);
});

test("el enlace a Analytics abre la primera propiedad cuando hay varias", () => {
  assert.match(enlaceDeAnalytics("435206026,435204611").url, /#\/p435206026\//);
});
