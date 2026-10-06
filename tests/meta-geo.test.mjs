import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { interpretarLugaresDeMeta, lugarDeMetaPara } = await import("../lib/meta-geo.ts");

const RESPUESTA = {
  data: [
    { key: "672", name: "Maule", type: "region", country_code: "CL", country_name: "Chile" },
    { key: "2451234", name: "Talca", type: "city", country_code: "CL", region: "Maule" },
    { key: "999", name: "Maule", type: "region", country_code: "FR" },
    { name: "sin key", type: "region", country_code: "CL" },
  ],
};

test("se interpretan solo las filas completas del tipo pedido", () => {
  const regiones = interpretarLugaresDeMeta(RESPUESTA, "region");
  assert.deepEqual(regiones.map((r) => r.key), ["672", "999"]);
  assert.equal(interpretarLugaresDeMeta(RESPUESTA, "city")[0].region, "Maule");
  assert.deepEqual(interpretarLugaresDeMeta(null, "region"), []);
});

test("el lugar de Meta se empareja por país y nombre, sin tildes, y no se adivina con ambigüedad", () => {
  const lugares = interpretarLugaresDeMeta(RESPUESTA, "region");
  assert.equal(lugarDeMetaPara(lugares, "Región del Maule", "CL").key, "672");
  assert.equal(lugarDeMetaPara(lugares, "Maule", "FR").key, "999");
  assert.equal(lugarDeMetaPara(lugares, "Atacama", "CL"), null);
  const dos = [
    { key: "1", nombre: "San Pedro", tipo: "city", countryCode: "CL", region: null },
    { key: "2", nombre: "San Pedro de la Paz", tipo: "city", countryCode: "CL", region: null },
  ];
  assert.equal(lugarDeMetaPara(dos, "San Pedro", "CL").key, "1"); // exacto gana
  assert.equal(lugarDeMetaPara(dos, "Pedro", "CL"), null); // dos parecidos: no se adivina
});
