import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { cuerpoDelFormulario, esCalificado, FORMULARIO_COLOMBIA, leadDesdeApi, problemasDelFormulario, REGLA_COLOMBIA, resumenDeLeads } = await import("../lib/meta-formularios-pura.ts");

const BASE = {
  nombre: "COL_LEADGEN_2026",
  tipo: "mayor_intencion",
  ...FORMULARIO_COLOMBIA,
  politicaUrl: "https://valordevelopment.com/privacidad",
  gracias: { titulo: "Gracias", cuerpo: "Un asesor te contactará.", botonTexto: "Ver proyectos", botonUrl: "https://valordevelopment.com" },
};

test("el formulario de Colombia es válido y se arma como mayor intención con sus 3 preguntas y el contacto", () => {
  assert.deepEqual(problemasDelFormulario(BASE), []);
  const c = cuerpoDelFormulario(BASE);
  assert.equal(c.is_optimized_for_quality, true);
  assert.equal(c.locale, "ES_LA");
  const q = c.questions;
  assert.deepEqual(q.slice(0, 3).map((x) => x.key), ["inversion", "plazo", "proposito"]);
  assert.deepEqual(q.slice(3).map((x) => x.type), ["FULL_NAME", "EMAIL", "PHONE", "CITY"]);
  assert.equal(q[0].options.length, 4);
});

test("más volumen no pide revisión antes de enviar", () => {
  assert.equal(cuerpoDelFormulario({ ...BASE, tipo: "mas_volumen" }).is_optimized_for_quality, false);
});

test("un formulario sin política https, sin contacto o con una pregunta de una sola respuesta no se crea", () => {
  assert.ok(problemasDelFormulario({ ...BASE, politicaUrl: "http://x.com/p" }).some((p) => /privacidad/.test(p)));
  assert.ok(problemasDelFormulario({ ...BASE, contacto: ["nombre"] }).some((p) => /correo o teléfono/.test(p)));
  assert.ok(problemasDelFormulario({ ...BASE, preguntas: [{ clave: "q", etiqueta: "¿?", opciones: [{ clave: "a", texto: "A" }] }] }).some((p) => /al menos 2/.test(p)));
  assert.ok(problemasDelFormulario({ ...BASE, preguntas: [{ ...BASE.preguntas[0] }, { ...BASE.preguntas[0] }] }).some((p) => /repetida/.test(p)));
});

const L = (r) => ({ id: "1", creado: null, respuestas: r });

test("calificado = rango definido + plazo de hasta 12 meses; solo explorando o más de 12 meses no califican", () => {
  assert.equal(esCalificado(L({ inversion: "250k_500k", plazo: "3_a_12" }), REGLA_COLOMBIA), true);
  assert.equal(esCalificado(L({ inversion: "mas_1m", plazo: "3_meses" }), REGLA_COLOMBIA), true);
  assert.equal(esCalificado(L({ inversion: "mas_1m", plazo: "explorando" }), REGLA_COLOMBIA), false);
  assert.equal(esCalificado(L({ inversion: "mas_1m", plazo: "mas_12" }), REGLA_COLOMBIA), false);
  assert.equal(esCalificado(L({ plazo: "3_meses" }), REGLA_COLOMBIA), false, "una respuesta que falta no cumple");
});

test("el resumen cuenta calificados y el porcentaje; sin leads no hay porcentaje", () => {
  const r = resumenDeLeads([L({ inversion: "mas_1m", plazo: "3_meses" }), L({ inversion: "mas_1m", plazo: "explorando" }), L({ inversion: "hasta_250k", plazo: "3_a_12" }), L({})], REGLA_COLOMBIA);
  assert.deepEqual(r, { total: 4, calificados: 2, porcentaje: 50 });
  assert.equal(resumenDeLeads([], REGLA_COLOMBIA).porcentaje, null);
  assert.equal(esCalificado(L({ plazo: "3_meses" }), []), false);
});

test("un lead de la API se lee por clave de pregunta", () => {
  const l = leadDesdeApi({ id: "9", created_time: "2026-10-01", field_data: [{ name: "plazo", values: ["3_a_12"] }, { name: "email", values: ["a@b.c"] }] });
  assert.equal(l.respuestas.plazo, "3_a_12");
  assert.equal(l.id, "9");
});

