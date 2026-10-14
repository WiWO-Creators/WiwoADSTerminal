import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { estadoDeConexion, resumenDeConexiones } = await import("../lib/conexiones-equipo-pura.ts");

const E = (o) => ({ proveedor: "google", habilitada: true, falta: [], conectada: true, porVencer: false, diasRestantes: null, ...o });

test("una conexión activa no avisa nada", () => {
  const r = resumenDeConexiones([E({}), E({ proveedor: "meta" }), E({ proveedor: "linkedin" })], false);
  assert.equal(r.todoBien, true);
  assert.ok(r.conexiones.every((c) => c.estado === "ok" && c.accion === ""));
});

test("sin conectar: quien administra recibe qué hacer y quien no, a quién avisar", () => {
  const admin = estadoDeConexion(E({ conectada: false }), true);
  const otro = estadoDeConexion(E({ conectada: false }), false);
  assert.equal(admin.activa, false);
  assert.match(admin.accion, /Conéctalo ahora en Cuentas/);
  assert.match(otro.accion, /Avisa a un administrador/);
  assert.match(otro.mensaje, /no está conectado para el equipo/);
  assert.doesNotMatch(otro.accion, /Cuentas/);
});

test("sin habilitar en el servidor: el detalle técnico solo lo ve quien administra", () => {
  const e = E({ proveedor: "google", habilitada: false, falta: ["credenciales OAuth", "developer token de Google Ads"], conectada: false });
  const admin = estadoDeConexion(e, true);
  const otro = estadoDeConexion(e, false);
  assert.equal(admin.estado, "sin_habilitar");
  assert.deepEqual(admin.falta, ["credenciales OAuth", "developer token de Google Ads"]);
  assert.match(admin.accion, /developer token/);
  assert.deepEqual(otro.falta, []);
  assert.match(otro.accion, /equipo de plataforma/);
});

test("por vencer sigue activa pero avisa con los días", () => {
  const c = estadoDeConexion(E({ proveedor: "linkedin", porVencer: true, diasRestantes: 6 }), true);
  assert.equal(c.activa, true);
  assert.equal(c.estado, "por_vencer");
  assert.match(c.mensaje, /vence en 6 días/);
  assert.match(estadoDeConexion(E({ porVencer: true, diasRestantes: -2 }), false).mensaje, /venció/);
  assert.match(estadoDeConexion(E({ porVencer: true, diasRestantes: 1 }), false).mensaje, /1 día\b/);
});

test("lo que se pierde se dice en lo que la persona hace", () => {
  assert.match(estadoDeConexion(E({ proveedor: "google", conectada: false }), false).mensaje, /anuncios de Google/);
  assert.match(estadoDeConexion(E({ proveedor: "linkedin", conectada: false }), false).mensaje, /campañas de LinkedIn/);
  assert.match(estadoDeConexion(E({ proveedor: "meta", habilitada: false, conectada: false }), false).mensaje, /Meta/);
});
