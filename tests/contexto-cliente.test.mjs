import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { UMBRALES, calcularKpis, claveDeCampana, ctrTipicoPorPlataforma, resumenDeCliente, senalesDeCampana, variacion } =
  await import("../lib/contexto-cliente.ts");

const M = 1_000_000;
function camp(over = {}) {
  return {
    provider: "meta", accountId: "111", accountName: "Cuenta", currency: "CLP", name: "Camp", campaignId: "1",
    status: "ACTIVE", nativeObjective: "OUTCOME_LEADS", objetivo: "LDS",
    spendMicros: 100_000 * M, impressions: 20_000, clicks: 400, reach: 10_000,
    leads: 10, purchases: null, conversions: null, conversionValueMicros: null, conActividad: true, dailyBudgetMicros: null,
    ...over,
  };
}
const SIN_METAS = { cpaMicros: null, roas: null };
const META_CPA = { cpaMicros: 10_000 * M, roas: null };
const tipos = (s) => s.map((x) => x.tipo);

test("KPIs: el resultado sale de leads, luego compras, luego conversiones", () => {
  assert.equal(calcularKpis(camp({ leads: 4, purchases: 9 })).resultados, 4);
  assert.equal(calcularKpis(camp({ leads: null, purchases: 9 })).resultados, 9);
  assert.equal(calcularKpis(camp({ leads: null, purchases: null, conversions: 7 })).resultados, 7);
  assert.equal(calcularKpis(camp({ leads: null })).resultados, null);
});

test("KPIs: cero resultados no inventa un CPA, y sin alcance no hay frecuencia", () => {
  const k = calcularKpis(camp({ leads: 0, reach: null }));
  assert.equal(k.cpaMicros, null);
  assert.equal(k.frecuencia, null);
  assert.equal(calcularKpis(camp()).cpaMicros, 10_000 * M);
  assert.equal(calcularKpis(camp()).frecuencia, 2);
});

test("KPIs: ROAS = valor de conversión / gasto, y sin valor es null", () => {
  assert.equal(calcularKpis(camp({ conversionValueMicros: 300_000 * M })).roas, 3);
  assert.equal(calcularKpis(camp()).roas, null);
});

test("variación: sin base honesta no compara", () => {
  assert.equal(variacion(120, 100), 0.2);
  assert.equal(variacion(50, 0), null);
  assert.equal(variacion(null, 100), null);
});

test("una campaña pausada no genera señales", () => {
  assert.deepEqual(senalesDeCampana(camp({ status: "PAUSED", leads: 0 }), null, META_CPA, null), []);
});

test("activa sin actividad se marca como ausencia de datos, no como mal rendimiento", () => {
  const s = senalesDeCampana(camp({ conActividad: false, spendMicros: 0 }), null, META_CPA, null);
  assert.deepEqual(tipos(s), ["sin_actividad"]);
  assert.match(s[0].evidencia, /ausencia de datos/);
});

test("gasto sin resultados: solo con meta de CPA y a partir del doble de la meta", () => {
  const gastoAlto = camp({ leads: 0, spendMicros: 25_000 * M });
  assert.deepEqual(tipos(senalesDeCampana(gastoAlto, null, META_CPA, null)), ["gasto_sin_resultados"]);
  assert.deepEqual(senalesDeCampana(gastoAlto, null, SIN_METAS, null), [], "sin meta no se opina del CPA");
  assert.deepEqual(senalesDeCampana(camp({ leads: 0, spendMicros: 5_000 * M }), null, META_CPA, null), [], "poco gasto: es pronto");
});

test("CPA sobre la meta exige resultados suficientes y cita las cifras", () => {
  const s = senalesDeCampana(camp({ spendMicros: 50_000 * M, leads: 4 }), null, META_CPA, null); // CPA 12.500 = +25%
  assert.deepEqual(tipos(s), [], "25% no llega al umbral de 40%");
  const malo = senalesDeCampana(camp({ spendMicros: 80_000 * M, leads: 5 }), null, META_CPA, null); // 16.000 = +60%
  assert.deepEqual(tipos(malo), ["cpa_sobre_meta"]);
  assert.match(malo[0].evidencia, /\+60%/);
  assert.match(malo[0].evidencia, /5 resultados/);
  const pocos = senalesDeCampana(camp({ spendMicros: 80_000 * M, leads: 2 }), null, META_CPA, null);
  assert.deepEqual(tipos(pocos), [], "con 2 resultados el CPA es ruido");
});

