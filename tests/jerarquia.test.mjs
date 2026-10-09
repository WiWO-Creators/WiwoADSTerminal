import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { nivelDeCargo, puedeModificarPorJerarquia, etiquetaDeCargo } = await import("../lib/jerarquia-pura.ts");

test("la jerarquía va Admin > Director > Director Digital > Digital Lead > Digital Creator", () => {
  const orden = ["Admin", "Director", "Director Digital", "Digital Lead", "Digital Creator"].map(nivelDeCargo);
  assert.deepEqual([...orden].sort((a, b) => b - a), orden);
  assert.equal(new Set(orden).size, 5);
  assert.equal(nivelDeCargo("Super Admin"), nivelDeCargo("Admin"));
  assert.equal(nivelDeCargo("Paid Media"), nivelDeCargo("Director Digital"));
  assert.equal(nivelDeCargo(null), 0);
});

test("solo se modifica a quien está por debajo; un Admin puede con cualquiera", () => {
  assert.equal(puedeModificarPorJerarquia("Admin", "Admin"), true);
  assert.equal(puedeModificarPorJerarquia("Director", "Director Digital"), true);
  assert.equal(puedeModificarPorJerarquia("Director", "Director"), false);
  assert.equal(puedeModificarPorJerarquia("Director Digital", "Director"), false);
  assert.equal(puedeModificarPorJerarquia("Director Digital", "Digital Lead"), true);
  assert.equal(puedeModificarPorJerarquia(null, "Digital Creator"), false);
});

test("cada cargo se muestra con el nombre del equipo, y sin cargo se usa el rol", () => {
  assert.equal(etiquetaDeCargo("admin", "Super Admin"), "Admin");
  assert.equal(etiquetaDeCargo("admin", "Director"), "Director");
  assert.equal(etiquetaDeCargo("admin", "Paid Media"), "Director Digital");
  assert.equal(etiquetaDeCargo("supervisor", "Digital Lead"), "Digital Lead");
  assert.equal(etiquetaDeCargo("analyst", "Digital Creator"), "Digital Creator");
  assert.equal(etiquetaDeCargo("analyst", null), "Digital Creator");
  assert.equal(etiquetaDeCargo("admin", null), "Admin");
});
