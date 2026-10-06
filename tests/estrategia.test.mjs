import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { interpretarBrief, recomendarReparto, escenarios, avancePorSemana, sumarDias, diasEntre } = await import("../lib/estrategia.ts");
const { proyectar } = await import("../lib/simulador.ts");
const M = 1_000_000;
const HOY = new Date("2026-10-05T12:00:00Z");

test("brief: objetivo, monto y «mitad de octubre» (el ejemplo del equipo)", () => {
  const b = interpretarBrief("Queremos una campaña de leads para invertir 200000 durante mitad de octubre", HOY);
  assert.equal(b.objetivo, "LDS");
  assert.equal(b.montoMicros, 200_000 * M);
  assert.equal(b.inicio, "2026-10-05");
  assert.equal(b.fin, "2026-10-15");
  assert.equal(b.dias, 11);
  assert.ok(b.pistas.length >= 3);
});

test("brief: montos con $, puntos de miles, «mil» y «millones»; no confunde días con plata", () => {
  assert.equal(interpretarBrief("presupuesto de $1.500.000", HOY).montoMicros, 1_500_000 * M);
  assert.equal(interpretarBrief("unos 300 mil pesos para ventas", HOY).montoMicros, 300_000 * M);
  assert.equal(interpretarBrief("1,5 millones para tráfico", HOY).montoMicros, 1_500_000 * M);
  const usd = interpretarBrief("USD 500 en leads", HOY);
  assert.equal(usd.montoMicros, 500 * M);
  assert.equal(usd.moneda, "USD");
  const sinMonto = interpretarBrief("campaña de awareness durante 30 días", HOY);
  assert.equal(sinMonto.montoMicros, null);
  assert.equal(sinMonto.dias, 30);
});

test("brief: rangos de fecha, semanas y lo que no entiende queda vacío (no se inventa)", () => {
  const r = interpretarBrief("del 10 al 20 de octubre", HOY);
  assert.deepEqual([r.inicio, r.fin, r.dias], ["2026-10-10", "2026-10-20", 11]);
  assert.equal(interpretarBrief("por 2 semanas", HOY).dias, 14);
  const vacio = interpretarBrief("hagamos algo lindo", HOY);
  assert.deepEqual([vacio.objetivo, vacio.montoMicros, vacio.dias, vacio.fin], [null, null, null, null]);
  // Un mes que ya pasó este año se entiende del año siguiente.
  assert.equal(interpretarBrief("hasta el 3 de febrero", HOY).fin, "2027-02-03");
  assert.equal(sumarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(diasEntre("2026-10-01", "2026-10-15"), 15);
});

// Dos canales de Meta con costos distintos por lead: Instagram $5.000 y Facebook $20.000; ambos con 90 días de historia.
const fila = (canal, gasto, resultados) => ({
  provider: "meta", canal, objetivo: "LDS", gastoMicros: gasto * M, impresiones: gasto * 100, clics: gasto / 10, resultados,
  etiquetaResultado: "Leads", campanas: [{ gastoMicros: gasto * M, resultados }],
});
const historial = { moneda: "CLP", dias: 90, filas: [fila("instagram", 900_000, 180), fila("facebook", 900_000, 45)] };

test("reparto: más al canal que da cada lead más barato, y las fracciones suman 1", () => {
  const r = recomendarReparto(historial, { montoMicros: 400_000 * M, dias: 30, objetivo: "LDS" });
  const ig = r.reparto.find((x) => x.canal === "instagram");
  const fb = r.reparto.find((x) => x.canal === "facebook");
  assert.ok(ig.fraccion > fb.fraccion);
  assert.ok(Math.abs(r.reparto.reduce((s, x) => s + x.fraccion, 0) - 1) < 1e-9);
  assert.match(r.razones.find((x) => x.canal === "instagram").motivo, /más barato/);
});

test("reparto: ningún canal pasa del doble de lo que ya invertía por día; lo que sobra va al otro", () => {
  // Historia: 10.000/día por canal → tope de 2× en 30 días = 600.000 cada uno.
  const r = recomendarReparto(historial, { montoMicros: 1_000_000 * M, dias: 30, objetivo: "LDS" });
  const monto = (canal) => r.reparto.find((x) => x.canal === canal).fraccion * 1_000_000;
  assert.ok(monto("instagram") <= 600_000 + 1);
  assert.ok(monto("facebook") >= 400_000 - 1);
  // Con un monto que excede ambos topes, se avisa.
  const grande = recomendarReparto(historial, { montoMicros: 5_000_000 * M, dias: 30, objetivo: "LDS" });
  assert.ok(grande.avisos.some((a) => /doble/.test(a)));
});

test("reparto: sin historial del objetivo no recomienda nada y lo dice; un canal bajo su mínimo se descarta", () => {
  const sin = recomendarReparto(historial, { montoMicros: 100_000 * M, dias: 30, objetivo: "VTA" });
  assert.equal(sin.reparto.length, 0);
  assert.ok(sin.avisos.length > 0);
  // 20.000 en 30 días: ni siquiera alcanza el mínimo de un canal (30.000).
  const corto = recomendarReparto(historial, { montoMicros: 20_000 * M, dias: 30, objetivo: "LDS" });
  assert.ok(corto.avisos.some((a) => /mínimo/.test(a)));
});

test("escenarios y avance semanal: más monto da más resultados; la suma semanal es el total", () => {
  const rec = recomendarReparto(historial, { montoMicros: 400_000 * M, dias: 30, objetivo: "LDS" });
  const plan = { montoMicros: 400_000 * M, dias: 30, objetivo: "LDS", reparto: rec.reparto, campanas: 2 };
  const e = escenarios(historial, plan);
  assert.equal(e.length, 4);
  assert.ok(e[2].resultados.central > e[0].resultados.central);
  const p = proyectar(plan, historial);
  const semanas = avancePorSemana(p, 30, "2026-10-05");
  assert.equal(semanas.length, 5); // 7+7+7+7+2
  assert.equal(semanas[4].dias, 2);
  assert.ok(Math.abs(semanas.at(-1).acumulados - p.total.resultados.central) < 1e-6);
  assert.ok(Math.abs(semanas.reduce((s, w) => s + w.gastoMicros, 0) - plan.montoMicros) < 1);
});
