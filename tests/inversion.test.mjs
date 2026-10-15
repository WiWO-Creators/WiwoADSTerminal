import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { situacionDeInversion, gastoPorMoneda } = await import("../lib/inversion-pura.ts");
const { calcularPresupuesto } = await import("../lib/presupuesto.ts");

const M = 1_000_000;
const hoy = new Date(Date.UTC(2026, 9, 14)); // 14 de octubre: faltan 17 días
const total = (restanteMicros) => ({ moneda: "CLP", presupuestoMicros: 1000 * M, gastadoMicros: 1000 * M - restanteMicros, gastadoMesMicros: 0, restanteMicros, entidades: 2 });
const base = { moneda: "CLP", gastadoPeriodoMicros: 100 * M, hoy };

test("en ritmo: dice cuánto queda y cuánto por día, y qué pasa si se pausa todo", () => {
  const ficha = calcularPresupuesto(2_000_000 * M, 900_000 * M, hoy);
  const s = situacionDeInversion({ ...base, ficha, campanas: null });
  assert.equal(s.origen, "ficha");
  assert.equal(s.disponibleMicros, ficha.restanteMicros);
  assert.equal(s.nivel, "ok");
  assert.match(s.siSePausaTodo, /Si pausas todo hoy/);
  assert.ok(s.porDiaMicros > 0);
});

test("excedido o agotado recomienda añadir presupuesto y no promete nada al pausar", () => {
  const excedido = situacionDeInversion({ ...base, ficha: calcularPresupuesto(1000 * M, 1200 * M, hoy), campanas: null });
  assert.equal(excedido.nivel, "agregar");
  assert.equal(excedido.disponibleMicros, 0);
  assert.match(excedido.siSePausaTodo, /no se libera presupuesto/);
  const agotado = situacionDeInversion({ ...base, ficha: calcularPresupuesto(1000 * M, 990 * M, hoy), campanas: null });
  assert.equal(agotado.nivel, "agregar");
});

test("adelantado avisa que va a pasarse y propone el gasto diario máximo", () => {
  const s = situacionDeInversion({ ...base, ficha: calcularPresupuesto(1000 * M, 700 * M, hoy), campanas: null });
  assert.equal(s.nivel, "atencion");
  assert.match(s.recomendacion, /Baja el gasto diario/);
});

test("atrasado dice que hay margen para invertir más", () => {
  const s = situacionDeInversion({ ...base, ficha: calcularPresupuesto(1000 * M, 100 * M, hoy), campanas: null });
  assert.equal(s.nivel, "ok");
  assert.match(s.titulo, /margen/);
});

test("sin ficha se usa lo asignado a las campañas; sin nada, no se inventa", () => {
  const conCampanas = situacionDeInversion({ ...base, ficha: null, campanas: total(300 * M) });
  assert.equal(conCampanas.origen, "campanas");
  assert.equal(conCampanas.disponibleMicros, 300 * M);
  const agotadas = situacionDeInversion({ ...base, ficha: null, campanas: total(0) });
  assert.equal(agotadas.nivel, "agregar");
  const nada = situacionDeInversion({ ...base, ficha: null, campanas: null });
  assert.equal(nada.nivel, "sin_datos");
  assert.equal(nada.disponibleMicros, null);
});

test("el gasto del periodo se suma por moneda sin mezclarlas", () => {
  assert.deepEqual(gastoPorMoneda([{ spendMicros: 5, currency: "CLP" }, { spendMicros: 7, currency: "CLP" }, { spendMicros: 3, currency: "USD" }]), { CLP: 12, USD: 3 });
});
