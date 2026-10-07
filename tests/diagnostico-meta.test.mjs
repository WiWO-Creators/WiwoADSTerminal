import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { veredicto } = await import("../lib/diagnostico-meta-pura.ts");
const p = (llave, ve, tareas, puede) => ({ llave, ve, tareas, puede });

test("Anker antes: una llave ve la cuenta sin poder editar y la otra no ve la página → problema", () => {
  const cuenta = [p(1, true, [], false), p(2, true, ["MANAGE"], true)];
  const pagina = [p(1, true, ["ADVERTISE"], true), p(2, false, [], false)];
  const v = veredicto(cuenta, pagina, true);
  assert.equal(v.estado, "problema");
  assert.deepEqual(v.llavesCompletas, []);
  assert.match(v.mensaje, /a la vez permiso en la cuenta y en la página/);
});

test("una llave con permiso en la cuenta y en la página → ok", () => {
  const v = veredicto([p(1, true, [], false), p(2, true, ["MANAGE"], true)], [p(1, true, ["ADVERTISE"], true), p(2, true, ["ADVERTISE"], true)], true);
  assert.equal(v.estado, "ok");
  assert.deepEqual(v.llavesCompletas, [2]);
});

test("nadie ve la cuenta, o solo la ven sin poder editar → problema con mensaje claro", () => {
  assert.match(veredicto([p(1, false, [], false)], [], true).mensaje, /Ninguna llave ve esta cuenta/);
  assert.match(veredicto([p(1, true, [], false)], [p(1, true, ["ADVERTISE"], true)], true).mensaje, /rol de anunciante/);
});

test("sin página asociada se puede editar pero se avisa que no hay anuncios desde publicaciones", () => {
  const v = veredicto([p(1, true, ["ADVERTISE"], true)], [p(1, false, [], false)], false);
  assert.equal(v.estado, "advertencia");
  assert.deepEqual(v.llavesCompletas, [1]);
});
