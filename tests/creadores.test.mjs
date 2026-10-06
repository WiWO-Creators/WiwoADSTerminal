import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { entidadesCreadas, mapaDeCreadores, nombreCorto, claveDeCreador } = await import("../lib/creadores.ts");

const paso = (platform, action, raw, ok = true) => ({ platform, action, ok, raw });

test("solo cuentan los pasos de creación que salieron bien y dejaron un id", () => {
  const creadas = entidadesCreadas([
    paso("meta", "create_campaign", { campaign_id: "111" }),
    paso("meta", "create_adset", { adset_id: "222" }),
    paso("meta", "create_ad", { ad_id: "333" }),
    paso("meta", "update_campaign", { campaign_id: "999" }),
    paso("google", "create_campaign", { campaign_id: "555" }, false),
    paso("google", "create_ad_group", {}),
  ]);
  assert.deepEqual(creadas, [
    { provider: "meta", nivel: "campana", id: "111" },
    { provider: "meta", nivel: "conjunto", id: "222" },
    { provider: "meta", nivel: "anuncio", id: "333" },
  ]);
});

test("el creador es quien publicó primero; un reintento no lo reemplaza", () => {
  const nombres = new Map([["ana@x.cl", "Ana Pérez"], ["luis@x.cl", "Luis Soto"]]);
  const mapa = mapaDeCreadores(
    [
      { actorEmail: "luis@x.cl", creadaEn: 2000, pasos: [paso("google", "create_campaign", { campaign_id: "7" })] },
      { actorEmail: "ana@x.cl", creadaEn: 1000, pasos: [paso("google", "create_campaign", { campaign_id: "7" })] },
    ],
    nombres,
  );
  const c = mapa[claveDeCreador("google", "campana", "7")];
  assert.equal(c.nombre, "Ana P.");
  assert.equal(c.creadoEn, 1000);
});

test("agregar un conjunto a una campaña ajena no te hace creador de la campaña", () => {
  const mapa = mapaDeCreadores(
    [{ actorEmail: "luis@x.cl", creadaEn: 1, pasos: [paso("meta", "create_adset", { adset_id: "9" })] }],
    new Map(),
  );
  assert.deepEqual(Object.keys(mapa), ["meta:conjunto:9"]);
});

test("nombre corto: primer nombre + inicial; sin nombre, la parte local del correo", () => {
  assert.equal(nombreCorto("Amaro Veas", "a@x.cl"), "Amaro V.");
  assert.equal(nombreCorto("Tech", "t@x.cl"), "Tech");
  assert.equal(nombreCorto(null, "hola@wiwo.me"), "hola");
  assert.equal(nombreCorto("hola@wiwo.me", "hola@wiwo.me"), "hola");
});
