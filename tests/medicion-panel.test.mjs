import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { hallazgosPorSeveridad, resumenDePanel, tendenciaDeLeads, tipoDeEvento } = await import("../lib/medicion-panel-pura.ts");
const { evaluarMedicion } = await import("../lib/medicion.ts");

const EVENTOS = [
  { nombre: "page_view", eventos: 1000, clave: 0 },
  { nombre: "scroll", eventos: 400, clave: 0 },
  { nombre: "form_submit", eventos: 60, clave: 60 },
  { nombre: "whatsapp_click", eventos: 30, clave: 30 },
  { nombre: "purchase", eventos: 12, clave: 12 },
  { nombre: "file_download", eventos: 20, clave: 0 },
  { nombre: "otro_evento", eventos: 8, clave: 0 },
  { nombre: "sin_nada", eventos: 0, clave: 0 },
];

test("cada evento cae en un solo grupo", () => {
  assert.equal(tipoDeEvento(EVENTOS[0]), "navegacion");
  assert.equal(tipoDeEvento(EVENTOS[2]), "lead");
  assert.equal(tipoDeEvento(EVENTOS[4]), "clave");
  assert.equal(tipoDeEvento(EVENTOS[5]), "interaccion");
  assert.equal(tipoDeEvento(EVENTOS[6]), "otro");
});

test("el resumen suma todo, ordena por volumen y no cuenta los eventos sin datos", () => {
  const r = resumenDePanel(EVENTOS);
  assert.equal(r.total, 1530);
  assert.equal(r.conversiones, 102);
  assert.equal(r.distintos, 7);
  assert.equal(r.porTipo.reduce((s, t) => s + t.eventos, 0), r.total);
  assert.deepEqual(r.principales.slice(0, 2).map((e) => e.nombre), ["page_view", "scroll"]);
  assert.deepEqual(r.leads.map((e) => e.nombre), ["form_submit", "whatsapp_click", "purchase"]);
});

test("la tendencia compara por día la última semana con el promedio de 30 días", () => {
  const t = tendenciaDeLeads(
    [{ nombre: "form_submit", eventos: 300, clave: 300 }],
    [{ nombre: "form_submit", eventos: 140, clave: 140 }],
  );
  assert.equal(t.porDia30, 10);
  assert.equal(t.porDia7, 20);
  assert.equal(t.cambio, 100);
  assert.equal(tendenciaDeLeads([], null), null);
  assert.equal(tendenciaDeLeads([], []).cambio, null);
});

test("los hallazgos por severidad; sin hallazgos queda «sin problemas»", () => {
  assert.deepEqual(hallazgosPorSeveridad([]).map((x) => x.clave), ["ok"]);
  const h = hallazgosPorSeveridad([{ severidad: "alta" }, { severidad: "media" }, { severidad: "media" }]);
  assert.deepEqual(h.map((x) => [x.clave, x.cantidad]), [["alta", 1], ["media", 2]]);
});

test("evaluarMedicion entrega los eventos para el panel, los más voluminosos primero", () => {
  const r = evaluarMedicion(EVENTOS, EVENTOS);
  assert.equal(r.eventos[0].nombre, "page_view");
  assert.equal(r.eventos.some((e) => e.eventos === 0), false);
  assert.equal(r.eventos7.length, r.eventos.length);
});
