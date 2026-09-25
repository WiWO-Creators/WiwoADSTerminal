import assert from "node:assert/strict";
import test from "node:test";

import { generarAlertas } from "../lib/alertas.ts";

function portfolio(over = {}) {
  return {
    id: "cliente-1",
    name: "Cliente Uno",
    pageId: null,
    instagramId: null,
    countries: [],
    contactEmail: null,
    needsReview: false,
    reviewNote: null,
    notes: null,
    targetCpaMicros: null,
    targetRoas: null,
    accountIds: ["111"],
    ...over,
  };
}

function campana(over = {}) {
  return {
    provider: "google",
    accountId: "111",
    accountName: "Cuenta Uno",
    currency: "CLP",
    name: "Campaña de prueba",
    campaignId: "999",
    status: "ENABLED",
    nativeObjective: null,
    reach: null,
    linkClicks: null,
    engagement: null,
    leads: null,
    purchases: null,
    spendMicros: 0,
    clicks: 0,
    impressions: 0,
    conversions: 0,
    conversionValueMicros: null,
    conActividad: true,
    dailyBudgetMicros: null,
    accountKey: "windsor:google:111",
    objetivo: null,
    objetivoDeducido: false,
    conversionBreakdown: null,
    ...over,
  };
}

test("una campaña pausada nunca genera alerta", () => {
  const alertas = generarAlertas([portfolio()], [campana({ status: "PAUSED" })]);
  assert.equal(alertas.length, 0);
});

test("sin cliente dueño de la cuenta, no hay alerta", () => {
  const alertas = generarAlertas([portfolio({ accountIds: ["otra-cuenta"] })], [campana()]);
  assert.equal(alertas.length, 0);
});

test("activa sin actividad en el periodo, sin necesitar meta", () => {
  const alertas = generarAlertas([portfolio()], [campana({ conActividad: false })]);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].severidad, "media");
  assert.equal(alertas[0].accion, null);
});

test("desperdicio: gastó el doble de la meta sin conversiones, propone pausar", () => {
  const alertas = generarAlertas(
    [portfolio({ targetCpaMicros: 10_000_000 })],
    [campana({ spendMicros: 21_000_000, conversions: 0 })],
  );
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].severidad, "critica");
  assert.deepEqual(alertas[0].accion, { tipo: "pausar", cuentaId: "111", campanaId: "999" });
});

test("degradación: CPA 40% sobre la meta con 3+ conversiones", () => {
  const alertas = generarAlertas(
    [portfolio({ targetCpaMicros: 10_000_000 })],
    [campana({ spendMicros: 45_000_000, conversions: 3 })], // CPA real 15M, 50% sobre la meta
  );
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].severidad, "alta");
});

test("sin meta de CPA, ninguna de las reglas de gasto se evalúa", () => {
  const alertas = generarAlertas(
    [portfolio()],
    [campana({ spendMicros: 100_000_000, conversions: 0 })],
  );
  assert.equal(alertas.length, 0);
});

test("un campo sin campaignId no ofrece acción de un clic", () => {
  const alertas = generarAlertas(
    [portfolio({ targetCpaMicros: 10_000_000 })],
    [campana({ campaignId: null, spendMicros: 21_000_000, conversions: 0 })],
  );
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].accion, null);
});

test("las alertas críticas van antes que las medias", () => {
  const alertas = generarAlertas(
    [portfolio({ id: "a", name: "A", accountIds: ["1"], targetCpaMicros: 10_000_000 }), portfolio({ id: "b", name: "B", accountIds: ["2"] })],
    [
      campana({ accountId: "2", campaignId: "s1", conActividad: false }),
      campana({ accountId: "1", campaignId: "s2", spendMicros: 21_000_000, conversions: 0 }),
    ],
  );
  assert.equal(alertas.length, 2);
  assert.equal(alertas[0].severidad, "critica");
  assert.equal(alertas[1].severidad, "media");
});
