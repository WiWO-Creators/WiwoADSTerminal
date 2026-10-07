import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { etiquetaDeCampo, etiquetasDeCambios, resumenDeCambios, importanciaDe, recortar, resumenDeEntrada } = await import("../lib/auditoria-pura.ts");

test("cada campo cambiado cae en su etiqueta: presupuesto, títulos, contenido, estado…", () => {
  assert.equal(etiquetaDeCampo("presupuesto"), "presupuesto");
  assert.equal(etiquetaDeCampo("limiteGasto"), "presupuesto");
  assert.equal(etiquetaDeCampo("nombre"), "titulo");
  assert.equal(etiquetaDeCampo("titulares"), "titulo");
  assert.equal(etiquetaDeCampo("imagenUrl"), "contenido");
  assert.equal(etiquetaDeCampo("textoPrincipal"), "contenido");
  assert.equal(etiquetaDeCampo("estado"), "estado");
  assert.equal(etiquetaDeCampo("edadMin"), "segmentacion");
  assert.equal(etiquetaDeCampo("cualquierOtra"), "otros");
  assert.deepEqual(etiquetasDeCambios([{ campo: "presupuesto", etiqueta: "x", antes: "", despues: "" }, { campo: "nombre", etiqueta: "x", antes: "", despues: "" }, { campo: "presupuesto", etiqueta: "x", antes: "", despues: "" }]), ["presupuesto", "titulo"]);
});

test("el resumen de cambios dice antes y después y corta cuando son muchos", () => {
  const c = (campo, antes, despues) => ({ campo, etiqueta: campo, antes, despues });
  assert.equal(resumenDeCambios([c("presupuesto", "$10.000", "$8.000")]), "presupuesto: $10.000 → $8.000");
  assert.match(resumenDeCambios([c("a", "1", "2"), c("b", "1", "2"), c("c", "1", "2"), c("d", "1", "2")]), /y 1 más$/);
  assert.equal(resumenDeCambios([]), "sin cambios visibles");
});

test("es importante: tocar presupuesto, rechazar, fallar, cambios del equipo y descartar una decisión", () => {
  const base = { categoria: "cambio", accion: "aplicado", resultado: "ok", etiquetas: [] };
  assert.equal(importanciaDe(base), "normal");
  assert.equal(importanciaDe({ ...base, etiquetas: ["presupuesto"] }), "alta");
  assert.equal(importanciaDe({ ...base, resultado: "error" }), "alta");
  assert.equal(importanciaDe({ ...base, categoria: "solicitud", accion: "rechazada", resultado: "rechazado" }), "alta");
  assert.equal(importanciaDe({ ...base, categoria: "equipo" }), "alta");
  assert.equal(importanciaDe({ ...base, categoria: "decision", accion: "descartada" }), "alta");
  assert.equal(importanciaDe({ ...base, categoria: "decision", accion: "aprobada" }), "normal");
});

test("los textos largos se cortan y las entradas del bot no llevan secretos", () => {
  assert.equal(recortar("  hola   mundo  "), "hola mundo");
  assert.equal(recortar("x".repeat(700), 600).length, 601);
  const r = resumenDeEntrada({ cliente_id: "anker", token: "abc", api_key: "zzz", links: ["a", "b"], texto: "y".repeat(500), objeto: { a: 1 } });
  assert.equal("token" in r, false);
  assert.equal("api_key" in r, false);
  assert.equal(r.cliente_id, "anker");
  assert.deepEqual(r.links, ["a", "b"]);
  assert.equal(r.texto.length, 201);
});
