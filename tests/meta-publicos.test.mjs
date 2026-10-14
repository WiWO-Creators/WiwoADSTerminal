import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { cuerpoDelPublico, eventoDeVideo, problemasDelPublico } = await import("../lib/meta-publicos-pura.ts");

test("los públicos de interacción no llevan subtype (con ENGAGEMENT Meta rechaza la regla) y piden prefill", () => {
  const c = cuerpoDelPublico({ tipo: "pagina", nombre: "COL – Interacción FB", dias: 30, pageId: "123456" });
  assert.equal("subtype" in c, false);
  assert.equal(c.prefill, 1);
  const r = c.rule.inclusions.rules[0];
  assert.deepEqual(r.event_sources, [{ id: "123456", type: "page" }]);
  assert.equal(r.retention_seconds, 30 * 86400);
  assert.deepEqual(r.filter.filters, [{ field: "event", operator: "eq", value: "page_engaged" }]);
});

test("Instagram usa su propia fuente y el video usa la página con el evento del porcentaje", () => {
  const ig = cuerpoDelPublico({ tipo: "instagram", nombre: "COL – IG", dias: 30, instagramId: "178414" });
  assert.deepEqual(ig.rule.inclusions.rules[0].event_sources, [{ id: "178414", type: "ig_business" }]);
  const v = cuerpoDelPublico({ tipo: "video", nombre: "COL – Video 25%", dias: 30, pageId: "123456", porcentaje: 25 });
  assert.equal(v.rule.inclusions.rules[0].filter.filters[0].value, "video_view_25_percent");
  assert.equal(eventoDeVideo(3), "video_watched");
  assert.equal(eventoDeVideo(100), "video_completed");
});

test("«abrieron el formulario y no lo enviaron» incluye a quienes lo abrieron y excluye a quienes lo enviaron", () => {
  const c = cuerpoDelPublico({ tipo: "formulario", nombre: "COL – Abrieron sin enviar", dias: 30, formularioId: "999888", quien: "abrieron_sin_enviar" });
  assert.equal(c.rule.inclusions.rules[0].filter.filters[0].value, "lead_generation_opened");
  assert.equal(c.rule.exclusions.rules[0].filter.filters[0].value, "lead_generation_submitted");
  assert.deepEqual(c.rule.exclusions.rules[0].event_sources, [{ id: "999888", type: "lead" }]);
  const e = cuerpoDelPublico({ tipo: "formulario", nombre: "COL – Leads", dias: 90, formularioId: "999888", quien: "enviaron" });
  assert.equal("exclusions" in e.rule, false);
});

test("los públicos con datos que no sirven no se crean", () => {
  assert.ok(problemasDelPublico({ tipo: "pagina", nombre: "ab", dias: 30, pageId: "1" }).some((p) => /nombre/.test(p)));
  assert.ok(problemasDelPublico({ tipo: "pagina", nombre: "Público", dias: 400, pageId: "1" }).some((p) => /1 y 365/.test(p)));
  assert.ok(problemasDelPublico({ tipo: "formulario", nombre: "Público", dias: 120, formularioId: "1", quien: "enviaron" }).some((p) => /1 y 90/.test(p)));
  assert.ok(problemasDelPublico({ tipo: "formulario", nombre: "Público", dias: 30, formularioId: "x", quien: "enviaron" }).some((p) => /formulario/.test(p)));
  assert.deepEqual(problemasDelPublico({ tipo: "video", nombre: "Público", dias: 30, pageId: "123", porcentaje: 25 }), []);
});
