import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { problemaDeMemoria, parecido, notaRepetida, bloqueDeMemoria } = await import("../lib/asistente-memoria-pura.ts");

test("se rechazan correos, teléfonos, claves y notas muy cortas o largas", () => {
  assert.equal(problemaDeMemoria("Colbún prefiere un tono corporativo y sin promesas de ahorro."), null);
  assert.match(problemaDeMemoria("Escríbele a juan@colbun.cl cuando haya cambios"), /correos/);
  assert.match(problemaDeMemoria("Su teléfono es +56 9 1234 5678 para todo"), /teléfonos/);
  assert.match(problemaDeMemoria("La contraseña de la cuenta es abc123 siempre"), /contraseñas/);
  assert.match(problemaDeMemoria("Usa esta clave: sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), /clave|token/);
  assert.match(problemaDeMemoria("hola"), /corta/);
  assert.match(problemaDeMemoria("x ".repeat(300)), /400/);
});

test("lo mismo con otras palabras no se guarda dos veces", () => {
  assert.ok(parecido("Colbún prefiere tono corporativo y sin promesas de ahorro", "Colbún prefiere un tono corporativo sin promesas de ahorro") > 0.8);
  const existentes = [{ id: "a", scope: "colbun", texto: "Colbún prefiere tono corporativo y sin promesas de ahorro", autor: "x", actualizada: 1, usos: 0 }];
  assert.equal(notaRepetida(existentes, "Colbún prefiere un tono corporativo sin promesas de ahorro").id, "a");
  assert.equal(notaRepetida(existentes, "El presupuesto de octubre se reparte mitad y mitad"), null);
});

test("el bloque del prompt pone lo del equipo primero, con ids cortos, y respeta el tope", () => {
  const n = (id, texto, usos = 0, t = 1) => ({ id: id.padEnd(36, "0"), scope: "x", texto, autor: "a", actualizada: t, usos });
  const b = bloqueDeMemoria([n("e1", "Siempre dejar todo pausado")], [n("c1", "Público B2B de empresas medianas", 5), n("c2", "Landing con formulario corto", 1)], "Colbún");
  assert.match(b, /^Notas del equipo/);
  assert.match(b, /\[e1000000\] Siempre dejar todo pausado/);
  assert.ok(b.indexOf("c1000000") < b.indexOf("c2000000")); // la más usada primero
  assert.match(b, /Notas sobre Colbún/);
  const enorme = Array.from({ length: 80 }, (_, i) => n(`z${i}`, "y".repeat(300), 0, i));
  assert.ok(bloqueDeMemoria(enorme, [], null).length <= 3600);
});
