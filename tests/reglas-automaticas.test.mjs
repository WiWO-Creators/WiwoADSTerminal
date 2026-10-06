import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { sumar, valorDeMetrica, cumpleRegla, claveDePeriodo, textoDeRegla } = await import("../lib/reglas-automaticas-pura.ts");

const t = { spendMicros: 12_000_000, impressions: 10000, clicks: 200, reach: 5000, leads: 4, conversions: null };

test("el gasto máximo (ej. 10 USD) se cumple al llegar al tope", () => {
  assert.equal(cumpleRegla({ metrica: "gasto", operador: ">=", umbral: 10 }, t).cumple, true);
  assert.equal(cumpleRegla({ metrica: "gasto", operador: ">=", umbral: 15 }, t).cumple, false);
});

test("calcula CPC, CTR, frecuencia y CPL; sin resultados no hay costo y no dispara", () => {
  assert.equal(valorDeMetrica("cpc", t), 0.06);
  assert.equal(valorDeMetrica("ctr", t), 2);
  assert.equal(valorDeMetrica("frecuencia", t), 2);
  assert.equal(valorDeMetrica("cpl", t), 3);
  assert.equal(valorDeMetrica("cpa", t), null);
  assert.equal(cumpleRegla({ metrica: "cpa", operador: ">=", umbral: 1 }, t).cumple, false);
});

test("sumar junta anuncios en su conjunto sin duplicar el alcance", () => {
  const s = sumar([t, { ...t, reach: 7000, leads: null }]);
  assert.equal(s.spendMicros, 24_000_000);
  assert.equal(s.reach, 7000);
  assert.equal(s.leads, 4);
});

test("las reglas de «hoy» y «este mes» se rearman con el periodo; las demás no", () => {
  const d = new Date("2026-10-05T10:00:00Z");
  assert.equal(claveDePeriodo("hoy", d), "2026-10-05");
  assert.equal(claveDePeriodo("mes_actual", d), "2026-10");
  assert.equal(claveDePeriodo("ultimos_7", d), "unica");
  assert.match(textoDeRegla({ metrica: "gasto", operador: ">=", umbral: 10, periodo: "hoy", accion: "pausar", moneda: "USD" }), /gasto llega a o supera 10 USD hoy: pausar/);
});

const { presupuestoReducido, problemaDeAccion } = await import("../lib/reglas-automaticas-pura.ts");

test("bajar el presupuesto un porcentaje redondea y nunca llega a cero", () => {
  assert.equal(presupuestoReducido(10000, 20), 8000);
  assert.equal(presupuestoReducido(15, 50), 8);
  assert.equal(presupuestoReducido(1, 90), 1);
});

test("la acción de bajar presupuesto no sirve para anuncios ni con porcentajes fuera de rango", () => {
  assert.match(problemaDeAccion("bajar_presupuesto", "anuncio", 20), /no tiene presupuesto propio/);
  assert.match(problemaDeAccion("bajar_presupuesto", "campana", 95), /entre 1 y 90/);
  assert.match(problemaDeAccion("bajar_presupuesto", "conjunto", null), /entre 1 y 90/);
  assert.equal(problemaDeAccion("bajar_presupuesto", "conjunto", 25), null);
  assert.equal(problemaDeAccion("pausar", "anuncio", null), null);
});

test("el texto de la regla dice cuánto baja el presupuesto", () => {
  assert.match(textoDeRegla({ metrica: "cpa", operador: ">=", umbral: 5000, periodo: "ultimos_7", accion: "bajar_presupuesto", moneda: "CLP", accionValor: 25 }), /bajar el presupuesto 25 %/);
});
