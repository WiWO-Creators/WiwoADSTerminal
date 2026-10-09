import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { sugerenciasDeFicha } = await import("../lib/sugerencias-ficha-pura.ts");

const ahora = new Date(Date.UTC(2026, 9, 7, 12));
const completa = {
  cliente: { id: "c1", nombre: "Colbún" },
  tieneMeta: true,
  pageId: "123",
  instagramId: "456",
  kpiPrincipal: "leads",
  presupuestoMensual: true,
  metaDeCpaORoas: true,
  ga4: true,
  gtmEstado: "tiene",
};

test("una ficha completa no genera decisiones", () => {
  assert.deepEqual(sugerenciasDeFicha([completa], ahora), []);
});

test("cada dato que falta es una decisión con su regla, y la medición lleva el prefijo medicion_", () => {
  const vacia = { ...completa, pageId: null, instagramId: null, kpiPrincipal: null, presupuestoMensual: false, metaDeCpaORoas: false, ga4: false, gtmEstado: null };
  const reglas = sugerenciasDeFicha([vacia], ahora).map((s) => s.rule).sort();
  assert.deepEqual(reglas, ["ficha_sin_instagram", "ficha_sin_kpi", "ficha_sin_metas", "ficha_sin_pagina", "ficha_sin_presupuesto", "medicion_ficha_ga4", "medicion_ficha_gtm"]);
});

test("sin cuenta de Meta no se pide Página ni Instagram", () => {
  const reglas = sugerenciasDeFicha([{ ...completa, tieneMeta: false, pageId: null, instagramId: null }], ahora).map((s) => s.rule);
  assert.deepEqual(reglas, []);
});

test("el id es estable durante la semana y cambia a la siguiente", () => {
  const e = { ...completa, kpiPrincipal: null };
  const lunes = sugerenciasDeFicha([e], new Date(Date.UTC(2026, 9, 7)))[0].id;
  const siguiente = sugerenciasDeFicha([e], new Date(Date.UTC(2026, 9, 7, 20)))[0].id;
  const proxima = sugerenciasDeFicha([e], new Date(Date.UTC(2026, 9, 21)))[0].id;
  assert.equal(lunes, siguiente);
  assert.notEqual(lunes, proxima);
});
