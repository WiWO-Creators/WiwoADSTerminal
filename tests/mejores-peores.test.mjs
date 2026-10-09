import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { rankear, dinero } = await import("../lib/mejores-peores-pura.ts");

const E = (o) => ({
  tipo: "campana", id: "1", nombre: "C", campana: null, cuenta: "Cuenta", provider: "meta", objetivo: "AE", moneda: "USD", familia: "OUTCOME_ENGAGEMENT",
  gasto: 100, impresiones: 20000, clics: 400, resultado: 200, miniatura: null, boton: null, calidad: null, interaccion: null, conversion: null, ...o,
});

test("compara contra la mediana de su mismo objetivo: el más barato por resultado es el mejor y el más caro el peor", () => {
  const r = rankear([
    E({ id: "a", gasto: 100, resultado: 500 }),   // 0,20 por resultado
    E({ id: "b", gasto: 100, resultado: 200 }),   // 0,50 (la mediana)
    E({ id: "c", gasto: 100, resultado: 100 }),   // 1,00
  ]);
  assert.deepEqual(r.mejores.map((i) => i.id), ["a"]);
  assert.deepEqual(r.peores.map((i) => i.id), ["c"]);
  assert.match(r.mejores[0].porQue, /menos que la mediana/);
  assert.match(r.peores[0].porQue, /× la mediana/);
});

test("gastar sin ningún resultado medido es lo peor y se dice con el monto", () => {
  const r = rankear([
    E({ id: "a", resultado: 500 }),
    E({ id: "b", resultado: 300 }),
    E({ id: "z", gasto: 250, resultado: 0 }),
  ]);
  assert.equal(r.peores[0].id, "z");
  assert.match(r.peores[0].porQue, /no logró ningún resultado/);
  assert.match(r.peores[0].porQue, /\$250/);
});

test("un resultado que la lectura no trae (null) no se toma por cero: se compara por CTR y el porqué lo dice", () => {
  const r = rankear([
    E({ id: "a", resultado: null, clics: 800 }),
    E({ id: "b", resultado: null, clics: 400 }),
    E({ id: "c", resultado: null, clics: 100 }),
  ]);
  assert.equal(r.mejores[0].id, "a");
  assert.equal(r.peores[0].id, "c");
  assert.equal(r.mejores[0].metrica, "ctr");
  assert.match(r.peores[0].porQue, /no viene medido/);
});

test("no mezcla objetivos, monedas ni plataformas, y un grupo de una sola pieza no se ordena", () => {
  const r = rankear([
    E({ id: "ae", objetivo: "AE", resultado: 500 }),
    E({ id: "vta", objetivo: "VTA", resultado: 1 }),
    E({ id: "clp", moneda: "CLP", resultado: 5 }),
    E({ id: "goog", provider: "google", resultado: 5 }),
  ]);
  assert.deepEqual(r.mejores, []);
  assert.deepEqual(r.peores, []);
});

test("lo de poco volumen o sin inversión queda fuera", () => {
  const r = rankear([
    E({ id: "a", resultado: 500 }),
    E({ id: "b", resultado: 200 }),
    E({ id: "c", resultado: 1, impresiones: 300 }),
    E({ id: "d", resultado: 1, gasto: 0 }),
    E({ id: "e", resultado: 1, objetivo: null }),
  ]);
  assert.equal([...r.mejores, ...r.peores].some((i) => ["c", "d", "e"].includes(i.id)), false);
});

test("entrega a lo más 3 de cada lado y nada está en los dos", () => {
  const items = Array.from({ length: 10 }, (_, i) => E({ id: String(i), resultado: 20 + i * 40 }));
  const r = rankear(items);
  assert.ok(r.mejores.length <= 3 && r.peores.length <= 3);
  const ids = new Set(r.mejores.map((i) => i.id));
  assert.equal(r.peores.some((i) => ids.has(i.id)), false);
  assert.equal(r.mejores[0].id, "9");
  assert.equal(r.peores[0].id, "0");
});

