import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { detalleCampanaLinkedin, detalleConjuntoLinkedin, detalleAnuncioLinkedin } = await import("../lib/detalle-entidad.ts");
const { planEdicion } = await import("../lib/edicion-plan.ts");

// Filas con el formato real que devolvió Windsor (2026-10-02).
const GRUPO = detalleCampanaLinkedin({
  account_id: "555900177", campaign_group_id: "1218893583", campaign_group_name: "[AE] Chile Awareness | Colbún Clientes | Ago 2026",
  campaign_group_status: "ACTIVE", campaign_group_total_budget: 0,
  campaign_group_run_scedule_start_time: "2026-08-26T20:59:59", campaign_group_run_scedule_end_time: "2026-10-31T23:45:00",
});
const CAMPANA_DIARIA = detalleConjuntoLinkedin({
  account_id: "555900177", campaign_group_id: "1218893583", campaign_id: "895500533", campaign: "Colbún Clientes Awareness | Carrusel 2026",
  campaign_status: "ACTIVE", campaign_daily_budget_amount: "80000", campaign_total_budget_amount: null,
  campaign_start_date: "2026-10-01", campaign_end_date: null, campaign_type: "SPONSORED_UPDATES",
});
const CAMPANA_TOTAL = detalleConjuntoLinkedin({
  account_id: "555900177", campaign_id: "895348113", campaign: "[AE] Clientes | Video Views | 2026", campaign_status: "ACTIVE",
  campaign_daily_budget_amount: null, campaign_total_budget_amount: "400000", campaign_start_date: "2026-10-01", campaign_end_date: "2099-10-31",
});
const CLP = { currency: "CLP" };

test("detalle de LinkedIn: grupo, campaña y anuncio con el formato real de Windsor", () => {
  assert.equal(GRUPO.presupuesto.total, null); // 0 = sin tope
  assert.equal(GRUPO.fin, "2026-10-31");
  assert.equal(CAMPANA_DIARIA.presupuesto.diario, 80000);
  assert.equal(CAMPANA_DIARIA.presupuesto.total, null);
  assert.equal(CAMPANA_TOTAL.fin, "2099-10-31");
  const ad = detalleAnuncioLinkedin({ account_id: "1", creative_id: "99", creative_status: "ACTIVE", campaign_id: "5", campaign_group_id: "7" });
  assert.equal(ad.nombre, "99");
  assert.equal(ad.edicionDeContenido.editable, false);
  assert.equal(detalleConjuntoLinkedin({ account_id: "1" }), null);
});

test("LinkedIn conjunto: renombrar es solo un renombre y no pausa", () => {
  const p = planEdicion("linkedin", { nivel: "conjunto", entidad: CAMPANA_DIARIA, campana: GRUPO }, { nombre: "Otro nombre" }, CLP);
  assert.deepEqual(p.pasos.map((s) => s.action), ["rename_campaign"]);
  assert.deepEqual(p.pasos[0].params, { campaign_id: "895500533", name: "Otro nombre" });
  assert.equal(p.pausaAlAplicar, false);
});

test("LinkedIn conjunto: presupuesto diario sube (pausa) y baja (no pausa)", () => {
  const sube = planEdicion("linkedin", { nivel: "conjunto", entidad: CAMPANA_DIARIA, campana: GRUPO }, { presupuesto: { tipo: "daily", monto: 100000 } }, CLP);
  assert.deepEqual(sube.pasos[0].params, { campaign_id: "895500533", budget_type: "daily", amount: 100000 });
  assert.equal(sube.pausaAlAplicar, true);
  const baja = planEdicion("linkedin", { nivel: "conjunto", entidad: CAMPANA_DIARIA, campana: GRUPO }, { presupuesto: { tipo: "daily", monto: 50000 } }, CLP);
  assert.equal(baja.pausaAlAplicar, false);
});

test("LinkedIn conjunto: un presupuesto total exige fecha de término (la actual o la nueva)", () => {
  const sin = planEdicion("linkedin", { nivel: "conjunto", entidad: CAMPANA_DIARIA, campana: GRUPO }, { presupuesto: { tipo: "lifetime", monto: 300000 } }, CLP);
  assert.equal(sin.pasos.length, 0);
  assert.ok(sin.problemas.some((x) => x.bloqueante && /fecha de término/.test(x.mensaje)));
  const con = planEdicion("linkedin", { nivel: "conjunto", entidad: CAMPANA_DIARIA, campana: GRUPO }, { fin: "2099-12-31", presupuesto: { tipo: "lifetime", monto: 300000 } }, CLP);
  assert.deepEqual(con.pasos.map((s) => s.action), ["set_campaign_schedule", "set_campaign_budget"]);
  assert.equal(con.pasos[1].params.budget_type, "total");
});

test("LinkedIn conjunto: fechas inválidas o pasadas se bloquean", () => {
  const mala = planEdicion("linkedin", { nivel: "conjunto", entidad: CAMPANA_TOTAL, campana: null }, { fin: "31/12/2099" }, CLP);
  assert.equal(mala.pasos.length, 0);
  assert.ok(mala.problemas.some((x) => x.campo === "fin"));
  const pasada = planEdicion("linkedin", { nivel: "conjunto", entidad: CAMPANA_TOTAL, campana: null }, { fin: "2020-01-01" }, CLP);
  assert.ok(pasada.problemas.some((x) => /ya pasó/.test(x.mensaje)));
});

test("LinkedIn grupo: solo presupuesto total (con fecha de término); renombrar y anuncios no se pueden", () => {
  const ok = planEdicion("linkedin", { nivel: "campana", entidad: GRUPO }, { presupuesto: { tipo: "lifetime", monto: 900000 } }, CLP);
  assert.deepEqual(ok.pasos.map((s) => s.action), ["set_campaign_group_budget"]);
  assert.deepEqual(ok.pasos[0].params, { campaign_group_id: "1218893583", amount: 900000 });
  const diario = planEdicion("linkedin", { nivel: "campana", entidad: GRUPO }, { presupuesto: { tipo: "daily", monto: 1000 } }, CLP);
  assert.equal(diario.pasos.length, 0);
  const renombrar = planEdicion("linkedin", { nivel: "campana", entidad: GRUPO }, { nombre: "Nuevo" }, CLP);
  assert.ok(renombrar.problemas.some((x) => x.campo === "nombre"));
  const ad = detalleAnuncioLinkedin({ account_id: "1", creative_id: "9" });
  const e = planEdicion("linkedin", { nivel: "anuncio", entidad: ad }, { titulo: "x" }, CLP);
  assert.ok(e.problemas.some((x) => x.campo === "contenido"));
});
