import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { parsearSegmentos, coincideConSegmento, normalizarTexto } = await import("../lib/segmentos.ts");

const valor = parsearSegmentos(
  JSON.stringify([
    { id: "ebano", nombre: "Ébano", coincide: ["ebano"] },
    { id: "corotu", nombre: "Corotú", coincide: ["corotu"] },
    { id: "marea", nombre: "Marea", coincide: ["marea"] },
  ]),
);

test("normaliza tildes y mayúsculas", () => {
  assert.equal(normalizarTexto("COROTÚ Ébano"), "corotu ebano");
});

test("un segmento se reconoce por cuenta, campaña, conjunto o anuncio", () => {
  const corotu = valor.find((s) => s.id === "corotu");
  assert.equal(coincideConSegmento(["Grupo Valor #2", "[LDS] Corotú | Verano", null, null], corotu), true);
  assert.equal(coincideConSegmento(["Grupo Valor #2", "[LDS] Ébano", "Conjunto", "Anuncio"], corotu), false);
  assert.equal(coincideConSegmento([null, null, null, "Video MAREA 2026"], valor.find((s) => s.id === "marea")), true);
});

test("JSON roto o entradas inválidas no rompen: se descartan", () => {
  assert.deepEqual(parsearSegmentos("no es json"), []);
  assert.deepEqual(parsearSegmentos(null), []);
  assert.deepEqual(parsearSegmentos('{"a":1}'), []);
  const mezcla = parsearSegmentos(JSON.stringify([{ id: "x", nombre: "X", coincide: [] }, { id: "y", nombre: "Y", coincide: ["y"], paises: ["MX", 3] }, 5, null]));
  assert.equal(mezcla.length, 1);
  assert.deepEqual(mezcla[0].paises, ["MX"]);
});

const { perteneceASegmento } = await import("../lib/segmentos.ts");

test("un segmento puede ser una plataforma entera (Colbún Marketing = LinkedIn) o una cuenta", () => {
  const segs = parsearSegmentos(
    JSON.stringify([
      { id: "com", nombre: "Comunicaciones", plataformas: ["google", "meta"] },
      { id: "mkt", nombre: "Marketing", plataformas: ["linkedin"] },
      { id: "cta", nombre: "Una cuenta", cuentas: ["555900177"] },
    ]),
  );
  assert.equal(segs.length, 3);
  assert.equal(perteneceASegmento({ provider: "linkedin", textos: [] }, segs[1]), true);
  assert.equal(perteneceASegmento({ provider: "meta", textos: [] }, segs[1]), false);
  assert.equal(perteneceASegmento({ provider: "google", textos: [] }, segs[0]), true);
  assert.equal(perteneceASegmento({ provider: "linkedin", accountId: "555900177", textos: [] }, segs[2]), true);
  assert.equal(perteneceASegmento({ provider: "linkedin", accountId: "1", textos: ["nada"] }, segs[2]), false);
});

const { serializarSegmentos, conPresupuestos } = await import("../lib/segmentos.ts");

test("presupuesto por segmento: se lee, se pone, se quita y se guarda sin perder lo demás", () => {
  const base = parsearSegmentos(JSON.stringify([
    { id: "com", nombre: "Comunicaciones", plataformas: ["google", "meta"], presupuesto: { micros: 2_000_000_000, moneda: "clp" } },
    { id: "mkt", nombre: "Marketing", plataformas: ["linkedin"], presupuesto: { micros: -5, moneda: "CLP" } },
  ]));
  assert.deepEqual(base[0].presupuesto, { micros: 2_000_000_000, moneda: "CLP" });
  assert.equal(base[1].presupuesto, null); // negativo = sin presupuesto
  const nuevo = conPresupuestos(base, { mkt: 500_000_000, com: null }, "clp");
  assert.equal(nuevo[0].presupuesto, null);
  assert.deepEqual(nuevo[1].presupuesto, { micros: 500_000_000, moneda: "CLP" });
  const vuelta = parsearSegmentos(serializarSegmentos(nuevo));
  assert.deepEqual(vuelta[1].plataformas, ["linkedin"]);
  assert.deepEqual(vuelta[1].presupuesto, { micros: 500_000_000, moneda: "CLP" });
});
