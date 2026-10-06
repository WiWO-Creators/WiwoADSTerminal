import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { interpretarReglaMeta, buscarReglaPorNombre } = await import("../lib/reglas-meta-pura.ts");
const { rangoDeRegla, textoDeRegla } = await import("../lib/reglas-automaticas-pura.ts");

const highquality = {
  id: "1",
  name: "highquality",
  status: "ENABLED",
  evaluation_spec: {
    filters: [
      { field: "spent", value: 1000, operator: "GREATER_THAN" },
      { field: "entity_type", value: "AD", operator: "EQUAL" },
      { field: "ad.id", value: ["1", "2", "3"], operator: "IN" },
      { field: "time_preset", value: "MAXIMUM", operator: "EQUAL" },
    ],
  },
  execution_spec: { execution_type: "PAUSE" },
};

test("highquality se traduce: gasto de 10 USD en total pausa el anuncio", () => {
  const r = interpretarReglaMeta(highquality, "USD");
  assert.deepEqual(r.definicion, { metrica: "gasto", operador: ">=", umbral: 10, periodo: "total", accion: "pausar" });
  assert.equal(r.motivo, null);
  assert.equal(r.entidadesCubiertas, 3);
});

test("en CLP el importe no se divide y una moneda desconocida no se traduce", () => {
  assert.equal(interpretarReglaMeta(highquality, "CLP").definicion.umbral, 1000);
  assert.equal(interpretarReglaMeta(highquality, "XYZ").definicion, null);
});

test("una regla que no vigila anuncios no se puede asignar a uno", () => {
  const r = interpretarReglaMeta({ ...highquality, evaluation_spec: { filters: highquality.evaluation_spec.filters.map((f) => (f.field === "entity_type" ? { ...f, value: "CAMPAIGN" } : f)) } }, "USD");
  assert.match(r.motivo, /no vigila anuncios/);
});

test("acciones o periodos desconocidos no se copian", () => {
  assert.equal(interpretarReglaMeta({ ...highquality, execution_spec: { execution_type: "CHANGE_BUDGET" } }, "USD").definicion, null);
});

test("busca la regla por nombre sin importar mayúsculas ni espacios", () => {
  const lista = [{ nombre: "highquality" }, { nombre: "30USD KOL" }];
  assert.equal(buscarReglaPorNombre(lista, "High Quality").unica.nombre, "highquality");
  assert.equal(buscarReglaPorNombre(lista, "xyz").unica, null);
});

test("el periodo total mira los últimos 180 días y se dice en el texto", () => {
  assert.equal(rangoDeRegla("hoy", new Date()), "hoy");
  assert.match(rangoDeRegla("total", new Date("2026-10-06T00:00:00Z")), /^2026-04-10\.\.2026-10-06$/);
  assert.match(textoDeRegla({ metrica: "gasto", operador: ">=", umbral: 10, periodo: "total", accion: "pausar", moneda: "USD" }), /10 USD en total/);
});

const { copiaDeReglaParaAnuncio } = await import("../lib/reglas-meta-pura.ts");

test("la copia de una regla vigila solo el anuncio nuevo y conserva condición y acción", () => {
  const c = copiaDeReglaParaAnuncio({ ...highquality, schedule_spec: { schedule_type: "SEMI_HOURLY" } }, "999", "highquality · anuncio");
  const filtros = c.evaluation_spec.filters;
  assert.deepEqual(filtros.find((f) => f.field === "ad.id"), { field: "ad.id", value: ["999"], operator: "IN" });
  assert.equal(filtros.filter((f) => f.field === "ad.id").length, 1);
  assert.deepEqual(filtros.find((f) => f.field === "spent"), { field: "spent", value: 1000, operator: "GREATER_THAN" });
  assert.deepEqual(c.execution_spec, { execution_type: "PAUSE" });
  assert.deepEqual(c.schedule_spec, { schedule_type: "SEMI_HOURLY" });
  assert.equal(highquality.evaluation_spec.filters.find((f) => f.field === "ad.id").value.length, 3, "la original no se modifica");
});
