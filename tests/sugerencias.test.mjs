import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { generarSugerencias, VENCE_EN_MS } = await import("../lib/sugerencias.ts");

const M = 1_000_000;
const AHORA = new Date("2026-09-30T12:00:00Z");

function camp(over = {}) {
  return {
    provider: "meta", accountId: "111", accountName: "Cuenta", currency: "CLP", name: "Campaña A", campaignId: "10",
    status: "ACTIVE", nativeObjective: "OUTCOME_LEADS", objetivo: "LDS",
    spendMicros: 100_000 * M, impressions: 20_000, clicks: 400, reach: 10_000,
    leads: 10, purchases: null, conversions: null, conversionValueMicros: null, conActividad: true,
    dailyBudgetMicros: 20_000 * M, accountKey: "windsor:meta:111",
    ...over,
  };
}
const cliente = (metas = {}) => ({
  id: "c1", nombre: "Cliente Uno", cuentas: new Set(["windsor:meta:111"]),
  metas: { cpaMicros: 10_000 * M, roas: null, ...metas },
});
const reglas = (s) => s.map((x) => x.rule);

test("gasto sin resultados propone pausar y es crítica", () => {
  const [s] = generarSugerencias([cliente()], [camp({ leads: 0, spendMicros: 25_000 * M })], null, AHORA);
  assert.equal(s.rule, "gasto_sin_resultados");
  assert.equal(s.severity, "critical");
  assert.deepEqual(s.accion, { tipo: "pausar" });
  assert.equal(s.portfolioId, "c1");
  assert.equal(s.entityId, "10");
  assert.equal(s.expiresAt - s.generatedAt, VENCE_EN_MS);
});

test("CPA sobre la meta propone bajar 15% el presupuesto, con antes y después", () => {
  const s = generarSugerencias([cliente()], [camp({ spendMicros: 200_000 * M })], null, AHORA);
  const cpa = s.find((x) => x.rule === "cpa_sobre_meta");
  assert.ok(cpa);
  assert.equal(cpa.accion.tipo, "presupuesto");
  assert.equal(cpa.accion.actual, 20_000);
  assert.equal(cpa.accion.monto, 17_000);
  assert.equal(cpa.delta, "-15%");
});

test("CPA muy bajo la meta propone subir 20%", () => {
  const s = generarSugerencias([cliente()], [camp({ spendMicros: 50_000 * M, leads: 20 })], null, AHORA);
  const sube = s.find((x) => x.rule === "cpa_bajo_meta");
  assert.ok(sube);
  assert.equal(sube.accion.monto, 24_000);
  assert.equal(sube.severity, "info");
});

test("sin presupuesto de campaña (Meta por conjunto) queda como revisión, sin inventar un monto", () => {
  const s = generarSugerencias([cliente()], [camp({ spendMicros: 200_000 * M, dailyBudgetMicros: null })], null, AHORA);
  const cpa = s.find((x) => x.rule === "cpa_sobre_meta");
  assert.deepEqual(cpa.accion, { tipo: "revisar" });
});

test("awareness no se juzga por conversiones: sin resultados no genera sugerencia de CPA", () => {
  const s = generarSugerencias(
    [cliente()],
    [camp({ objetivo: "AE", leads: 0, spendMicros: 900_000 * M, reach: 100_000, impressions: 150_000 })],
    null,
    AHORA,
  );
  assert.deepEqual(reglas(s).filter((r) => r.startsWith("cpa") || r === "gasto_sin_resultados"), []);
});

test("frecuencia sobre la meta del cliente sugiere renovar el creativo (revisión)", () => {
  const s = generarSugerencias(
    [cliente({ frecuenciaMaxima: 2 })],
    [camp({ objetivo: "AE", reach: 5_000, impressions: 20_000 })],
    null,
    AHORA,
  );
  const f = s.find((x) => x.rule === "frecuencia_alta");
  assert.ok(f);
  assert.deepEqual(f.accion, { tipo: "revisar" });
});

test("no sugiere nada de campañas pausadas, sin id, ni de cuentas de otro cliente", () => {
  const otras = [
    camp({ status: "PAUSED", leads: 0, spendMicros: 25_000 * M }),
    camp({ campaignId: null, leads: 0, spendMicros: 25_000 * M }),
    camp({ accountKey: "windsor:meta:999", leads: 0, spendMicros: 25_000 * M }),
  ];
  assert.deepEqual(generarSugerencias([cliente()], otras, null, AHORA), []);
});

test("el id es estable el mismo día y cambia al día siguiente", () => {
  const c = [camp({ leads: 0, spendMicros: 25_000 * M })];
  const a = generarSugerencias([cliente()], c, null, AHORA)[0].id;
  const b = generarSugerencias([cliente()], c, null, new Date("2026-09-30T20:00:00Z"))[0].id;
  const d = generarSugerencias([cliente()], c, null, new Date("2026-10-01T12:00:00Z"))[0].id;
  assert.equal(a, b);
  assert.notEqual(a, d);
});

