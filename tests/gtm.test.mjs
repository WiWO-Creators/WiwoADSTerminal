import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { generarAlertas } = await import("../lib/alertas.ts");
const { esGtmEstado, normalizarContenedor, TEXTO_SIN_GTM } = await import("../lib/gtm.ts");

const cliente = (id, gtmEstado) => ({
  id,
  name: `Cliente ${id}`,
  accountIds: [],
  targetCpaMicros: null,
  gtmEstado,
  gtmContainerId: null,
});

test("un cliente marcado sin GTM genera la alerta «NO cuenta con GTM», aun sin campañas", () => {
  const alertas = generarAlertas([cliente("colbun", "no_tiene")], []);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].id, "sin-gtm-colbun");
  assert.equal(alertas[0].clienteId, "colbun");
  assert.equal(alertas[0].plataforma, null);
  assert.equal(alertas[0].accion, null);
  assert.match(alertas[0].diagnostico, new RegExp(`^${TEXTO_SIN_GTM}`));
});

test("con GTM, o sin verificar, no se alerta: no se afirma lo que nadie confirmó", () => {
  assert.deepEqual(generarAlertas([cliente("a", "tiene")], []), []);
  assert.deepEqual(generarAlertas([cliente("b", null)], []), []);
  assert.deepEqual(generarAlertas([cliente("c", undefined)], []), []);
});

test("solo alertan los clientes sin GTM cuando hay varios", () => {
  const alertas = generarAlertas([cliente("a", "tiene"), cliente("b", "no_tiene"), cliente("c", null)], []);
  assert.deepEqual(alertas.map((a) => a.clienteId), ["b"]);
});

test("estados y contenedores válidos", () => {
  assert.equal(esGtmEstado("tiene"), true);
  assert.equal(esGtmEstado("no_tiene"), true);
  assert.equal(esGtmEstado("quizas"), false);
  assert.equal(esGtmEstado(null), false);
  assert.equal(normalizarContenedor("gtm-wq69rjq"), "GTM-WQ69RJQ");
  assert.equal(normalizarContenedor(" GTM-5FL5C3Z5 "), "GTM-5FL5C3Z5");
  assert.equal(normalizarContenedor("UA-123-1"), null);
  assert.equal(normalizarContenedor("GTM-"), null);
  assert.equal(normalizarContenedor(""), null);
  assert.equal(normalizarContenedor(null), null);
});
