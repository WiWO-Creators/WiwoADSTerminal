import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { proyectar, percentil } = await import("../lib/simulador.ts");
const M = 1_000_000;

// 90 días; 3 campañas de Meta con leads: CPL 10.000, 20.000, 30.000.
const meta = {
  provider: "meta", objetivo: "LDS", gastoMicros: 600_000 * M, impresiones: 600_000, clics: 6_000,
  resultados: 30, etiquetaResultado: "Leads",
  campanas: [
    { gastoMicros: 100_000 * M, resultados: 10 },
    { gastoMicros: 200_000 * M, resultados: 10 },
    { gastoMicros: 300_000 * M, resultados: 10 },
  ],
};
const historial = { moneda: "CLP", dias: 90, filas: [meta] };
const plan = (over = {}) => ({
  montoMicros: 300_000 * M, dias: 30, objetivo: "LDS", reparto: [{ provider: "meta", fraccion: 1 }], campanas: 2, ...over,
});

test("percentil con interpolación", () => {
  assert.equal(percentil([10], 0.5), 10);
  assert.equal(percentil([10, 20, 30], 0.5), 20);
  assert.equal(percentil([10, 20, 30], 0.25), 15);
  assert.equal(percentil([30, 10, 20], 0.75), 25);
});

test("proyecta con el costo por mil, el CTR y el costo por resultado reales del cliente", () => {
  const p = proyectar(plan(), historial).porPlataforma[0];
  assert.equal(Math.round(p.cpmMicros / M), 1000);
  assert.equal(p.ctr, 0.01);
  assert.equal(Math.round(p.impresiones), 300_000);
  assert.equal(Math.round(p.clics), 3_000);
  assert.equal(Math.round(p.costoPorResultadoMicros / M), 20_000);
  assert.equal(Math.round(p.resultados.central), 15);
  assert.equal(p.confianza, "alta");
});

test("el rango sale de la dispersión real entre campañas, no de un porcentaje inventado", () => {
  const r = proyectar(plan(), historial).porPlataforma[0].resultados;
  // CPL p75 = 25.000 → 12 leads; p25 = 15.000 → 20 leads.
  assert.equal(Math.round(r.bajo), 12);
  assert.equal(Math.round(r.alto), 20);
});

test("con pocas campañas el rango es amplio y lo avisa", () => {
  const h = { ...historial, filas: [{ ...meta, campanas: [{ gastoMicros: 600_000 * M, resultados: 30 }] }] };
  const p = proyectar(plan(), h).porPlataforma[0];
  assert.ok(p.avisos.some((a) => /estimación amplia/.test(a)));
  assert.equal(Math.round(p.resultados.bajo), Math.round(15 * 0.65));
  assert.equal(Math.round(p.resultados.alto), Math.round(15 * 1.35));
});

test("escalar mucho sobre lo que se invertía avisa y castiga la parte baja", () => {
  // Histórico: 600.000 en 90 días = 6.667/día; simula 3.000.000 en 30 días = 100.000/día.
  const p = proyectar(plan({ montoMicros: 3_000_000 * M }), historial).porPlataforma[0];
  assert.ok(p.avisos.some((a) => /más escala/.test(a)));
  assert.ok(p.resultados.bajo < 120 * 0.85 * 1.0001);
});

test("sin historial de una plataforma no inventa cifras y el total no la cuenta", () => {
  const r = proyectar(
    plan({ reparto: [{ provider: "meta", fraccion: 0.5 }, { provider: "google", fraccion: 0.5 }] }),
    historial,
  );
  const g = r.porPlataforma.find((x) => x.provider === "google");
  assert.equal(g.confianza, "sin_historial");
  assert.equal(g.impresiones, null);
  assert.equal(g.resultados, null);
  assert.ok(r.avisos.some((a) => /no incluye Google Ads/.test(a)));
  assert.equal(r.total.resultados.central, 7.5);
});

test("objetivo sin resultados medidos proyecta solo impresiones y clics", () => {
  const h = { ...historial, filas: [{ ...meta, resultados: null }] };
  const p = proyectar(plan(), h).porPlataforma[0];
  assert.equal(p.resultados, null);
  assert.ok(p.impresiones > 0);
  assert.ok(p.avisos.some((a) => /solo se proyectan impresiones y clics/.test(a)));
});

test("presupuesto diario por campaña", () => {
  const r = proyectar(plan({ montoMicros: 600_000 * M, dias: 30, campanas: 4 }), historial);
  assert.equal(Math.round(r.diarioPorCampanaMicros / M), 5_000);
});

const { canalDeMeta, canalDeGoogle, canalesActivos, etiquetaDeCanal, claveDeCanal } = await import("../lib/canales.ts");