test("ordena por gravedad: crítica antes que oportunidad", () => {
  const s = generarSugerencias(
    [cliente()],
    [
      camp({ campaignId: "20", name: "Buena", spendMicros: 50_000 * M, leads: 20 }),
      camp({ campaignId: "10", name: "Mala", leads: 0, spendMicros: 25_000 * M }),
    ],
    null,
    AHORA,
  );
  assert.equal(s[0].severity, "critical");
  assert.equal(s[s.length - 1].severity, "info");
});

const { sugerenciasDePresupuesto } = await import("../lib/sugerencias.ts");
const { calcularPresupuesto } = await import("../lib/presupuesto.ts");
const dia = (d) => new Date(Date.UTC(2026, 8, d, 12));
const entrada = (gastado, d) => ({
  cliente: { id: "c1", nombre: "Cliente Uno" },
  resumen: calcularPresupuesto(3_000 * M, gastado * M, dia(d)),
  moneda: "CLP",
});

test("presupuesto en ritmo no sugiere nada", () => {
  assert.deepEqual(sugerenciasDePresupuesto([entrada(1_500, 15)], dia(15)), []);
});

test("gasto adelantado sugiere bajar el ritmo diario, sin apuntar a una campaña", () => {
  const [s] = sugerenciasDePresupuesto([entrada(2_000, 10)], dia(10));
  assert.equal(s.rule, "presupuesto_ritmo");
  assert.equal(s.severity, "high");
  assert.equal(s.entityId, null);
  assert.equal(s.provider, null);
  assert.deepEqual(s.accion, { tipo: "revisar" });
  assert.match(s.title, /pasarse/);
});

test("excedido es crítica; atrasado es media", () => {
  assert.equal(sugerenciasDePresupuesto([entrada(3_200, 25)], dia(25))[0].severity, "critical");
  assert.equal(sugerenciasDePresupuesto([entrada(500, 20)], dia(20))[0].severity, "medium");
});

test("el id del presupuesto es estable el mismo día", () => {
  const a = sugerenciasDePresupuesto([entrada(2_000, 10)], dia(10))[0].id;
  const b = sugerenciasDePresupuesto([entrada(2_100, 10)], new Date(Date.UTC(2026, 8, 10, 20)))[0].id;
  assert.equal(a, b);
});

const { sugerenciasDeMedicion } = await import("../lib/sugerencias.ts");

test("cada problema de medición es una sugerencia del cliente, siempre «revisar»", () => {
  const s = sugerenciasDeMedicion(
    [{
      cliente: { id: "c1", nombre: "Cliente Uno" },
      hallazgos: [
        { id: "clave_no_conversion", severidad: "alta", titulo: "T1", detalle: "D1", eventos: ["page_view"] },
        { id: "duplicados", severidad: "media", titulo: "T2", detalle: "D2", eventos: ["a", "A"] },
      ],
    }],
    AHORA,
  );
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.severity), ["high", "medium"]);
  assert.equal(s[0].rule, "medicion_clave_no_conversion");
  assert.equal(s[0].entityId, null);
  assert.deepEqual(s[0].accion, { tipo: "revisar" });
  assert.equal(s[0].platform, "GA4");
  assert.deepEqual(sugerenciasDeMedicion([{ cliente: { id: "c", nombre: "C" }, hallazgos: [] }], AHORA), []);
});

const { sugerenciasDeContenido, DIAS_SIN_CONTENIDO } = await import("../lib/sugerencias.ts");

test("una campaña sin anuncios nuevos desde hace 20 días o más pide contenido; una reciente o sin fecha, no", () => {
  const ahora = new Date("2026-10-06T12:00:00Z");
  const dia = 86_400_000;
  const base = { cliente: { id: "anker", nombre: "Anker" }, provider: "meta", accountId: "1", campanaNombre: "[AE] Tráfico Perfil" };
  const s = sugerenciasDeContenido(
    [
      { ...base, campanaId: "vieja", ultimoAnuncio: ahora.getTime() - 20 * dia },
      { ...base, campanaId: "muy-vieja", ultimoAnuncio: ahora.getTime() - 40 * dia },
      { ...base, campanaId: "reciente", ultimoAnuncio: ahora.getTime() - 3 * dia },
      { ...base, campanaId: "sin-dato", ultimoAnuncio: null },
    ],
    ahora,
  );
  assert.equal(DIAS_SIN_CONTENIDO, 20);
  assert.deepEqual(s.map((x) => x.entityId), ["muy-vieja", "vieja"]);
  assert.equal(s[0].accion.tipo, "contenido");
  assert.equal(s[0].accion.dias, 40);
  assert.equal(s[0].severity, "high");
  assert.equal(s[1].severity, "medium");
  assert.match(s[0].title, /No has actualizado el contenido/);
  // El mismo día y la misma semana: mismo id, no se duplica.
  assert.equal(sugerenciasDeContenido([{ ...base, campanaId: "vieja", ultimoAnuncio: ahora.getTime() - 20 * dia }], new Date(ahora.getTime() + dia))[0].id, s[1].id);
});
