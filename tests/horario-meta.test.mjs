import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { problemasDeHorario, horarioParaMeta, textoDeHorario } = await import("../lib/horario-meta-pura.ts");

test("un horario válido no tiene problemas y se traduce a minutos de Meta", () => {
  const t = [{ dias: [1, 2, 3, 4, 5], desde: 9, hasta: 18 }];
  assert.deepEqual(problemasDeHorario(t), []);
  assert.deepEqual(horarioParaMeta(t), [{ start_minute: 540, end_minute: 1080, days: [1, 2, 3, 4, 5], timezone_type: "ADVERTISER" }]);
  assert.equal(textoDeHorario(t), "lun, mar, mié, jue, vie 09:00–18:00");
});

test("días u horas fuera de rango, o inicio no anterior al término, se rechazan", () => {
  assert.ok(problemasDeHorario([{ dias: [7], desde: 9, hasta: 18 }]).length > 0);
  assert.ok(problemasDeHorario([{ dias: [], desde: 9, hasta: 18 }]).length > 0);
  assert.ok(problemasDeHorario([{ dias: [1], desde: 24, hasta: 25 }]).length > 0);
  assert.ok(problemasDeHorario([{ dias: [1], desde: 18, hasta: 9 }]).length > 0);
});

test("sin tramos es todo el día", () => {
  assert.equal(textoDeHorario([]), "Todo el día");
  assert.deepEqual(problemasDeHorario([]), []);
});
