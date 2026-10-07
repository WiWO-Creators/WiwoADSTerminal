import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const e = await import("../lib/linkedin-escritura-pura.ts");

test("renombrar y pausar una campaña: solo viaja lo que cambia, con PARTIAL_UPDATE", () => {
  const plan = e.planDeActualizacion({ nivel: "campana", cuentaId: "558457797", id: "881631803", cambios: { nombre: "  Nueva  ", estado: "paused" } });
  assert.equal(plan.ruta, "/rest/adAccounts/558457797/adCampaigns/881631803");
  assert.equal(plan.cabeceras["X-RestLi-Method"], "PARTIAL_UPDATE");
  assert.deepEqual(plan.cuerpo, { patch: { $set: { name: "Nueva", status: "PAUSED" } } });
  assert.deepEqual(plan.esperado, { name: "Nueva", status: "PAUSED" });
});

test("un grupo usa su propia carpeta y no admite presupuesto diario", () => {
  const plan = e.planDeActualizacion({ nivel: "grupo", cuentaId: "1", id: "2", cambios: { estado: "ACTIVE" } });
  assert.equal(plan.ruta, "/rest/adAccounts/1/adCampaignGroups/2");
  assert.throws(() => e.planDeActualizacion({ nivel: "grupo", cuentaId: "1", id: "2", cambios: { presupuestoDiario: { monto: 10, moneda: "USD" } } }), /en la campaña/);
});

test("el presupuesto diario va como texto con su moneda y se verifica como número", () => {
  const plan = e.planDeActualizacion({ nivel: "campana", cuentaId: "1", id: "2", cambios: { presupuestoDiario: { monto: 25.5, moneda: "usd" } } });
  assert.deepEqual(plan.cuerpo, { patch: { $set: { dailyBudget: { amount: "25.5", currencyCode: "USD" } } } });
  assert.equal(plan.esperado["dailyBudget.amount"], 25.5);
});

test("no se acepta un estado que LinkedIn no deja fijar, un monto inválido ni un cambio vacío", () => {
  for (const estado of ["REMOVED", "CANCELLED", "PENDING_DELETION", "borrar"]) {
    assert.throws(() => e.planDeActualizacion({ nivel: "campana", cuentaId: "1", id: "2", cambios: { estado } }), /Estado no permitido/);
  }
  for (const monto of [0, -5, "abc", "1.234", "1e3", ""]) {
    assert.throws(() => e.planDeActualizacion({ nivel: "campana", cuentaId: "1", id: "2", cambios: { presupuestoDiario: { monto, moneda: "USD" } } }), /número positivo/);
  }
  assert.throws(() => e.planDeActualizacion({ nivel: "campana", cuentaId: "1", id: "2", cambios: {} }), /ningún cambio/);
  assert.throws(() => e.planDeActualizacion({ nivel: "campana", cuentaId: "1", id: "2", cambios: { nombre: "  " } }), /nombre/);
});

test("los ids no numéricos no entran a la ruta", () => {
  assert.throws(() => e.planDeActualizacion({ nivel: "campana", cuentaId: "1/../2", id: "3", cambios: { estado: "PAUSED" } }), /inválido/);
  assert.throws(() => e.planDeActualizacion({ nivel: "campana", cuentaId: "1", id: "3?x=1", cambios: { estado: "PAUSED" } }), /inválido/);
});

test("un nombre de más de 200 bytes se rechaza (cuenta bytes, no letras)", () => {
  assert.throws(() => e.planDeActualizacion({ nivel: "grupo", cuentaId: "1", id: "2", cambios: { nombre: "ñ".repeat(101) } }), /200 bytes/);
  assert.doesNotThrow(() => e.planDeActualizacion({ nivel: "grupo", cuentaId: "1", id: "2", cambios: { nombre: "ñ".repeat(100) } }));
});

test("un grupo nuevo nace en borrador y las fechas van en milisegundos UTC", () => {
  const plan = e.planDeGrupo({ cuentaId: "558457797", nombre: "Prueba", inicio: "2026-10-10", fin: "2026-11-10" });
  assert.equal(plan.ruta, "/rest/adAccounts/558457797/adCampaignGroups");
  assert.equal(plan.cuerpo.status, "DRAFT");
  assert.equal(plan.cuerpo.account, "urn:li:sponsoredAccount:558457797");
  assert.equal(plan.cuerpo.runSchedule.start, Date.UTC(2026, 9, 10));
  assert.equal(plan.cuerpo.runSchedule.end, Date.UTC(2026, 10, 10));
  assert.equal("totalBudget" in plan.cuerpo, false);
});

test("un presupuesto total exige fecha de término, y el término debe ser posterior al inicio", () => {
  assert.throws(() => e.planDeGrupo({ cuentaId: "1", nombre: "x", inicio: "2026-10-10", presupuestoTotal: { monto: 100, moneda: "USD" } }), /fecha de término/);
  assert.throws(() => e.planDeGrupo({ cuentaId: "1", nombre: "x", inicio: "2026-10-10", fin: "2026-10-10" }), /posterior/);
  const plan = e.planDeGrupo({ cuentaId: "1", nombre: "x", inicio: "2026-10-10", fin: "2026-11-10", presupuestoTotal: { monto: "100.00", moneda: "usd" } });
  assert.deepEqual(plan.cuerpo.totalBudget, { amount: "100.00", currencyCode: "USD" });
});

test("las fechas deben venir como AAAA-MM-DD", () => {
  assert.throws(() => e.planDeGrupo({ cuentaId: "1", nombre: "x", inicio: "10/10/2026" }), /AAAA-MM-DD/);
});

