import assert from "node:assert/strict";
import test from "node:test";

import { DIMENSIONES, METRICAS, camposDeDesglose, dimensionesDe, etiquetaDeSegmento, filasDeDesglose } from "../lib/desglose.ts";

// Filas reales de Windsor (Colbún, campaña Concurso Maule, 2026-09).
const EDAD_GENERO = [
  { age: "18-24", gender: "female", spend: 4996, impressions: 17281, clicks: 29, reach: 7567 },
  { age: "25-34", gender: "female", spend: 7373, impressions: 25851, clicks: 96, reach: 11641 },
  { age: "65+", gender: "female", spend: 159, impressions: 725, clicks: 3, reach: 531 },
  { age: "18-24", gender: "male", spend: 10299, impressions: 36131, clicks: 66, reach: 13800 },
  { age: "25-34", gender: "male", spend: 22881, impressions: 78463, clicks: 244, reach: 29917 },
  { age: "Unknown", gender: "male", spend: 0, impressions: 1, clicks: 0, reach: 1 },
  { age: "18-24", gender: "unknown", spend: 138, impressions: 452, clicks: 1, reach: 254 },
];
const DISPOSITIVOS_GOOGLE = [
  { device: "DESKTOP", cost: 11609.5796, impressions: 5849, clicks: 1 },
  { device: "MOBILE", cost: 38736.8502, impressions: 34217, clicks: 40 },
  { device: "CONNECTED_TV", cost: 41096.0047, impressions: 22643, clicks: 0 },
];

test("cada plataforma pide los campos de su dimensión más sus métricas", () => {
  assert.deepEqual(camposDeDesglose("meta", "edad").slice(0, 1), ["age"]);
  assert.ok(camposDeDesglose("meta", "edad").includes("actions_lead"));
  // Los desgloses de Meta no admiten campos "omni": Windsor los rechaza con un 400.
  for (const d of ["edad", "genero", "red", "posicion", "dispositivo", "region", "edad_genero"]) {
    assert.ok(!camposDeDesglose("meta", d).some((c) => c.includes("omni")), d);
  }
  assert.ok(camposDeDesglose("google", "dispositivo").includes("cost"));
  assert.deepEqual(camposDeDesglose("meta", "edad_genero").slice(0, 2), ["age", "gender"]);
  assert.equal(camposDeDesglose("google", "edad"), null, "Google no ofrece edad por esta vía");
  assert.equal(camposDeDesglose("tiktok", "edad"), null);
});

test("Meta ofrece 7 desgloses y Google 4, cada uno con etiqueta", () => {
  assert.equal(dimensionesDe("meta").length, 7);
  assert.equal(dimensionesDe("google").length, 4);
  assert.deepEqual(dimensionesDe("desconocida"), []);
  for (const p of ["meta", "google"]) for (const d of dimensionesDe(p)) assert.ok(d.etiqueta);
});

test("etiquetas en español", () => {
  assert.equal(etiquetaDeSegmento("meta", "genero", { gender: "female" }), "Mujeres");
  assert.equal(etiquetaDeSegmento("meta", "genero", { gender: "male" }), "Hombres");
  assert.equal(etiquetaDeSegmento("meta", "genero", { gender: "unknown" }), "Sin dato");
  assert.equal(etiquetaDeSegmento("meta", "edad", { age: "Unknown" }), "Sin dato");
  assert.equal(etiquetaDeSegmento("meta", "red", { publisher_platform: "audience_network" }), "Audience Network");
  assert.equal(etiquetaDeSegmento("meta", "dispositivo", { device_platform: "mobile_app" }), "App móvil");
  assert.equal(etiquetaDeSegmento("google", "dispositivo", { device: "CONNECTED_TV" }), "TV conectada");
  assert.equal(etiquetaDeSegmento("google", "red", { ad_network_type: "SEARCH_PARTNERS" }), "Socios de búsqueda");
  assert.equal(etiquetaDeSegmento("google", "dia", { day_of_week: "WEDNESDAY" }), "Miércoles");
  assert.equal(etiquetaDeSegmento("google", "hora", { hour: "7" }), "07:00");
});

test("las posiciones no repiten el nombre de la red", () => {
  assert.equal(etiquetaDeSegmento("meta", "posicion", { publisher_platform: "instagram", platform_position: "instagram_stories" }), "Instagram · Historias");
  assert.equal(etiquetaDeSegmento("meta", "posicion", { publisher_platform: "facebook", platform_position: "facebook_reels" }), "Facebook · Reels");
  assert.equal(etiquetaDeSegmento("meta", "posicion", { publisher_platform: "facebook", platform_position: "feed" }), "Facebook · Feed");
  assert.equal(etiquetaDeSegmento("meta", "posicion", { publisher_platform: "facebook", platform_position: "algo_nuevo" }), "Facebook · Algo nuevo");
});

test("desglose por género: fusiona las filas de cada género y pondera el gasto", () => {
  const f = filasDeDesglose("meta", "genero", EDAD_GENERO);
  assert.deepEqual(f.map((x) => x.etiqueta), ["Hombres", "Mujeres", "Sin dato"], "por gasto, de mayor a menor");
  const hombres = f[0];
  assert.equal(hombres.gasto, 10299 + 22881 + 0);
  assert.equal(hombres.clics, 66 + 244);
  assert.ok(Math.abs(f.reduce((s, x) => s + x.pesoDelGasto, 0) - 1) < 1e-9, "los pesos suman 100%");
});

