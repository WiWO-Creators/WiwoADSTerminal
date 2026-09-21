import assert from "node:assert/strict";
import test from "node:test";

import { firmarSesion, verificarSesion } from "../lib/sesion-firmada.ts";

const SECRETO = "secreto-de-prueba-uno";

test("una sesión firmada vuelve a dar el mismo correo", async () => {
  const valor = await firmarSesion("Ana@Empresa.com", SECRETO);
  assert.equal(await verificarSesion(valor, SECRETO), "ana@empresa.com");
});

test("el correo suelto (la cookie de antes) ya no sirve", async () => {
  assert.equal(await verificarSesion("admin@empresa.com", SECRETO), null);
});

test("una firma hecha con otro secreto se rechaza", async () => {
  const valor = await firmarSesion("ana@empresa.com", "otro-secreto");
  assert.equal(await verificarSesion(valor, SECRETO), null);
});

test("cambiar el correo dentro de una sesión válida rompe la firma", async () => {
  const valor = await firmarSesion("ana@empresa.com", SECRETO);
  const [, vence, firma] = valor.split(".");
  const admin = Buffer.from("admin@empresa.com").toString("base64url");
  assert.equal(await verificarSesion(`${admin}.${vence}.${firma}`, SECRETO), null);
});

test("alargar el vencimiento rompe la firma", async () => {
  const valor = await firmarSesion("ana@empresa.com", SECRETO);
  const [correo, vence, firma] = valor.split(".");
  assert.equal(
    await verificarSesion(`${correo}.${Number(vence) + 99999}.${firma}`, SECRETO),
    null,
  );
});

test("una sesión vencida se rechaza", async () => {
  const hace13Horas = Date.now() - 13 * 60 * 60 * 1000;
  const valor = await firmarSesion("ana@empresa.com", SECRETO, hace13Horas);
  assert.equal(await verificarSesion(valor, SECRETO), null);
});

test("sin secreto no hay sesión que valga", async () => {
  const valor = await firmarSesion("ana@empresa.com", SECRETO);
  assert.equal(await verificarSesion(valor, ""), null);
  assert.equal(await verificarSesion(undefined, SECRETO), null);
});