const CAMPANA = {
  cuentaId: "558457797", grupoId: "1219853484", nombre: "Campaña de prueba", inicio: "2026-10-10",
  presupuestoDiario: { monto: 10, moneda: "USD" }, costoUnitario: { monto: 5, moneda: "USD" }, ubicacionesGeo: ["103644278"], intencionPolitica: "NOT_DECLARED", entidadAsociada: "urn:li:organization:329866",
};

test("una campaña nueva nace en borrador, con segmentación de idioma y ubicación y sin expansión de audiencia", () => {
  const plan = e.planDeCampana(CAMPANA);
  assert.equal(plan.ruta, "/rest/adAccounts/558457797/adCampaigns");
  const c = plan.cuerpo;
  assert.equal(c.status, "DRAFT");
  assert.equal(c.campaignGroup, "urn:li:sponsoredCampaignGroup:1219853484");
  assert.equal(c.account, "urn:li:sponsoredAccount:558457797");
  assert.equal(c.type, "SPONSORED_UPDATES");
  assert.equal(c.audienceExpansionEnabled, false);
  assert.deepEqual(c.dailyBudget, { amount: "10", currencyCode: "USD" });
  assert.deepEqual(c.unitCost, { amount: "5", currencyCode: "USD" });
  assert.deepEqual(c.targetingCriteria.include.and[0].or["urn:li:adTargetingFacet:interfaceLocales"], ["urn:li:locale:en_US"]);
  assert.deepEqual(c.targetingCriteria.include.and[1].or["urn:li:adTargetingFacet:locations"], ["urn:li:geo:103644278"]);
});

test("una campaña exige ubicaciones numéricas, idioma/país de 2 letras y presupuestos válidos", () => {
  assert.throws(() => e.planDeCampana({ ...CAMPANA, ubicacionesGeo: [] }), /ubicación/);
  assert.throws(() => e.planDeCampana({ ...CAMPANA, ubicacionesGeo: ["abc"] }), /inválido/);
  assert.throws(() => e.planDeCampana({ ...CAMPANA, idioma: "english" }), /2 letras/);
  assert.throws(() => e.planDeCampana({ ...CAMPANA, presupuestoDiario: { monto: 0, moneda: "USD" } }), /positivo/);
  assert.throws(() => e.planDeCampana({ ...CAMPANA, grupoId: "x" }), /inválido/);
});

test("diferenciasConLoEsperado detecta lo que LinkedIn no dejó como se pidió", () => {
  const esperado = { name: "A", status: "PAUSED", "dailyBudget.amount": 10 };
  assert.deepEqual(e.diferenciasConLoEsperado(esperado, { name: "A", status: "PAUSED", dailyBudget: { amount: "10.00" } }), []);
  const fallas = e.diferenciasConLoEsperado(esperado, { name: "B", status: "PAUSED", dailyBudget: { amount: "12" } });
  assert.deepEqual(fallas.map((f) => f.campo), ["name", "dailyBudget.amount"]);
  assert.equal(e.diferenciasConLoEsperado({ name: "A" }, null)[0].actual, null);
});

test("la intención política es obligatoria, no tiene valor por defecto y solo admite los 3 valores de LinkedIn", () => {
  assert.equal(e.planDeCampana(CAMPANA).cuerpo.politicalIntent, "NOT_DECLARED");
  assert.equal(e.planDeCampana({ ...CAMPANA, intencionPolitica: "not_political" }).cuerpo.politicalIntent, "NOT_POLITICAL");
  const { intencionPolitica: _omitida, ...sinDeclarar } = CAMPANA;
  assert.throws(() => e.planDeCampana(sinDeclarar), /intención política/);
  assert.throws(() => e.planDeCampana({ ...CAMPANA, intencionPolitica: "NO" }), /intención política/);
});

test("la campaña lleva su entidad asociada (organización o persona) y rechaza cualquier otro formato", () => {
  assert.equal(e.planDeCampana(CAMPANA).cuerpo.associatedEntity, "urn:li:organization:329866");
  assert.equal(e.planDeCampana({ ...CAMPANA, entidadAsociada: "urn:li:person:E4Sicq8E6o" }).cuerpo.associatedEntity, "urn:li:person:E4Sicq8E6o");
  for (const malo of ["", "329866", "urn:li:company:1", "urn:li:organization:1/../2", "urn:li:organization:"]) {
    assert.throws(() => e.planDeCampana({ ...CAMPANA, entidadAsociada: malo }), /entidad asociada/);
  }
});

test("la referencia solo se cambia en la cuenta, y solo a una organización", () => {
  const plan = e.planDeActualizacion({ nivel: "cuenta", cuentaId: "558457797", id: "558457797", cambios: { referencia: "urn:li:organization:2641874" } });
  assert.equal(plan.ruta, "/rest/adAccounts/558457797");
  assert.deepEqual(plan.cuerpo, { patch: { $set: { reference: "urn:li:organization:2641874" } } });
  assert.deepEqual(plan.esperado, { reference: "urn:li:organization:2641874" });
  assert.throws(() => e.planDeActualizacion({ nivel: "campana", cuentaId: "1", id: "2", cambios: { referencia: "urn:li:organization:3" } }), /en la cuenta/);
  assert.throws(() => e.planDeActualizacion({ nivel: "cuenta", cuentaId: "1", id: "1", cambios: { referencia: "urn:li:person:abc" } }), /urn:li:organization/);
  assert.throws(() => e.planDeActualizacion({ nivel: "cuenta", cuentaId: "1", id: "1", cambios: { nombre: "x" } }), /solo se cambia la referencia/);
});
