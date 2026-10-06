import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

// `presupuesto-store` importa la base y Windsor; la función pura se prueba por separado vía su módulo.
const { historicoDeInversion } = await import("../lib/presupuesto-historico.ts");
const M = 1_000_000;

test("el gasto diario se junta por mes, plataforma y moneda, solo de las cuentas del cliente", () => {
  const filas = [
    { provider: "meta", accountId: "1", currency: "CLP", date: "2026-08-15", spendMicros: 100 * M },
    { provider: "meta", accountId: "1", currency: "CLP", date: "2026-08-20", spendMicros: 50 * M },
    { provider: "google", accountId: "2", currency: "CLP", date: "2026-08-02", spendMicros: 30 * M },
    { provider: "meta", accountId: "1", currency: "CLP", date: "2026-09-01", spendMicros: 10 * M },
    { provider: "meta", accountId: "9", currency: "CLP", date: "2026-09-01", spendMicros: 999 * M }, // de otro cliente
    { provider: "tiktok", accountId: "3", currency: "USD", date: "2026-09-03", spendMicros: 5 * M },
    { provider: "meta", accountId: "1", currency: "CLP", date: "2026-09-04", spendMicros: 0 },
  ];
  const claves = new Set(["windsor:meta:1", "windsor:google:2", "windsor:tiktok:3"]);
  const h = historicoDeInversion(filas, claves);
  const clp = h.find((x) => x.moneda === "CLP");
  assert.deepEqual(clp.meses.map((m) => m.mes), ["2026-08", "2026-09"]);
  assert.equal(clp.meses[0].totalMicros, 180 * M);
  assert.deepEqual(clp.meses[0].plataformas, { meta: 150 * M, google: 30 * M });
  assert.equal(clp.meses[1].totalMicros, 10 * M); // no suma la cuenta de otro cliente
  assert.equal(h.find((x) => x.moneda === "USD").meses[0].plataformas.tiktok, 5 * M);
});
