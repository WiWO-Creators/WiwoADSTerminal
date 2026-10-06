import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { presupuestoDeEntidad, totalDeEntidades, estaActiva } = await import("../lib/presupuesto-entidades.ts");
const M = 1_000_000;
const HOY = new Date("2026-10-10T12:00:00Z"); // octubre: 31 días; quedan 22 contando hoy

const base = { nivel: "campana", provider: "linkedin", accountId: "1", campaignId: null, moneda: "CLP", inicio: "2026-10-01", fin: null };

test("presupuesto TOTAL: lo que sobra es el total menos lo gastado desde que empezó", () => {
  const p = presupuestoDeEntidad(
    { ...base, id: "a", nombre: "A", estado: "ACTIVE", presupuestoDiario: null, presupuestoTotal: 400_000, gastadoMesMicros: 100_000 * M, gastadoVidaMicros: 150_000 * M },
    HOY,
  );
  assert.equal(p.tipo, "total");
  assert.equal(p.presupuestoMicros, 400_000 * M);
  assert.equal(p.gastadoMicros, 150_000 * M);
  assert.equal(p.restanteMicros, 250_000 * M);
});

test("presupuesto DIARIO activo: sobra lo que se gastaría hasta fin de mes (contando hoy)", () => {
  const p = presupuestoDeEntidad(
    { ...base, id: "b", nombre: "B", estado: "ACTIVE", presupuestoDiario: 80_000, presupuestoTotal: null, gastadoMesMicros: 700_000 * M, gastadoVidaMicros: null },
    HOY,
  );
  assert.equal(p.tipo, "diario");
  assert.equal(p.restanteMicros, 80_000 * 22 * M);
  assert.equal(p.presupuestoMicros, 700_000 * M + 80_000 * 22 * M);
});

test("diario pausado o terminado no compromete nada; sin presupuesto queda sin restante", () => {
  const pausada = presupuestoDeEntidad(
    { ...base, id: "c", nombre: "C", estado: "PAUSED", presupuestoDiario: 50_000, presupuestoTotal: null, gastadoMesMicros: 10 * M, gastadoVidaMicros: null },
    HOY,
  );
  assert.equal(pausada.restanteMicros, 0);
  const terminada = presupuestoDeEntidad(
    { ...base, id: "d", nombre: "D", estado: "ACTIVE", fin: "2026-10-05", presupuestoDiario: 50_000, presupuestoTotal: null, gastadoMesMicros: 0, gastadoVidaMicros: null },
    HOY,
  );
  assert.equal(terminada.restanteMicros, 0);
  const sin = presupuestoDeEntidad(
    { ...base, id: "e", nombre: "E", estado: "ACTIVE", presupuestoDiario: null, presupuestoTotal: null, gastadoMesMicros: 5 * M, gastadoVidaMicros: null },
    HOY,
  );
  assert.equal(sin.tipo, "sin_presupuesto");
  assert.equal(sin.restanteMicros, null);
});

test("el total del cliente suma por moneda y usa los conjuntos si la campaña no tiene presupuesto", () => {
  const ent = (id, over) =>
    presupuestoDeEntidad(
      { ...base, id, nombre: id, estado: "ACTIVE", presupuestoDiario: null, presupuestoTotal: null, gastadoMesMicros: 0, gastadoVidaMicros: 0, ...over },
      HOY,
    );
  const lista = [
    ent("c1", { presupuestoTotal: 100_000, gastadoVidaMicros: 40_000 * M }),
    ent("c2", {}), // sin presupuesto: cuentan sus conjuntos
    ent("j1", { nivel: "conjunto", campaignId: "c2", presupuestoTotal: 60_000, gastadoVidaMicros: 10_000 * M }),
    ent("j2", { nivel: "conjunto", campaignId: "c2", presupuestoTotal: 40_000, gastadoVidaMicros: 0 }),
    ent("usd", { moneda: "USD", presupuestoTotal: 500, gastadoVidaMicros: 100 * M }),
    ent("vieja", { estado: "COMPLETED", presupuestoTotal: 999, gastadoVidaMicros: 0 }), // terminada sin gasto este mes: no cuenta
  ];
  const t = totalDeEntidades(lista);
  const clp = t.find((x) => x.moneda === "CLP");
  assert.equal(clp.presupuestoMicros, 200_000 * M);
  assert.equal(clp.gastadoMicros, 50_000 * M);
  assert.equal(clp.restanteMicros, 150_000 * M);
  assert.equal(clp.entidades, 3);
  assert.equal(t.find((x) => x.moneda === "USD").restanteMicros, 400 * M);
  assert.ok(estaActiva("enabled") && !estaActiva("PAUSED"));
});

test("una campaña pausada con gasto de hace meses (sin gasto este mes) no suma presupuesto disponible", () => {
  const vieja = presupuestoDeEntidad(
    { ...base, id: "p", nombre: "P", estado: "PAUSED", presupuestoDiario: null, presupuestoTotal: 1_000, gastadoMesMicros: 0, gastadoVidaMicros: 200 * M, moneda: "USD" },
    HOY,
  );
  assert.equal(vieja.restanteMicros, 800 * M); // su detalle sigue siendo cierto…
  assert.deepEqual(totalDeEntidades([vieja]), []); // …pero no se cuenta como plata disponible
});
