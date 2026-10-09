import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { partesDeFechaMeta, aFechaDeMeta } = await import("../lib/fecha-meta-pura.ts");

test("la fecha de Meta se muestra con la hora de la cuenta, como en Ads Manager", () => {
  const p = partesDeFechaMeta("2026-10-31T23:59:00-0300");
  assert.deepEqual(p, { local: "2026-10-31T23:59", offset: "-0300", gmt: "GMT-3" });
  assert.equal(partesDeFechaMeta("2026-08-04T17:52:46-0400").local, "2026-08-04T17:52");
  assert.equal(partesDeFechaMeta("2026-08-04T17:52:46+05:30").gmt, "GMT+5:30");
  assert.equal(partesDeFechaMeta("2026-08-04T17:52:46Z").offset, "+0000");
  assert.equal(partesDeFechaMeta(null), null);
  assert.equal(partesDeFechaMeta("no es fecha"), null);
});

test("al guardar se devuelve con el desfase de la cuenta, no el del navegador", () => {
  assert.equal(aFechaDeMeta("2026-11-15T23:59", "-0300"), "2026-11-15T23:59:00-0300");
  assert.equal(aFechaDeMeta("2026-11-15T23:59", ""), "2026-11-15T23:59:00+0000");
});
