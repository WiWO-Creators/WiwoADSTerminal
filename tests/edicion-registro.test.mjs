import assert from "node:assert/strict";
import test from "node:test";

import {
  PREFIJO_EDICION,
  entidadDeParams,
  nombreDeEdicion,
  pasoDeEdicion,
} from "../lib/edicion-registro.ts";

test("el título de una edición nombra la acción y la entidad más específica", () => {
  assert.equal(
    nombreDeEdicion("update_ad_creative", { ad_id: "9", adset_id: "8", campaign_id: "7" }),
    `${PREFIJO_EDICION}update_ad_creative (ad_id=9)`,
  );
  assert.equal(
    nombreDeEdicion("set_campaign_budget", { campaign_id: "7", amount_micros: 1 }),
    `${PREFIJO_EDICION}set_campaign_budget (campaign_id=7)`,
  );
});

test("sin id conocido el título no inventa una entidad", () => {
  assert.equal(entidadDeParams({ name: "x" }), null);
  assert.equal(nombreDeEdicion("create_customer_match_list", { name: "x" }), `${PREFIJO_EDICION}create_customer_match_list`);
});

test("un paso fallido conserva el error real de la plataforma", () => {
  const paso = pasoDeEdicion("meta", "pause_ad", { ad_id: "9" }, { ok: false, error: "Meta rechazó el cambio" }, "123");
  assert.equal(paso.ok, false);
  assert.equal(paso.error, "Meta rechazó el cambio");
  assert.equal(paso.platform, "meta");
  assert.deepEqual(paso.params, { ad_id: "9" });
});

test("un paso fallido sin mensaje no queda con el error vacío", () => {
  const paso = pasoDeEdicion("google", "pause_ad", {}, { ok: false }, "123");
  assert.equal(paso.error, "Error sin detalle");
});

test("un paso correcto guarda la respuesta cruda y ningún error", () => {
  const paso = pasoDeEdicion("google", "rename_campaign", { campaign_id: "7" }, { ok: true, raw: { result: "ok" } }, "123");
  assert.equal(paso.ok, true);
  assert.equal(paso.error, null);
  assert.deepEqual(paso.raw, { result: "ok" });
});

const { paramsParaBitacora, pasoDeEdicion: pasoPriv } = await import("../lib/edicion-registro.ts");

test("la bitácora no guarda los contactos de una lista de Customer Match, solo cuántos", () => {
  const params = {
    user_list_id: "77",
    members: [{ email: "ana@x.cl" }, { phone_number: "+56912345678" }],
    operation_type: "add",
  };
  const guardado = paramsParaBitacora("upload_customer_match_list", params);
  assert.equal(guardado.user_list_id, "77");
  assert.equal(guardado.operation_type, "add");
  assert.match(String(guardado.members), /^2 contactos/);
  assert.ok(!JSON.stringify(guardado).includes("ana@x.cl"));
  assert.ok(!JSON.stringify(guardado).includes("56912345678"));
  // Las demás acciones quedan intactas.
  assert.deepEqual(paramsParaBitacora("pause_campaign", { campaign_id: "1" }), { campaign_id: "1" });
  // Y el paso que se registra tampoco lleva los contactos.
  const paso = pasoPriv("google", "upload_customer_match_list", params, { ok: true }, "123");
  assert.ok(!JSON.stringify(paso).includes("ana@x.cl"));
});
