import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { borradorDeCampana, finDelPlan, hitosDelPlan, icsDeHitos, inicioDeSemana, PLAN_COLOMBIA, totalDelPlan } = await import("../lib/estrategia-pura.ts");
const { buildPlan, normalizeDraft } = await import("../lib/constructor.ts");

test("el plan de Colombia suma los USD 2.400 aprobados y reparte 1.200 por mes", () => {
  assert.equal(totalDelPlan(PLAN_COLOMBIA), 2400);
  const por = Object.fromEntries(PLAN_COLOMBIA.campanas.map((c) => [c.clave, c.presupuestoTotal]));
  assert.deepEqual(por, { bogota: 950, clubes: 630, medellin: 600, retargeting: 220 });
  assert.equal(PLAN_COLOMBIA.semanas, 8);
});

test("las fechas se cuentan por semana: la semana 5 empieza 28 días después y el plan termina en el día 56", () => {
  assert.equal(inicioDeSemana("2026-11-02", 1), "2026-11-02");
  assert.equal(inicioDeSemana("2026-11-02", 5), "2026-11-30");
  assert.equal(finDelPlan("2026-11-02", 8), "2026-12-27");
});

test("los hitos son los del plan: lanzamiento, corte de la semana 3, retargeting en la 5, aviso una semana antes del fin y cierre", () => {
  const h = Object.fromEntries(hitosDelPlan("2026-11-02").map((x) => [x.clave, x.fecha]));
  assert.equal(h.inicio, "2026-11-02");
  assert.equal(h.corte3, "2026-11-16");
  assert.equal(h.retargeting, "2026-11-30");
  assert.equal(h["aviso-fin"], "2026-12-20");
  assert.equal(h.cierre, "2026-12-27");
  assert.equal(h.pre, "2026-10-30");
});

test("el calendario .ics tiene un evento por hito, de día completo y con aviso el día anterior", () => {
  const ics = icsDeHitos("Colombia", hitosDelPlan("2026-11-02"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 6);
  assert.match(ics, /DTSTART;VALUE=DATE:20261102/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR") && ics.trimEnd().endsWith("END:VCALENDAR"));
});

const CTX = { inicio: "2026-11-02", formularioId: "1101256272415286", urlDestino: "https://valordevelopment.com/colombia", publicos: { leads_formulario: "11111111", abrieron_sin_enviar: "22222222", video_25: "33333333", interaccion_pagina: "44444444", interaccion_instagram: "55555555" } };

test("el borrador de Bogotá: presupuesto total en el conjunto, viven aquí, sin categoría especial, Advantage+ apagado y excluye a los que ya dejaron datos", () => {
  const { borrador, lugares, intereses, faltan } = borradorDeCampana(PLAN_COLOMBIA, "bogota", CTX);
  assert.deepEqual(faltan, []);
  assert.equal(borrador.dailyBudget, 950);
  assert.equal(borrador.budgetMode, "total");
  assert.equal(borrador.metaBudgetLevel, "conjunto");
  assert.equal(borrador.metaLocationType, "home");
  assert.equal(borrador.specialAdCategory, "ninguna");
  assert.equal(borrador.metaAdvantageAudience, false);
  assert.equal(borrador.endDate, "2026-12-27");
  assert.deepEqual(borrador.metaExcludedAudiences, ["11111111"]);
  assert.deepEqual(borrador.metaPlacements, ["facebook", "instagram"]);
  assert.equal(lugares.length, 6);
  assert.ok(lugares.every((l) => l.radioKm >= 2), "el radio mínimo de Meta es 2 km");
  assert.equal(intereses.length, 3);
});

test("Clubes usa «estuvieron recientemente» y no lleva intereses; Retargeting parte en la semana 5 e incluye los públicos del plan", () => {
  const clubes = borradorDeCampana(PLAN_COLOMBIA, "clubes", CTX);
  assert.equal(clubes.borrador.metaLocationType, "recent");
  assert.deepEqual(clubes.intereses, []);
  const re = borradorDeCampana(PLAN_COLOMBIA, "retargeting", CTX);
  assert.equal(re.borrador.metaStartDate, "2026-11-30");
  assert.equal(re.borrador.metaLocationType, "");
  assert.deepEqual(re.borrador.metaCustomAudiences, ["22222222", "33333333", "44444444", "55555555"]);
  assert.deepEqual(re.borrador.metaExcludedAudiences, ["11111111"]);
});

test("si falta crear un público del plan, se dice cuál", () => {
  const { faltan } = borradorDeCampana(PLAN_COLOMBIA, "retargeting", { ...CTX, publicos: { leads_formulario: "11111111" } });
  assert.deepEqual(faltan, ["COL – Abrieron form sin enviar", "COL – Video 25%", "COL – Interacción FB", "COL – Interacción IG"]);
  assert.equal(borradorDeCampana(PLAN_COLOMBIA, "otra", CTX), null);
});

test("el borrador del plan arma un plan de publicación válido en el Constructor: campaña, conjunto con formulario y anuncio", () => {
  const { borrador } = borradorDeCampana(PLAN_COLOMBIA, "bogota", CTX);
  const cuenta = { externalId: "999", name: "Valor", provider: "meta", currency: "USD", pageId: "555", pixels: [], countries: ["CO"] };
  const draft = normalizeDraft({ portfolioId: "valor", ...borrador, message: "Texto", mediaUrl: "https://e.com/i.jpg", mediaType: "image" });
  const r = buildPlan(draft, null, [cuenta], { campaigns: [], rangeStart: "2026-09-01", rangeEnd: "2026-09-28" });
  assert.deepEqual(r.issues.filter((i) => i.blocking), []);
  const acciones = r.steps.filter((s) => !s.informativo).map((s) => s.action);
  assert.deepEqual(acciones, ["create_campaign", "meta:crear_conjunto_formulario", "meta:crear_anuncio_formulario"]);
  const conj = r.steps.find((s) => s.action === "meta:crear_conjunto_formulario");
  assert.equal(conj.params.presupuesto.menor, 95000);
  assert.equal(conj.params.presupuesto.tipo, "total");
  assert.deepEqual(conj.params.targeting.excluded_custom_audiences, [{ id: "11111111" }]);
  assert.deepEqual(conj.params.targeting.geo_locations.location_types, ["home"]);
});

const { conProyectosDeEstrategias, enProyectosAsignados } = await import("../lib/segmentos.ts");
const SEG = [{ id: "ebano", nombre: "Ébano", coincide: ["ebano"], plataformas: [], cuentas: [], paises: [], presupuesto: null }];

test("Colombia (del plan aprobado) cuenta como proyecto de Valor y no se oculta; lo ajeno sigue oculto", () => {
  assert.deepEqual(conProyectosDeEstrategias("valor", SEG).map((s) => s.id), ["ebano", "colombia"]);
  assert.equal(enProyectosAsignados("valor", SEG, ["[LDS] Colombia | Bogotá"]), true);
  assert.equal(enProyectosAsignados("valor", SEG, ["ContentMKT_2026_Conversion"]), false);
  assert.deepEqual(conProyectosDeEstrategias("sqm", SEG).map((s) => s.id), ["ebano"]);
});
