import assert from "node:assert/strict";
import test from "node:test";

import { leerCsv, numeroDe, perfilarCsv } from "../lib/asistente-csv.ts";

test("numeroDe entiende formatos latinos y anglosajones", () => {
  assert.equal(numeroDe("1.234,56"), 1234.56);
  assert.equal(numeroDe("1,234.56"), 1234.56);
  assert.equal(numeroDe("$ 12.500"), 12500);
  assert.equal(numeroDe("3,5%"), 3.5);
  assert.equal(numeroDe("1,234"), 1234);
  assert.equal(numeroDe("3.5"), 3.5);
  assert.equal(numeroDe("-"), null);
  assert.equal(numeroDe("Campaña 2"), null);
});

test("leerCsv respeta comillas, separador ; y saltos de línea dentro de un campo", () => {
  const filas = leerCsv('a;b\n"x;y";"línea1\nlínea2"\n');
  assert.deepEqual(filas, [
    ["a", "b"],
    ["x;y", "línea1\nlínea2"],
  ]);
});

test("perfilarCsv suma en código y rankea por gasto", () => {
  const csv = "Campaña,Gasto,Clics\nA,1000,10\nB,3000,5\nC,2000,20\n";
  const perfil = perfilarCsv("demo.csv", csv);
  assert.equal(perfil.filas, 3);
  assert.match(perfil.texto, /Gasto: suma 6\.000/);
  assert.match(perfil.texto, /Clics: suma 35/);
  // B gastó más: tiene que abrir el ranking.
  const ranking = perfil.texto.split('Las 10 filas con más "Gasto":\n')[1];
  assert.ok(ranking.startsWith("- B | 3000 | 5"));
});

test("perfilarCsv no trata una columna de texto como numérica", () => {
  const perfil = perfilarCsv("t.csv", "Nombre,Valor\nuno,1\ndos,2\ntres,x\n");
  assert.doesNotMatch(perfil.texto, /- Nombre:/);
});

test("perfilarCsv aguanta un archivo vacío", () => {
  assert.match(perfilarCsv("v.csv", "").texto, /vacío/);
});
