import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const p = await import("../lib/tiktok-nativo-pura.ts");

test("las rutas llevan barra final y el sandbox usa su propio dominio", () => {
  assert.equal(p.urlDeApi("campaign/get"), "https://business-api.tiktok.com/open_api/v1.3/campaign/get/");
  assert.equal(p.urlDeApi("/campaign/get//", { sandbox: true }), "https://sandbox-ads.tiktok.com/open_api/v1.3/campaign/get/");
  const url = new URL(p.urlDeApi("advertiser/info", { query: { advertiser_ids: '["1"]', fields: undefined } }));
  assert.equal(url.searchParams.get("advertiser_ids"), '["1"]');
  assert.equal(url.searchParams.has("fields"), false);
});

test("un code distinto de 0 es fallo aunque el HTTP sea 200, y 20001 es éxito parcial", () => {
  assert.deepEqual(p.datosDeRespuesta({ code: 0, data: { a: 1 } }), { a: 1 });
  assert.deepEqual(p.datosDeRespuesta({ code: 20001, data: { b: 2 } }), { b: 2 });
  assert.throws(() => p.datosDeRespuesta({ code: 40105, message: "token inválido" }), /vuelva a autorizar|volver a autorizar/);
  assert.throws(() => p.datosDeRespuesta({ code: 40002, message: "param" }), (e) => e.code === 40002);
});

test("cada objetivo de WiWO combina meta de optimización y evento de cobro válidos", () => {
  for (const [obj, o] of Object.entries(p.OBJETIVO_TIKTOK)) assert.ok(p.cobroValidoPara(o.optimizationGoal, o.billingEvent), obj);
  assert.equal(p.cobroValidoPara("CLICK", "CPM"), false);
});

test("los mínimos de presupuesto dependen de la moneda y CLP no lleva decimales", () => {
  assert.match(p.revisarPresupuesto({ monto: 30, moneda: "USD", nivel: "campana" }), /50 USD/);
  assert.equal(p.revisarPresupuesto({ monto: 30, moneda: "USD", nivel: "grupo" }), null);
  assert.equal(p.revisarPresupuesto({ monto: 5, moneda: "EUR", nivel: "campana" }), null);
  assert.equal(p.redondearMonto(50000.7, "CLP"), 50001);
  assert.equal(p.redondearMonto(10.456, "USD"), 10.46);
});

test("subir el presupuesto exige 105 % de lo gastado", () => {
  assert.ok(p.revisarSubidaDePresupuesto({ nuevo: 100, gastado: 100 }));
  assert.equal(p.revisarSubidaDePresupuesto({ nuevo: 106, gastado: 100 }), null);
});

test("la campaña nace activa, sin emojis y con ids en texto", () => {
  const r = p.planDeCampana({ anunciante: "123", nombre: "Verano 🌞 2026", objetivo: "trafico", presupuestoDiario: 60, moneda: "USD" });
  assert.deepEqual(r.bloqueos, []);
  assert.equal(r.cuerpo.campaign_name, "Verano 2026");
  assert.equal(r.cuerpo.objective_type, "TRAFFIC");
  assert.equal(r.cuerpo.operation_status, "ENABLE");
  assert.equal(r.cuerpo.advertiser_id, "123");
  assert.ok(p.planDeCampana({ anunciante: "1", nombre: "x", objetivo: "trafico", presupuestoDiario: 1, moneda: "USD" }).bloqueos.length);
});

test("el grupo valida ubicación, fechas y manda las fechas en UTC", () => {
  const inicio = new Date("2026-10-08T12:00:00Z");
  const base = { anunciante: "1", campanaId: "2", nombre: "Grupo", objetivo: "trafico", presupuestoDiario: 30, moneda: "USD", inicio, ubicaciones: ["6252001"] };
  const ok = p.planDeGrupo(base);
  assert.deepEqual(ok.bloqueos, []);
  assert.equal(ok.cuerpo.schedule_start_time, "2026-10-08 12:00:00");
  assert.equal(ok.cuerpo.schedule_type, "SCHEDULE_FROM_NOW");
  assert.equal(ok.cuerpo.billing_event, "CPC");
  assert.equal(ok.cuerpo.operation_status, "ENABLE");
  assert.ok(p.planDeGrupo({ ...base, ubicaciones: [] }).bloqueos.length);
  assert.ok(p.planDeGrupo({ ...base, fin: new Date("2026-10-01T00:00:00Z") }).bloqueos.length);
  assert.equal(p.planDeGrupo({ ...base, fin: new Date("2026-10-20T00:00:00Z") }).cuerpo.schedule_type, "SCHEDULE_START_END");
  assert.equal(p.planDeGrupo({ ...base, objetivo: "alcance" }).cuerpo.promotion_type, undefined);
});

test("la edición separa nombre/presupuesto del cambio de estado y usa operation_status", () => {
  const r = p.planDeEdicionDeCampana({ anunciante: "1", campanaId: "9", moneda: "USD", gastado: 100, cambio: { nombre: "Nuevo", presupuesto: 120, estado: "PAUSAR" } });
  assert.deepEqual(r.bloqueos, []);
  assert.deepEqual(r.pasos.map((x) => x.ruta), ["campaign/update/", "campaign/status/update/"]);
  assert.equal(r.pasos[1].cuerpo.operation_status, "DISABLE");
  assert.deepEqual(r.pasos[1].cuerpo.campaign_ids, ["9"]);
  const baja = p.planDeEdicionDeCampana({ anunciante: "1", campanaId: "9", moneda: "USD", gastado: 100, cambio: { presupuesto: 101 } });
  assert.ok(baja.bloqueos.length);
  assert.deepEqual(baja.pasos, []);
});

test("los cambios de estado se parten en lotes de 20 y el reporte respeta sus límites", () => {
  assert.deepEqual(p.lotesDe(Array.from({ length: 45 }, (_, i) => i)).map((l) => l.length), [20, 20, 5]);
  assert.ok(p.revisarRangoDeReporte({ desde: "2026-09-01", hasta: "2026-10-15", porDia: true }));
  assert.equal(p.revisarRangoDeReporte({ desde: "2026-09-01", hasta: "2026-10-15", porDia: false }), null);
  const q = p.queryDeReporte({ anunciante: "1", desde: "2026-10-01", hasta: "2026-10-07" });
  assert.equal(q.data_level, "AUCTION_CAMPAIGN");
  assert.deepEqual(JSON.parse(q.dimensions), ["campaign_id", "stat_time_day"]);
  assert.equal(p.numeroDeMetrica("12.5"), 12.5);
  assert.equal(p.numeroDeMetrica(undefined), 0);
});
