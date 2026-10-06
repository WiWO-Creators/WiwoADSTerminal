import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { evaluarMedicion, esEventoDeLead } = await import("../lib/medicion.ts");
const { normalizarNombreDeEvento } = await import("../lib/nombres-de-evento.ts");

const ev = (nombre, eventos, clave = 0) => ({ nombre, eventos, clave });
const ids = (r) => r.hallazgos.map((h) => h.id);

// Los eventos reales de Colbun.cl - GA4 (últimos 30 días, 2026-09-30).
const COLBUN = [
  ev("page_view", 45071, 45063), ev("user_engagement", 26125, 26124), ev("session_start", 21230),
  ev("first_visit", 14070), ev("scroll", 8609), ev("click", 3530), ev("file_download", 3282, 3282),
  ev("menu_click", 2202), ev("video_caso_exito", 498, 498), ev("video_progress", 104, 104),
  ev("conversemos esp", 67, 67), ev("contacto_salesforce", 19, 19), ev("formulario_enviado", 18),
  ev("Contacto-salesforce", 9), ev("exito", 9), ev("Contacto_soluciones", 3),
];

test("el caso real de Colbún: navegación marcada como clave, leads sin marcar y duplicados", () => {
  const r = evaluarMedicion(COLBUN, null);
  assert.ok(ids(r).includes("clave_no_conversion"));
  assert.ok(ids(r).includes("clave_dudoso"));
  assert.ok(ids(r).includes("lead_sin_clave"));
  assert.ok(ids(r).includes("duplicados"));
  assert.equal(r.sano, false);
  const nav = r.hallazgos.find((h) => h.id === "clave_no_conversion");
  assert.deepEqual(nav.eventos, ["page_view", "user_engagement"]);
  const dup = r.hallazgos.find((h) => h.id === "duplicados");
  assert.deepEqual(dup.eventos.sort(), ["Contacto-salesforce", "contacto_salesforce"]);
  assert.equal(r.resumen.leadsMarcadosComoClave, 2); // contacto_salesforce y conversemos esp
});

test("una medición limpia no tiene hallazgos", () => {
  const r = evaluarMedicion(
    [ev("page_view", 1000), ev("session_start", 500), ev("generate_lead", 40, 40), ev("form_submit", 10, 10)],
    [ev("generate_lead", 10), ev("form_submit", 3)],
  );
  assert.deepEqual(r.hallazgos, []);
  assert.equal(r.sano, true);
});

test("sin ningún evento de lead, lo dice; no afirma que el sitio no tenga formulario", () => {
  const r = evaluarMedicion([ev("page_view", 1000), ev("scroll", 400)], null);
  const h = r.hallazgos.find((x) => x.id === "sin_evento_de_lead");
  assert.ok(h);
  assert.equal(h.severidad, "alta");
  assert.match(h.detalle, /no se pueden medir leads/);
  assert.match(h.detalle, /Tag Manager/);
});

test("sin marcar ninguno como clave es alta; si ya hay uno clave, media", () => {
  assert.equal(evaluarMedicion([ev("formulario_enviado", 20)], null).hallazgos[0].severidad, "alta");
  const r = evaluarMedicion([ev("formulario_enviado", 20), ev("contacto_web", 5, 5)], null);
  assert.equal(r.hallazgos.find((h) => h.id === "lead_sin_clave").severidad, "media");
});

test("un lead que dejó de llegar en la última semana alerta, pero solo con volumen previo", () => {
  const eventos = [ev("generate_lead", 30, 30)];
  assert.ok(ids(evaluarMedicion(eventos, [])).includes("lead_caido"));
  assert.ok(!ids(evaluarMedicion(eventos, [ev("generate_lead", 4)])).includes("lead_caido"));
  assert.ok(!ids(evaluarMedicion([ev("generate_lead", 3, 3)], [])).includes("lead_caido"));
  assert.ok(!ids(evaluarMedicion(eventos, null)).includes("lead_caido"));
});

test("sin datos en 30 días: el marcaje puede estar caído", () => {
  const r = evaluarMedicion([], null);
  assert.deepEqual(ids(r), ["sin_datos"]);
  assert.equal(r.sano, false);
  assert.equal(evaluarMedicion([ev("page_view", 0)], null).hallazgos[0].id, "sin_datos");
});

test("qué parece un lead", () => {
  for (const n of ["contacto_salesforce", "formulario_enviado", "generate_lead", "cotizar_ahora", "whatsapp_click", "conversemos esp"]) {
    assert.equal(esEventoDeLead(n), true, n);
  }
  for (const n of ["page_view", "click", "file_download", "video_start", "menu_click", "scroll", "banner_sucursalv"]) {
    assert.equal(esEventoDeLead(n), false, n);
  }
});

test("normalizar nombres: mayúsculas, tildes y separadores", () => {
  assert.equal(normalizarNombreDeEvento("Contacto-salesforce"), "contacto_salesforce");
  assert.equal(normalizarNombreDeEvento("Formulario Enviado"), "formulario_enviado");
  assert.equal(normalizarNombreDeEvento("Cotización"), "cotizacion");
});