test("CPA bien por debajo de la meta con volumen es una oportunidad de escalar", () => {
  const s = senalesDeCampana(camp({ spendMicros: 60_000 * M, leads: 10 }), null, META_CPA, null); // 6.000 = -40%
  assert.deepEqual(tipos(s), ["cpa_bajo_meta"]);
  assert.equal(s[0].severidad, "oportunidad");
  // CPA de 7.500 (bajo la meta) pero con solo 4 resultados: todavía no es una señal de escalar.
  assert.deepEqual(tipos(senalesDeCampana(camp({ spendMicros: 30_000 * M, leads: 4 }), null, META_CPA, null)), [], "con 4 resultados aún no se escala");
});

test("ROAS contra la meta: bajo es alerta, alto es oportunidad", () => {
  const metas = { cpaMicros: null, roas: 3 };
  assert.deepEqual(tipos(senalesDeCampana(camp({ conversionValueMicros: 150_000 * M }), null, metas, null)), ["roas_bajo_meta"]);
  assert.deepEqual(tipos(senalesDeCampana(camp({ conversionValueMicros: 400_000 * M }), null, metas, null)), ["roas_sobre_meta"]);
  assert.deepEqual(tipos(senalesDeCampana(camp({ conversionValueMicros: 300_000 * M }), null, metas, null)), []);
});

test("frecuencia alta necesita volumen de impresiones", () => {
  assert.deepEqual(tipos(senalesDeCampana(camp({ impressions: 40_000, reach: 10_000 }), null, SIN_METAS, null)), ["frecuencia_alta"]);
  assert.deepEqual(tipos(senalesDeCampana(camp({ impressions: 3_000, reach: 500 }), null, SIN_METAS, null)), []);
});

test("CTR bajo se compara contra el típico de su misma plataforma, no contra un número fijo", () => {
  const flojo = camp({ impressions: 10_000, clicks: 20 }); // 0,2%
  assert.deepEqual(tipos(senalesDeCampana(flojo, null, SIN_METAS, 0.01)), ["ctr_bajo"]);
  assert.deepEqual(tipos(senalesDeCampana(flojo, null, SIN_METAS, 0.003)), [], "si lo típico ya es bajo, no es una señal");
  assert.deepEqual(tipos(senalesDeCampana(flojo, null, SIN_METAS, null)), [], "sin comparables no se opina");
});

test("CTR típico: mediana por plataforma y solo con al menos 3 comparables con volumen", () => {
  const cs = [
    camp({ provider: "meta", impressions: 10_000, clicks: 100 }),
    camp({ provider: "meta", impressions: 10_000, clicks: 200, name: "b" }),
    camp({ provider: "meta", impressions: 10_000, clicks: 300, name: "c" }),
    camp({ provider: "meta", impressions: 100, clicks: 90, name: "sin volumen" }),
    camp({ provider: "google", impressions: 10_000, clicks: 500, name: "g" }),
  ];
  const t = ctrTipicoPorPlataforma(cs);
  assert.equal(t.get("meta"), 0.02);
  assert.equal(t.has("google"), false, "una sola de Google no alcanza");
});

test("tendencia: el CPA que empeora con volumen en ambos periodos se marca con las dos cifras", () => {
  const previa = camp({ spendMicros: 50_000 * M, leads: 10 }); // 5.000
  const actual = camp({ spendMicros: 80_000 * M, leads: 10 }); // 8.000 = +60%
  const s = senalesDeCampana(actual, previa, SIN_METAS, null);
  assert.deepEqual(tipos(s), ["cpa_empeora"]);
  assert.match(s[0].evidencia, /\+60%/);
});

test("tendencia: no compara si el periodo anterior tenía pocos resultados", () => {
  const s = senalesDeCampana(camp({ spendMicros: 80_000 * M, leads: 10 }), camp({ spendMicros: 5_000 * M, leads: 1 }), SIN_METAS, null);
  assert.deepEqual(tipos(s), []);
});

test("resultados que caen con gasto parecido es una alerta", () => {
  const previa = camp({ spendMicros: 100_000 * M, leads: 20 });
  const actual = camp({ spendMicros: 105_000 * M, leads: 8 });
  assert.ok(tipos(senalesDeCampana(actual, previa, SIN_METAS, null)).includes("resultados_caen"));
  // Si el gasto también cayó, la caída de resultados es esperable: no es señal.
  const menorGasto = camp({ spendMicros: 40_000 * M, leads: 8 });
  assert.ok(!tipos(senalesDeCampana(menorGasto, previa, SIN_METAS, null)).includes("resultados_caen"));
});

test("las campañas se emparejan entre periodos por plataforma, cuenta y id (no por nombre)", () => {
  const a = camp({ name: "Nombre viejo" });
  const b = camp({ name: "Nombre nuevo" });
  assert.equal(claveDeCampana(a), claveDeCampana(b));
  assert.notEqual(claveDeCampana(a), claveDeCampana(camp({ campaignId: "2" })));
});

