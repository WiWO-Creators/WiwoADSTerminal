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

const { tocaPresupuesto } = await import("../lib/edicion-plan.ts");
const { roleCan } = await import("../lib/permisos.ts");

test("un cambio toca presupuesto si cambia el presupuesto o el tope de gasto; el nombre no", () => {
  assert.equal(tocaPresupuesto({ presupuesto: { tipo: "daily", monto: 500 } }), true);
  assert.equal(tocaPresupuesto({ limiteGasto: 1000 }), true);
  assert.equal(tocaPresupuesto({ nombre: "Otro nombre", puja: 2 }), false);
});

test("solo los administradores aprueban cambios de presupuesto; los supervisores aprueban el resto", () => {
  assert.equal(roleCan("admin", "aprobar_presupuesto"), true);
  assert.equal(roleCan("supervisor", "aprobar_presupuesto"), false);
  assert.equal(roleCan("analyst", "aprobar_presupuesto"), false);
  assert.equal(roleCan("supervisor", "aprobar_cambios"), true);
  assert.equal(roleCan("analyst", "aprobar_cambios"), false);
});


test("un cambio rechazado dice que todo quedó como estaba; uno pendiente, que nada se modificó", () => {
  const base = { creadorNombre: "Álvaro", revisorNombre: "Franz", notaDeRevision: null, titulo: "x", error: null, esEdicion: true };
  assert.match(mensajeParaElCreador({ ...base, estado: "rechazada" }, []), /todo quedó tal como estaba/);
  assert.match(mensajeParaElCreador({ ...base, estado: "pendiente" }, ["Franz"]), /nada se modificó todavía.*Franz/);
  assert.match(mensajeParaElCreador({ ...base, estado: "publicada" }, []), /ya se aplicó/);
});

const { esCargoProtegido } = await import("../lib/permisos.ts");

test("los jefes (Director y Director creativo) están protegidos; Director Digital y Digital Lead no", () => {
  assert.equal(esCargoProtegido("Director"), true);
  assert.equal(esCargoProtegido("director creativo"), true);
  assert.equal(esCargoProtegido("Director Digital"), false);
  assert.equal(esCargoProtegido("Digital Lead"), false);
  assert.equal(esCargoProtegido(null), false);
});