test("Meta refuerza el porqué solo en el sentido que coincide", () => {
  const r = rankear([
    E({ id: "a", resultado: 500, calidad: "ABOVE_AVERAGE", interaccion: "BELOW_AVERAGE_10" }),
    E({ id: "b", resultado: 200 }),
    E({ id: "c", resultado: 100, calidad: "BELOW_AVERAGE_20" }),
  ]);
  assert.match(r.mejores[0].porQue, /por encima del promedio en calidad\./);
  assert.doesNotMatch(r.mejores[0].porQue, /en calidad y interacción/);
  assert.match(r.peores[0].porQue, /por debajo del promedio en calidad\./);
});

test("el dinero muestra decimales solo cuando el monto es chico", () => {
  assert.match(dinero(0.5, "USD"), /0,50/);
  assert.doesNotMatch(dinero(1234, "USD"), /,00/);
});

test("dentro de un objetivo no se mezclan tipos de campaña distintos (engagement contra awareness)", () => {
  const r = rankear([
    E({ id: "a", familia: "OUTCOME_ENGAGEMENT", resultado: 500 }),
    E({ id: "b", familia: "OUTCOME_AWARENESS", resultado: 5 }),
    E({ id: "c", familia: "OUTCOME_AWARENESS", resultado: 4 }),
  ]);
  assert.equal([...r.mejores, ...r.peores].some((i) => i.id === "a"), false);
});

test("un costo de centavos no se muestra como cero", () => {
  assert.match(dinero(0.0123, "USD"), /0,012/);
});

const { distribuirPorMoneda, plataformasSinGasto } = await import("../lib/distribucion.ts");
const D = (o) => ({ provider: "google", name: "c", currency: "PEN", spendMicros: 100_000_000, clicks: 1, impressions: 10, conActividad: true, objetivo: "LDS", ...o });

test("Inversión: cada moneda con gasto tiene su propia distribución (Meta en USD no desaparece junto a Google en PEN)", () => {
  const r = distribuirPorMoneda([D({}), D({ provider: "meta", currency: "USD", spendMicros: 20_000_000 })]);
  assert.deepEqual(r.map((d) => d.moneda), ["PEN", "USD"]);
  assert.deepEqual(r[1].porPlataforma.map((p) => p.clave), ["meta"]);
});

test("Inversión: una plataforma con campañas pero sin gasto se dice, no se esconde", () => {
  const s = plataformasSinGasto([D({}), D({ provider: "meta", spendMicros: 0, conActividad: false }), D({ provider: "meta", spendMicros: 0 })]);
  assert.deepEqual(s, [{ provider: "meta", campanas: 2 }]);
});

const { enProyectosAsignados, nombresDeProyectos } = await import("../lib/segmentos.ts");
const PROYECTOS = [{ id: "ebano", nombre: "Ébano", coincide: ["ebano"], plataformas: [], cuentas: [], paises: [], presupuesto: null }, { id: "marea", nombre: "Marea", coincide: ["marea"], plataformas: [], cuentas: [], paises: [], presupuesto: null }];

test("Grupo Valor: solo cuenta lo que nombra uno de sus proyectos; lo demás es de otro equipo", () => {
  assert.equal(enProyectosAsignados("valor", PROYECTOS, ["[LDS] EBANO | Conversión"]), true);
  assert.equal(enProyectosAsignados("valor", PROYECTOS, ["ContentMKT_2026_Conversion"]), false);
});

test("un cliente sin esa regla (o sin segmentos) no se filtra", () => {
  assert.equal(enProyectosAsignados("sqm", PROYECTOS, ["cualquier cosa"]), true);
  assert.equal(enProyectosAsignados("valor", [], ["cualquier cosa"]), true);
  assert.equal(nombresDeProyectos(PROYECTOS), "Ébano y Marea");
});