test("resumen: cada moneda por separado, campañas por gasto y el periodo en curso se avisa", () => {
  const actuales = [
    camp({ campaignId: "1", spendMicros: 100_000 * M }),
    camp({ campaignId: "2", spendMicros: 300_000 * M, name: "Grande" }),
    camp({ campaignId: "3", currency: "USD", spendMicros: 500 * M, name: "Dólares" }),
  ];
  const previas = [camp({ campaignId: "2", spendMicros: 200_000 * M, name: "Grande" })];
  const r = resumenDeCliente({
    clienteNombre: "Colbún", actuales, previas, metas: META_CPA,
    periodo: { label: "Mes en curso", desde: "2026-09-01", hasta: "2026-09-29", enCurso: true },
    periodoPrevio: { label: "Anterior", desde: "2026-08-02", hasta: "2026-08-31", enCurso: false },
    alertas: [],
  });
  assert.equal(r.campanas[0].nombre, "Grande", "la de mayor gasto primero");
  assert.equal(r.gasto_por_moneda.length, 2);
  assert.ok(r.gasto_por_moneda.some((g) => g.moneda === "USD"));
  assert.match(r.aviso_periodo, /en curso/);
  const grande = r.campanas.find((c) => c.nombre === "Grande");
  assert.equal(grande.vs_periodo_anterior.gasto, "+50%");
  assert.equal(r.campanas.find((c) => c.nombre === "Dólares").vs_periodo_anterior, null);
});

test("resumen: sin metas cargadas lo dice, para poder recomendar cargarlas", () => {
  const r = resumenDeCliente({
    clienteNombre: "X", actuales: [camp()], previas: null, metas: SIN_METAS,
    periodo: { label: "p", desde: "a", hasta: "b", enCurso: false }, periodoPrevio: null, alertas: [],
  });
  assert.match(r.metas.nota, /no tiene metas/);
  assert.equal(r.aviso_periodo, null);
});

test("resumen: las señales salen ordenadas de la más grave a la oportunidad", () => {
  const actuales = [
    camp({ campaignId: "1", name: "Escalable", spendMicros: 60_000 * M, leads: 10 }),
    camp({ campaignId: "2", name: "Mala", spendMicros: 90_000 * M, leads: 5 }),
  ];
  const r = resumenDeCliente({
    clienteNombre: "X", actuales, previas: null, metas: META_CPA,
    periodo: { label: "p", desde: "a", hasta: "b", enCurso: false }, periodoPrevio: null, alertas: [],
  });
  assert.equal(r.senales[0].severidad, "alta");
  assert.equal(r.senales[0].campana, "Mala");
  assert.equal(r.senales.at(-1).severidad, "oportunidad");
});

test("los umbrales están definidos y son coherentes entre sí", () => {
  assert.ok(UMBRALES.CPA_BAJO_META < 1 && UMBRALES.CPA_SOBRE_META > 1);
  assert.ok(UMBRALES.RESULTADOS_MINIMOS_ESCALAR >= UMBRALES.RESULTADOS_MINIMOS);
});

test("awareness y tráfico NO se juzgan por conversiones: cero resultados no es una alerta", () => {
  const meta = { cpaMicros: 10_000 * M, roas: 3 };
  for (const objetivo of ["AE", "TRF", null]) {
    const c = camp({ objetivo, leads: 0, spendMicros: 500_000 * M });
    assert.deepEqual(tipos(senalesDeCampana(c, null, meta, null)), [], `objetivo ${objetivo}`);
  }
  // Sí se juzgan las de conversiones.
  for (const objetivo of ["LDS", "VTA", "OCV"]) {
    assert.deepEqual(tipos(senalesDeCampana(camp({ objetivo, leads: 0, spendMicros: 500_000 * M }), null, meta, null)), ["gasto_sin_resultados"], objetivo);
  }
});

test("la frecuencia alta y el CTR bajo siguen aplicando a awareness (es como se mide)", () => {
  assert.ok(tipos(senalesDeCampana(camp({ objetivo: "AE", impressions: 40_000, reach: 10_000 }), null, SIN_METAS, null)).includes("frecuencia_alta"));
});

test("resumen: una campaña de awareness muestra CPM y no muestra resultados ni costo por resultado", () => {
  const r = resumenDeCliente({
    clienteNombre: "X", actuales: [camp({ objetivo: "AE", leads: 0, impressions: 100_000, reach: 60_000, spendMicros: 200_000 * M })],
    previas: null, metas: META_CPA, periodo: { label: "p", desde: "a", hasta: "b", enCurso: false }, periodoPrevio: null, alertas: [],
  });
  const f = r.campanas[0];
  assert.equal(f.resultados, null);
  assert.equal(f.costo_por_resultado, null);
  assert.ok(f.cpm);
  assert.match(f.como_se_mide, /alcance, CPM/);
  assert.deepEqual(f.senales, []);
});

