import assert from "node:assert/strict";
import test from "node:test";

import { construirResumenSemanal } from "../lib/resumen-semanal.ts";

function snapshot(over = {}) {
  return {
    rangeStart: "2026-09-15",
    rangeEnd: "2026-09-21",
    rango: { id: "ultimos_7", label: "Últimos 7 días", enCurso: false },
    currencyTotals: [{ currency: "CLP", spendMicros: 5_000_000_000, conversionValueMicros: null }],
    portfolios: [
      {
        id: "colbun",
        name: "Colbún Energía",
        declared: true,
        currencyTotals: [{ currency: "CLP", spendMicros: 3_000_000_000, conversionValueMicros: null }],
      },
      {
        id: "amipass",
        name: "Amipass",
        declared: true,
        currencyTotals: [{ currency: "CLP", spendMicros: 2_000_000_000, conversionValueMicros: null }],
      },
      {
        id: "suelta-1",
        name: "Cuenta suelta",
        declared: false,
        currencyTotals: [{ currency: "CLP", spendMicros: 999_000_000, conversionValueMicros: null }],
      },
    ],
    accounts: [
      { connectionStatus: "connected", metricsStatus: "ready" },
      { connectionStatus: "needs_attention", metricsStatus: "ready" },
      { connectionStatus: "connected", metricsStatus: "error" },
    ],
    ...over,
  };
}

function alerta(over = {}) {
  return {
    id: "a1",
    severidad: "critica",
    clienteId: "colbun",
    clienteNombre: "Colbún Energía",
    plataforma: "google",
    cuenta: "Cuenta",
    campana: "Campaña",
    diagnostico: "...",
    accion: null,
    ...over,
  };
}

test("ordena clientes por gasto, de mayor a menor, y descarta cuentas sueltas", () => {
  const resumen = construirResumenSemanal(snapshot(), []);
  assert.deepEqual(
    resumen.clientesConMasGasto.map((c) => c.clienteId),
    ["colbun", "amipass"],
  );
});

test("cuenta las alertas por severidad", () => {
  const alertas = [
    alerta({ id: "1", severidad: "critica" }),
    alerta({ id: "2", severidad: "critica" }),
    alerta({ id: "3", severidad: "alta" }),
    alerta({ id: "4", severidad: "media" }),
  ];
  const resumen = construirResumenSemanal(snapshot(), alertas);
  assert.deepEqual(resumen.alertas, { critica: 2, alta: 1, media: 1 });
});

test("las más urgentes son las 3 primeras de la lista ya ordenada", () => {
  const alertas = [1, 2, 3, 4, 5].map((n) => alerta({ id: String(n) }));
  const resumen = construirResumenSemanal(snapshot(), alertas);
  assert.equal(resumen.masUrgentes.length, 3);
  assert.equal(resumen.masUrgentes[0].id, "1");
});

test("cuenta cuentas con problemas de conexión o de métricas", () => {
  const resumen = construirResumenSemanal(snapshot(), []);
  assert.equal(resumen.cuentasQueNecesitanAtencion, 2);
});

test("un cliente sin gasto no aparece en el ranking", () => {
  const resumen = construirResumenSemanal(
    snapshot({
      portfolios: [
        { id: "x", name: "X", declared: true, currencyTotals: [{ currency: "CLP", spendMicros: 0, conversionValueMicros: null }] },
      ],
    }),
    [],
  );
  assert.equal(resumen.clientesConMasGasto.length, 0);
});

test("guarda el periodo y si está en curso", () => {
  const resumen = construirResumenSemanal(snapshot({ rango: { id: "mes_actual", label: "Mes actual", enCurso: true } }), []);
  assert.equal(resumen.periodo.enCurso, true);
  assert.equal(resumen.periodo.desde, "2026-09-15");
});
