import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { puedeTransicionar, mensajeParaElCreador, textoDeAlertaParaSupervisor, tituloDeSolicitud, puedeVerSolicitud, ESTADOS_QUE_AVISAN } =
  await import("../lib/solicitudes-pura.ts");

test("solo una solicitud pendiente se aprueba, rechaza o retira; solo una publicada pasa a activa", () => {
  for (const accion of ["aprobar", "rechazar", "cancelar"]) {
    assert.equal(puedeTransicionar(accion, "pendiente"), true);
    for (const e of ["rechazada", "cancelada", "publicada", "activa", "fallida"]) assert.equal(puedeTransicionar(accion, e), false);
  }
  assert.equal(puedeTransicionar("marcar_activa", "publicada"), true);
  assert.equal(puedeTransicionar("marcar_activa", "pendiente"), false);
  assert.equal(puedeTransicionar("inventada", "pendiente"), false);
});

test("el analista recibe los mensajes pedidos, con los nombres de los supervisores", () => {
  const base = { creadorNombre: "Ana", revisorNombre: "Luis", notaDeRevision: null, titulo: "un anuncio", error: null };
  assert.match(mensajeParaElCreador({ ...base, estado: "pendiente" }, ["Luis", "Marta"]), /enviada a revisión.*Luis, Marta/);
  assert.match(mensajeParaElCreador({ ...base, estado: "publicada" }, []), /pausada.*cuando esté activa/);
  assert.match(mensajeParaElCreador({ ...base, estado: "activa" }, []), /funcionando/);
  assert.match(mensajeParaElCreador({ ...base, estado: "rechazada", notaDeRevision: "falta el copy" }, []), /Luis la rechazó: falta el copy/);
});

test("«aprobada y funcionando» solo se avisa cuando está activa; pendiente y retirada no generan aviso", () => {
  assert.equal(ESTADOS_QUE_AVISAN.has("activa"), true);
  assert.equal(ESTADOS_QUE_AVISAN.has("pendiente"), false);
  assert.equal(ESTADOS_QUE_AVISAN.has("cancelada"), false);
});

test("la alerta del supervisor dice quién quiere subir qué y adónde", () => {
  assert.equal(
    textoDeAlertaParaSupervisor({ creadorNombre: "Ana", titulo: "2 anuncios impulsados" }, "Giveaway · Anker"),
    "Ana quiere subir 2 anuncios impulsados a Giveaway · Anker.",
  );
});

test("el título distingue anuncio, conjunto y campaña", () => {
  const d = { name: "Colbún Q4", existingCampaign: null, existingAdset: null, boostPostId: null, platforms: ["meta"] };
  assert.match(tituloDeSolicitud(d), /campaña/);
  assert.equal(tituloDeSolicitud({ ...d, existingCampaign: { campaignName: "x" } }), "un conjunto de anuncios");
  assert.equal(tituloDeSolicitud({ ...d, existingCampaign: { campaignName: "x" }, existingAdset: { adsetName: "y" }, boostPostId: "1" }, 3), "3 anuncios impulsados");
});

test("quien creó la solicitud la ve; quien revisa solo si el cliente está a su alcance", () => {
  const o = { email: "a@x", esRevisor: false, creadorEmail: "a@x", clienteEnAlcance: false };
  assert.equal(puedeVerSolicitud(o), true);
  assert.equal(puedeVerSolicitud({ ...o, email: "b@x" }), false);
  assert.equal(puedeVerSolicitud({ ...o, email: "b@x", esRevisor: true, clienteEnAlcance: true }), true);
  assert.equal(puedeVerSolicitud({ ...o, email: "b@x", esRevisor: true, clienteEnAlcance: false }), false);
});