test("KPIs: CPM y CPC salen del gasto", () => {
  const k = calcularKpis(camp({ spendMicros: 20_000 * M, impressions: 10_000, clicks: 200 }));
  assert.equal(k.cpmMicros, 2_000 * M);
  assert.equal(k.cpcMicros, 100 * M);
});

// ---------------------------------------------------------------------------
// Metas complementarias por cliente
// ---------------------------------------------------------------------------
test("la frecuencia máxima del cliente manda sobre el umbral general", () => {
  const c = camp({ impressions: 30_000, reach: 10_000 }); // frecuencia 3,0: bajo el 3,5 general
  assert.deepEqual(tipos(senalesDeCampana(c, null, SIN_METAS, null)), []);
  const s = senalesDeCampana(c, null, { ...SIN_METAS, frecuenciaMaxima: 2.5 }, null);
  assert.deepEqual(tipos(s), ["frecuencia_alta"]);
  assert.match(s[0].evidencia, /máximo de 2\.5 que definió este cliente/);
});

test("CPM sobre la meta del cliente, solo con volumen y solo si hay meta", () => {
  const c = camp({ objetivo: "AE", spendMicros: 100_000 * M, impressions: 20_000, reach: 15_000 }); // CPM 5.000
  assert.deepEqual(tipos(senalesDeCampana(c, null, { ...SIN_METAS, cpmMicros: 3_000 * M }, null)), ["cpm_sobre_meta"]);
  assert.deepEqual(tipos(senalesDeCampana(c, null, { ...SIN_METAS, cpmMicros: 4_500 * M }, null)), [], "dentro del 30% de holgura");
  assert.deepEqual(tipos(senalesDeCampana(c, null, SIN_METAS, null)), [], "sin meta no se opina");
  const poco = camp({ objetivo: "AE", spendMicros: 100_000 * M, impressions: 2_000, reach: 1_500 });
  assert.deepEqual(tipos(senalesDeCampana(poco, null, { ...SIN_METAS, cpmMicros: 3_000 * M }, null)), [], "pocas impresiones");
});

test("el CTR mínimo del cliente manda sobre la comparación relativa y no duplica la señal", () => {
  const flojo = camp({ impressions: 10_000, clicks: 20 }); // 0,2%
  const s = senalesDeCampana(flojo, null, { ...SIN_METAS, ctrMinimo: 0.01 }, 0.02);
  assert.deepEqual(tipos(s), ["ctr_bajo_meta"]);
  assert.match(s[0].evidencia, /mínimo de 1\.00% que definió este cliente/);
  // Sin meta del cliente, sigue la comparación relativa de siempre.
  assert.deepEqual(tipos(senalesDeCampana(flojo, null, SIN_METAS, 0.02)), ["ctr_bajo"]);
  // Cumpliendo el mínimo, no hay señal de meta.
  assert.deepEqual(tipos(senalesDeCampana(camp({ impressions: 10_000, clicks: 200 }), null, { ...SIN_METAS, ctrMinimo: 0.01 }, null)), []);
});

test("el resumen incluye el KPI principal y las metas; y pide definirlo si falta", () => {
  const base = {
    clienteNombre: "X", actuales: [camp()], previas: null,
    periodo: { label: "p", desde: "a", hasta: "b", enCurso: false }, periodoPrevio: null, alertas: [],
  };
  const con = resumenDeCliente({
    ...base,
    metas: { ...SIN_METAS, cpmMicros: 3_000 * M, ctrMinimo: 0.012, frecuenciaMaxima: 3 },
    kpiPrincipal: { etiqueta: "Alcance / awareness", comoSeMide: "alcance, CPM, frecuencia" },
  });
  assert.equal(con.kpi_principal.nombre, "Alcance / awareness");
  assert.equal(con.metas.ctr_minimo_pct, 1.2);
  assert.equal(con.metas.frecuencia_maxima, 3);
  assert.equal(con.metas.nota, null);
  const sinKpi = resumenDeCliente({ ...base, metas: { ...SIN_METAS, cpmMicros: 3_000 * M } });
  assert.match(sinKpi.metas.nota, /KPI principal/);
  const nada = resumenDeCliente({ ...base, metas: SIN_METAS });
  assert.match(nada.metas.nota, /no tiene metas cargadas/);
});