const instagram = { ...meta, canal: "instagram", gastoMicros: 200_000 * M, impresiones: 100_000, clics: 3_000, resultados: 20,
  campanas: [{ gastoMicros: 100_000 * M, resultados: 10 }, { gastoMicros: 100_000 * M, resultados: 10 }] };
const conCanales = { moneda: "CLP", dias: 90, filas: [meta, instagram] };

test("un canal con historial propio se proyecta con SU rendimiento, no con el de la plataforma", () => {
  const r = proyectar(plan({ reparto: [{ provider: "meta", canal: "instagram", fraccion: 1 }] }), conCanales).porPlataforma[0];
  assert.equal(r.canal, "instagram");
  assert.equal(r.aproximado, false);
  assert.equal(Math.round(r.cpmMicros / M), 2000); // 200.000 / 100.000 × 1000
  assert.equal(Math.round(r.costoPorResultadoMicros / M), 10_000);
});

test("un canal sin historial usa el promedio de la plataforma, lo dice y baja la confianza", () => {
  const r = proyectar(plan({ reparto: [{ provider: "meta", canal: "threads", fraccion: 1 }] }), conCanales).porPlataforma[0];
  assert.equal(r.aproximado, true);
  assert.equal(r.confianza, "media"); // la de Meta es alta, una menos por ser aproximado
  assert.ok(r.avisos.some((a) => /Sin historial propio de Threads/.test(a)));
  assert.equal(Math.round(r.cpmMicros / M), 1000);
});

test("un reparto en varios canales suma sus proyecciones", () => {
  const r = proyectar(
    plan({
      reparto: [
        { provider: "meta", canal: "instagram", fraccion: 0.5 },
        { provider: "meta", canal: "facebook", fraccion: 0.3 },
        { provider: "meta", canal: "threads", fraccion: 0.2 },
      ],
    }),
    conCanales,
  );
  assert.equal(r.porPlataforma.length, 3);
  assert.equal(Math.round(r.total.gastoMicros / M), 300_000);
  assert.equal(r.porPlataforma.filter((p) => p.aproximado).length, 2);
});

test("normalizar canales de Meta y de Google", () => {
  assert.equal(canalDeMeta("Instagram"), "instagram");
  assert.equal(canalDeMeta("threads"), "threads");
  assert.equal(canalDeMeta("whatsapp"), null);
  assert.equal(canalDeMeta(undefined), null);
  assert.equal(canalDeGoogle("SEARCH_PARTNERS"), "search");
  assert.equal(canalDeGoogle("CONTENT"), "display");
  assert.equal(canalDeGoogle("YOUTUBE_VIDEOS"), "youtube");
  assert.equal(canalDeGoogle("MIXED"), null);
});

test("solo se ofrecen los canales de las plataformas activas; TikTok y LinkedIn entran al activarse", () => {
  const activos = canalesActivos().map((x) => x.provider);
  assert.deepEqual(activos.sort(), ["google", "meta"]);
  assert.equal(etiquetaDeCanal("meta", "instagram"), "Instagram");
  assert.equal(etiquetaDeCanal("meta", null), "Todos los canales");
  assert.equal(claveDeCanal("meta", null), "meta:*");
  assert.equal(claveDeCanal("meta", "instagram"), "meta:instagram");
});

test("un canal sin resultados medibles usa el costo por resultado de la plataforma y lo avisa", () => {
  const sinResultados = { ...instagram, resultados: null, campanas: [{ gastoMicros: 200_000 * M, resultados: null }] };
  const h = { moneda: "CLP", dias: 90, filas: [meta, sinResultados] };
  const p = proyectar(plan({ reparto: [{ provider: "meta", canal: "instagram", fraccion: 1 }] }), h).porPlataforma[0];
  assert.equal(p.aproximado, false); // el canal SÍ tiene historial propio (CPM, CTR)…
  assert.equal(Math.round(p.cpmMicros / M), 2000); // …y se usa
  assert.equal(Math.round(p.costoPorResultadoMicros / M), 20_000); // pero el costo por resultado es el de Meta
  assert.ok(p.avisos.some((a) => /no se miden con confiabilidad por canal/.test(a)));
  assert.ok(p.resultados);
});

test("un canal con gasto pero sin resultados propios hereda la confianza de la plataforma (una menos)", () => {
  const h = {
    moneda: "CLP", dias: 90,
    filas: [
      meta,
      { provider: "meta", canal: "instagram", objetivo: "LDS", gastoMicros: 300_000 * M, impresiones: 300_000, clics: 3_000, resultados: null, etiquetaResultado: "Leads", campanas: [] },
    ],
  };
  const r = proyectar(plan({ reparto: [{ provider: "meta", canal: "instagram", fraccion: 1 }] }), h).porPlataforma[0];
  assert.equal(r.aproximado, false);
  assert.equal(r.confianza, "media"); // la de Meta es alta; los resultados por canal no se miden
  assert.ok(r.resultados);
});

