import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { roleCan, matrizDeRoles } = await import("../lib/permisos.ts");

test("Cuentas conectadas y el plan técnico son solo de administración", () => {
  assert.equal(roleCan("admin", "ver_cuentas"), true);
  assert.equal(roleCan("admin", "ver_plan_tecnico"), true);
  for (const rol of ["supervisor", "analyst", "client"]) {
    assert.equal(roleCan(rol, "ver_cuentas"), false, rol);
    assert.equal(roleCan(rol, "ver_plan_tecnico"), false, rol);
  }
});

test("el supervisor conserva lo operativo: crear, aprobar y actualizar datos", () => {
  for (const c of ["crear_campanas", "aprobar_cambios", "administrar_conexiones"]) assert.equal(roleCan("supervisor", c), true, c);
  assert.equal(roleCan("analyst", "aprobar_cambios"), false);
});

test("la matriz de roles sale de las capacidades reales", () => {
  const filas = matrizDeRoles();
  const cuentas = filas.find((f) => /Cuentas conectadas/.test(f.texto));
  assert.deepEqual(cuentas.roles, { admin: true, supervisor: false, analyst: false, client: false });
  const modificar = filas.find((f) => /Modificar el rol/.test(f.texto));
  assert.equal(modificar.roles.admin, true);
  assert.equal(modificar.roles.supervisor, false);
});
