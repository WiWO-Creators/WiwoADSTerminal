import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { evaluarCompatibilidadBoost, paginaDelPost } = await import("../lib/boost-compat.ts");
const { detalleCampanaMeta, detalleConjuntoMeta } = await import("../lib/detalle-entidad.ts");

const POST = "286255651767382_1538380521652067";

// Datos reales de Colbún (2026-09-29).
const CAMPANA_INTERACCION = detalleCampanaMeta({
  account_id: "2006250736667023", account_currency: "CLP", campaign_id: "52517686558837",
  campaign: "[AE] Colbún | IG | Engagement Perfil", campaign_objective: "OUTCOME_ENGAGEMENT",
  campaign_lifetime_budget: 750000, campaign_daily_budget: null,
});
const CAMPANA_ALCANCE = detalleCampanaMeta({
  account_id: "2006250736667023", account_currency: "CLP", campaign_id: "52525140669037",
  campaign: "Concurso Maule", campaign_objective: "OUTCOME_AWARENESS", campaign_lifetime_budget: 64000,
});
const CONJUNTO_PERFIL_IG = detalleConjuntoMeta({
  account_id: "2006250736667023", campaign_id: "52517686558837", adset_id: "52517686674037",
  adset_name: "AS | RTG Engagement IG 365d | CL", adset_destination_type: "INSTAGRAM_PROFILE",
  adsset_optimization_goal: "PROFILE_AND_PAGE_ENGAGEMENT",
  adset_promoted_object: '{"page_id": "286255651767382", "smart_pse_enabled": false}',
});
const conjuntoOnPost = (over = {}) => detalleConjuntoMeta({
  account_id: "2006250736667023", campaign_id: "52517686558837", adset_id: "9", adset_name: "Impulso",
  adset_destination_type: "ON_POST", adsset_optimization_goal: "POST_ENGAGEMENT",
  adset_promoted_object: '{"page_id": "286255651767382"}', ...over,
});

test("la página sale de la primera mitad del id de la publicación", () => {
  assert.equal(paginaDelPost(POST), "286255651767382");
  assert.equal(paginaDelPost("sin-formato"), null);
  assert.equal(paginaDelPost("123_"), null);
  assert.equal(paginaDelPost("abc_123"), null);
});

test("una campaña de interacción admite un conjunto de impulso nuevo", () => {
  const c = evaluarCompatibilidadBoost(POST, CAMPANA_INTERACCION, null);
  assert.equal(c.campana, true);
  assert.equal(c.conjunto, false);
  assert.equal(c.motivo, null);
});

test("una campaña de alcance NO admite impulsar, y el motivo dice por qué", () => {
  const c = evaluarCompatibilidadBoost(POST, CAMPANA_ALCANCE, null);
  assert.equal(c.campana, false);
  assert.match(c.motivo, /OUTCOME_ENGAGEMENT/);
  assert.match(c.motivo, /OUTCOME_AWARENESS/);
});

test("el presupuesto en la campaña se propaga: el conjunto nuevo no debe llevar el suyo", () => {
  assert.equal(evaluarCompatibilidadBoost(POST, CAMPANA_INTERACCION, null).presupuestoEnCampana, true);
});

test("un conjunto ON_POST + POST_ENGAGEMENT de la misma página admite impulsar directo", () => {
  const c = evaluarCompatibilidadBoost(POST, CAMPANA_INTERACCION, conjuntoOnPost());
  assert.equal(c.conjunto, true);
  assert.equal(c.motivo, null);
});

test("el conjunto real de Colbún (perfil de Instagram) no es compatible, pero su campaña sí", () => {
  const c = evaluarCompatibilidadBoost(POST, CAMPANA_INTERACCION, CONJUNTO_PERFIL_IG);
  assert.equal(c.conjunto, false);
  assert.equal(c.campana, true, "se puede crear un conjunto de impulso dentro de esa campaña");
  assert.match(c.motivo, /INSTAGRAM_PROFILE/);
  assert.match(c.motivo, /conjunto de impulso nuevo/);
});

test("un conjunto que promueve otra página no es compatible", () => {
  const c = evaluarCompatibilidadBoost(POST, CAMPANA_INTERACCION, conjuntoOnPost({ adset_promoted_object: '{"page_id": "999"}' }));
  assert.equal(c.conjunto, false);
  assert.match(c.motivo, /otra página/);
});

test("sin poder leer la campaña no se confirma nada", () => {
  const c = evaluarCompatibilidadBoost(POST, null, null);
  assert.equal(c.campana, false);
  assert.equal(c.conjunto, false);
  assert.match(c.motivo, /No se pudo leer/);
});

test("un id de publicación mal formado se rechaza antes de mirar la campaña", () => {
  const c = evaluarCompatibilidadBoost("basura", CAMPANA_INTERACCION, null);
  assert.equal(c.campana, false);
  assert.match(c.motivo, /formato/);
});