const { cuerpoDeConjunto, cuerpoDeCreativo, problemasDelConjuntoDeFormulario, problemasDelCreativo } = await import("../lib/meta-lead-ads-pura.ts");

const CONJ = { campaignId: "123", nombre: "Bogotá", pageId: "999", presupuesto: { tipo: "total", menor: 95000 }, inicio: null, fin: "2026-12-10", targeting: { geo_locations: { countries: ["CO"] } }, estado: "ACTIVE" };

test("el conjunto de formulario usa destino en el anuncio, optimiza a leads y fija presupuesto total con fecha de fin", () => {
  assert.deepEqual(problemasDelConjuntoDeFormulario(CONJ), []);
  const c = cuerpoDeConjunto(CONJ);
  assert.equal(c.destination_type, "ON_AD");
  assert.equal(c.optimization_goal, "LEAD_GENERATION");
  assert.deepEqual(c.promoted_object, { page_id: "999" });
  assert.equal(c.lifetime_budget, 95000);
  assert.equal("daily_budget" in c, false);
  assert.equal(c.end_time, "2026-12-10T23:59:00");
  assert.equal("start_time" in c, false, "sin fecha de inicio arranca al publicar");
});

test("una fecha de inicio programa el conjunto (retargeting en la semana 5)", () => {
  assert.equal(cuerpoDeConjunto({ ...CONJ, inicio: "2026-11-09" }).start_time, "2026-11-09T00:00:00");
  assert.ok(problemasDelConjuntoDeFormulario({ ...CONJ, inicio: "2026-12-20" }).some((p) => /anterior/.test(p)));
});

test("presupuesto total sin fecha de fin, sin página o sin presupuesto no se crea", () => {
  assert.ok(problemasDelConjuntoDeFormulario({ ...CONJ, fin: null }).some((p) => /fecha de finalización/.test(p)));
  assert.ok(problemasDelConjuntoDeFormulario({ ...CONJ, pageId: "" }).some((p) => /página/.test(p)));
  assert.ok(problemasDelConjuntoDeFormulario({ ...CONJ, presupuesto: { tipo: "total", menor: 0 } }).some((p) => /mayor que cero/.test(p)));
  assert.deepEqual(problemasDelConjuntoDeFormulario({ ...CONJ, presupuesto: null }), [], "con presupuesto de campaña el conjunto no lleva presupuesto");
});

const CREA = { nombre: "Anuncio 1", pageId: "999", formularioId: "555", enlace: "https://valordevelopment.com", mensaje: "Hola", imageHash: "abc" };

test("el creativo lleva el formulario en el botón y la página como enlace", () => {
  assert.deepEqual(problemasDelCreativo(CREA), []);
  const c = cuerpoDeCreativo({ ...CREA, titulo: "Título" });
  const d = c.object_story_spec.link_data;
  assert.deepEqual(d.call_to_action, { type: "SIGN_UP", value: { lead_gen_form_id: "555" } });
  assert.equal(d.link, "https://valordevelopment.com");
  assert.equal(d.image_hash, "abc");
  assert.equal(d.name, "Título");
});

test("un video usa video_data con su miniatura; sin imagen ni video, o con un botón que no sirve, no se crea", () => {
  const v = cuerpoDeCreativo({ ...CREA, imageHash: undefined, video: { id: "77", miniaturaUrl: "https://x/y.jpg" } });
  assert.equal(v.object_story_spec.video_data.video_id, "77");
  assert.equal(v.object_story_spec.video_data.call_to_action.value.lead_gen_form_id, "555");
  assert.ok(problemasDelCreativo({ ...CREA, imageHash: undefined }).some((p) => /imagen o el video/.test(p)));
  assert.ok(problemasDelCreativo({ ...CREA, boton: "SHOP_NOW" }).some((p) => /no sirve/.test(p)));
  assert.ok(problemasDelCreativo({ ...CREA, formularioId: "" }).some((p) => /formulario/.test(p)));
  assert.ok(problemasDelCreativo({ ...CREA, enlace: "https://www.facebook.com/999" }).length === 0, "la validez del sitio la decide Meta");
  assert.ok(problemasDelCreativo({ ...CREA, enlace: "" }).some((p) => /URL de destino/.test(p)));
});