const { reequilibrar } = await import("../lib/simulador.ts");
const suma = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test("reequilibrar: el canal editado queda como se escribió y los demás se ajustan en proporción a 100", () => {
  const r = reequilibrar({ a: 50, b: 30, c: 20 }, "a", 70);
  assert.equal(r.a, 70);
  assert.ok(Math.abs(r.b - 18) < 1e-9 && Math.abs(r.c - 12) < 1e-9);
  assert.ok(Math.abs(suma(r) - 100) < 1e-9);
});

test("reequilibrar: valores fuera de rango se acotan y el total siempre es 100", () => {
  assert.equal(reequilibrar({ a: 50, b: 50 }, "a", 250).a, 100);
  assert.ok(Math.abs(suma(reequilibrar({ a: 50, b: 50 }, "a", -5)) - 100) < 1e-9);
  assert.ok(Math.abs(suma(reequilibrar({ a: 50, b: 50 }, "a", Number.NaN)) - 100) < 1e-9);
});

test("reequilibrar: si los demás estaban en cero, el resto va a los que tienen historial", () => {
  const r = reequilibrar({ a: 100, b: 0, c: 0 }, "a", 40, ["a", "c"]);
  assert.equal(r.b, 0);
  assert.equal(r.c, 60);
});

const { minimoDelCanalMicros, ajustarAMinimos } = await import("../lib/simulador.ts");

test("mínimo por canal: depende de la plataforma, de la moneda y de los días", () => {
  const meta30 = minimoDelCanalMicros("meta", "CLP", 30);
  const meta60 = minimoDelCanalMicros("meta", "CLP", 60);
  assert.equal(meta60, meta30 * 2);
  assert.equal(meta30, 1000 * 30 * M); // CLP 950 por día se redondea a 1.000
  assert.ok(minimoDelCanalMicros("linkedin", "USD", 30) > minimoDelCanalMicros("meta", "USD", 30));
  assert.equal(minimoDelCanalMicros("meta", "XXX", 30), null); // moneda desconocida: no se inventa
});

test("ajustarAMinimos: lo que queda bajo el mínimo pasa a 0 y su parte va a los demás (suma 100)", () => {
  const r = ajustarAMinimos({ a: 60, b: 38, c: 2 }, { a: 5, b: 5, c: 5 });
  assert.equal(r.c, 0);
  assert.ok(Math.abs(r.a + r.b - 100) < 1e-9);
  assert.ok(r.a > 60 && r.b > 38);
});

test("ajustarAMinimos: el canal que la persona escribió se respeta aunque quede bajo el mínimo", () => {
  const r = ajustarAMinimos({ a: 90, b: 6, c: 4 }, { a: 5, b: 5, c: 5 }, "c");
  assert.equal(r.c, 4);
  const sinNadie = ajustarAMinimos({ a: 3 }, { a: 5 });
  assert.equal(sinNadie.a, 3); // sin a quién dar lo liberado, no se pierde nada
});

const { ajustarAMinimosPorPlataforma } = await import("../lib/simulador.ts");

test("el mínimo depende del objetivo, de los días y de las campañas", () => {
  const ae = minimoDelCanalMicros("meta", "USD", 30, "AE", 1);
  const lds = minimoDelCanalMicros("meta", "USD", 30, "LDS", 1);
  assert.ok(lds > ae); // leads necesita más que alcance
  assert.equal(minimoDelCanalMicros("meta", "USD", 30, "LDS", 2), lds * 2);
  // Con un tipo de cambio en vivo se usa ese, no el de referencia.
  const vivo = minimoDelCanalMicros("meta", "CLP", 10, "AE", 1, 1000);
  assert.equal(vivo, 1_000 * 10 * 1_000_000);
});

test("el mínimo es por plataforma: los canales de una plataforma se suman antes de compararlos", () => {
  const pesos = { "meta:facebook": 3, "meta:instagram": 3, "google:search": 94 };
  const plataformaDe = { "meta:facebook": "meta", "meta:instagram": "meta", "google:search": "google" };
  // Meta junta 6 %, que alcanza su mínimo de 5 %: nadie se descarta aunque cada canal esté bajo 5.
  assert.deepEqual(ajustarAMinimosPorPlataforma(pesos, plataformaDe, { meta: 5, google: 5 }), pesos);
  // Con un mínimo de 10 %, Meta entero se descarta y su parte pasa a Google.
  const r = ajustarAMinimosPorPlataforma(pesos, plataformaDe, { meta: 10, google: 5 });
  assert.equal(r["meta:facebook"], 0);
  assert.equal(r["meta:instagram"], 0);
  assert.ok(Math.abs(r["google:search"] - 100) < 1e-9);
});