test("desglose por edad: orden natural (18-24, 25-34, 65+, sin dato), no por gasto", () => {
  const f = filasDeDesglose("meta", "edad", EDAD_GENERO);
  assert.deepEqual(f.map((x) => x.etiqueta), ["18-24", "25-34", "65+", "Sin dato"]);
});

test("desglose por edad y género: una fila por combinación, con la edad en orden", () => {
  const f = filasDeDesglose("meta", "edad_genero", EDAD_GENERO);
  assert.equal(f.length, 7);
  assert.ok(f[0].etiqueta.startsWith("18-24"));
  assert.ok(f.at(-1).etiqueta.startsWith("Sin dato"));
});

test("las métricas derivadas salen del segmento y no inventan lo que falta", () => {
  const f = filasDeDesglose("meta", "genero", EDAD_GENERO).find((x) => x.etiqueta === "Mujeres");
  assert.ok(f.ctr > 0 && f.ctr < 0.01);
  assert.ok(f.cpc > 0 && f.cpm > 0);
  assert.equal(f.resultados, null, "sin leads ni compras no hay resultado");
  assert.equal(f.costoPorResultado, null);
  const sinClics = filasDeDesglose("google", "dispositivo", DISPOSITIVOS_GOOGLE).find((x) => x.etiqueta === "TV conectada");
  assert.equal(sinClics.cpc, null, "0 clics no da un CPC infinito");
  assert.equal(sinClics.ctr, 0);
});

test("resultados: leads, luego compras, luego conversiones; y el costo por resultado los usa", () => {
  const meta = filasDeDesglose("meta", "genero", [{ gender: "male", spend: 1000, impressions: 100, clicks: 5, actions_lead: 4 }]);
  assert.equal(meta[0].resultados, 4);
  assert.equal(meta[0].costoPorResultado, 250);
  const compras = filasDeDesglose("meta", "genero", [{ gender: "male", spend: 900, impressions: 100, clicks: 5, actions_purchase: 3 }]);
  assert.equal(compras[0].costoPorResultado, 300);
  const google = filasDeDesglose("google", "dispositivo", [{ device: "MOBILE", cost: 500, impressions: 100, clicks: 5, conversions: 2 }]);
  assert.equal(google[0].costoPorResultado, 250);
});

test("el alcance es solo de Meta y no se suma entre filas del mismo segmento", () => {
  const f = filasDeDesglose("meta", "genero", [
    { gender: "male", spend: 1, impressions: 10, clicks: 1, reach: 100 },
    { gender: "male", spend: 1, impressions: 10, clicks: 1, reach: 80 },
  ]);
  assert.equal(f[0].alcance, 100, "las dos filas pueden ser las mismas personas");
  const g = filasDeDesglose("google", "dispositivo", DISPOSITIVOS_GOOGLE);
  assert.ok(g.every((x) => x.alcance === null));
});

test("Google: el gasto viene en cost, y los desgloses por día y hora van en orden natural", () => {
  const g = filasDeDesglose("google", "dispositivo", DISPOSITIVOS_GOOGLE);
  assert.equal(g[0].etiqueta, "TV conectada", "por gasto");
  const dias = filasDeDesglose("google", "dia", [
    { day_of_week: "SUNDAY", cost: 5, impressions: 1, clicks: 0 },
    { day_of_week: "MONDAY", cost: 1, impressions: 1, clicks: 0 },
    { day_of_week: "WEDNESDAY", cost: 9, impressions: 1, clicks: 0 },
  ]);
  assert.deepEqual(dias.map((x) => x.etiqueta), ["Lunes", "Miércoles", "Domingo"]);
  const horas = filasDeDesglose("google", "hora", [
    { hour: 14, cost: 1, impressions: 1, clicks: 0 },
    { hour: 2, cost: 9, impressions: 1, clicks: 0 },
    { hour: 9, cost: 5, impressions: 1, clicks: 0 },
  ]);
  assert.deepEqual(horas.map((x) => x.etiqueta), ["02:00", "09:00", "14:00"]);
});

test("una dimensión que la plataforma no ofrece da un cuadro vacío, sin fallar", () => {
  assert.deepEqual(filasDeDesglose("google", "edad", EDAD_GENERO), []);
  assert.deepEqual(filasDeDesglose("meta", "genero", []), []);
});

test("valores basura no rompen los números", () => {
  const f = filasDeDesglose("meta", "genero", [{ gender: "male", spend: "abc", impressions: null, clicks: undefined }]);
  assert.equal(f[0].gasto, 0);
  assert.equal(f[0].ctr, null);
  assert.equal(f[0].pesoDelGasto, 0);
});

test("las definiciones no se contradicen", () => {
  for (const p of ["meta", "google"]) {
    assert.ok(METRICAS[p].length > 0);
    for (const def of Object.values(DIMENSIONES[p])) assert.ok(def.campos.length >= 1);
  }
});
