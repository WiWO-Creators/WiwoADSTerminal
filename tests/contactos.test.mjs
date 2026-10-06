import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { parsearContactos, normalizarEmail, normalizarTelefono, enLotes, csvParaMeta, sha256Hex, enmascarar } =
  await import("../lib/contactos.ts");

test("emails: se limpian y se validan", () => {
  assert.equal(normalizarEmail("  Ana@Correo.CL "), "ana@correo.cl");
  assert.equal(normalizarEmail("sin-arroba"), null);
  assert.equal(normalizarEmail("a@b"), null);
  assert.equal(normalizarEmail(""), null);
  assert.equal(normalizarEmail(null), null);
});

test("teléfonos: Chile por defecto; otros países exigen «+»", () => {
  assert.equal(normalizarTelefono("9 1234 5678"), "+56912345678");
  assert.equal(normalizarTelefono("+56 9 1234 5678"), "+56912345678");
  assert.equal(normalizarTelefono("56912345678"), "+56912345678");
  assert.equal(normalizarTelefono("0912345678"), "+56912345678");
  assert.equal(normalizarTelefono("0056912345678"), "+56912345678");
  assert.equal(normalizarTelefono("+51 987 654 321"), "+51987654321");
  assert.equal(normalizarTelefono("12345"), null);
  assert.equal(normalizarTelefono("abc"), null);
  assert.equal(normalizarTelefono(""), null);
});

test("CSV con encabezados: usa las columnas por su nombre", () => {
  const r = parsearContactos("nombre;Correo;Teléfono\nAna;ana@x.cl;912345678\nLuis;luis@x.cl;\nSofi;;+56 9 8765 4321");
  assert.equal(r.filasLeidas, 3);
  assert.deepEqual(r.miembros, [
    { email: "ana@x.cl", phone_number: "+56912345678" },
    { email: "luis@x.cl" },
    { phone_number: "+56987654321" },
  ]);
  assert.equal(r.conEmail, 2);
  assert.equal(r.conTelefono, 2);
  assert.equal(r.invalidas, 0);
});

test("lista simple sin encabezados: detecta por el contenido", () => {
  const r = parsearContactos("persona@correo.com\n+56912345678\n987654321\n\nnada-valido\n");
  assert.equal(r.miembros.length, 3);
  assert.equal(r.invalidas, 1);
  assert.deepEqual(r.miembros[2], { phone_number: "+56987654321" });
});

test("duplicados: por correo (o teléfono si no hay correo), sin importar mayúsculas", () => {
  const r = parsearContactos("email\nA@x.cl\na@X.cl\nb@x.cl");
  assert.equal(r.miembros.length, 2);
  assert.equal(r.duplicadas, 1);
});

test("filas sin nada válido se cuentan como inválidas y no se suben", () => {
  const r = parsearContactos("email,telefono\nmalo,123\nbueno@x.cl,");
  assert.equal(r.invalidas, 1);
  assert.equal(r.miembros.length, 1);
});

test("los ejemplos salen enmascarados: nunca el dato completo", () => {
  const r = parsearContactos("email,telefono\nana.perez@correo.cl,912345678");
  assert.equal(r.ejemplos[0], "a***@correo.cl  ·  +569****678");
  assert.ok(!r.ejemplos[0].includes("ana.perez"));
  assert.equal(enmascarar({ email: "x@y.cl" }), "x***@y.cl");
});

test("lotes de a 10.000 como máximo", () => {
  const lotes = enLotes(Array.from({ length: 25_000 }, (_, i) => i));
  assert.deepEqual(lotes.map((l) => l.length), [10_000, 10_000, 5_000]);
  assert.deepEqual(enLotes([]), []);
});

test("archivo para Meta: SHA-256 del correo en minúsculas y del teléfono sin «+»", async () => {
  assert.equal(
    await sha256Hex("test"),
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  );
  const csv = await csvParaMeta([{ email: "ana@x.cl", phone_number: "+56912345678" }, { email: "b@x.cl" }]);
  const [cabecera, f1, f2] = csv.split("\n");
  assert.equal(cabecera, "email,phone");
  assert.equal(f1, `${await sha256Hex("ana@x.cl")},${await sha256Hex("56912345678")}`);
  assert.equal(f2, `${await sha256Hex("b@x.cl")},`);
  assert.ok(!csv.includes("ana@x.cl"));
});
