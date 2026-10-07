import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { estadoDeEntorno, VARIABLES_DE_ENTORNO } = await import("../lib/entorno-pura.ts");

test("el estado del entorno dice solo si cada variable está cargada, nunca su valor", () => {
  const e = estadoDeEntorno({ META_APP_ID: "123", CRON_SECRET: "  ", ANTHROPIC_API_KEY: "secreto" });
  assert.equal(e.length, VARIABLES_DE_ENTORNO.length);
  assert.equal(e.find((v) => v.nombre === "META_APP_ID").cargada, true);
  assert.equal(e.find((v) => v.nombre === "CRON_SECRET").cargada, false);
  assert.equal(e.find((v) => v.nombre === "META_SYSTEM_USER_TOKEN").cargada, false);
  assert.ok(!JSON.stringify(e).includes("secreto"));
});

test("LinkedIn cuenta como cargado con cualquiera de sus dos nombres", () => {
  const e = estadoDeEntorno({ LINKEDIN_CLIENT_ID: "a", LINKEDIN_APP_SECRET: "b" });
  assert.equal(e.find((v) => v.nombre === "LINKEDIN_CLIENT_ID").cargada, true);
  assert.equal(e.find((v) => v.nombre === "LINKEDIN_CLIENT_SECRET").cargada, true);
  assert.equal(estadoDeEntorno({}).find((v) => v.nombre === "LINKEDIN_CLIENT_SECRET").cargada, false);
});
