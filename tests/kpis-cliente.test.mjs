import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFINICION_KPI, KPIS_PRINCIPALES, SIN_METAS, ctrABp, esKpiPrincipal, frecuenciaAX10, metasDeFila, validarMetas,
} from "../lib/kpis-cliente.ts";

test("cada KPI principal tiene etiqueta, descripción, forma de medirse y columnas", () => {
  for (const k of KPIS_PRINCIPALES) {
    const d = DEFINICION_KPI[k];
    assert.ok(d.etiqueta && d.descripcion && d.comoSeMide, k);
    assert.ok(d.columnas.length >= 5, `${k}: pocas columnas`);
    assert.equal(d.columnas[0], "invertido", `${k}: el gasto va primero`);
    assert.equal(new Set(d.columnas).size, d.columnas.length, `${k}: columnas repetidas`);
  }
});

test("esKpiPrincipal solo acepta los definidos", () => {
  assert.equal(esKpiPrincipal("leads"), true);
  assert.equal(esKpiPrincipal("alcance"), true);
  assert.equal(esKpiPrincipal("otra"), false);
  assert.equal(esKpiPrincipal(null), false);
  assert.equal(esKpiPrincipal(undefined), false);
});

test("metas de la base: null es 'sin meta', nunca cero, y las columnas nuevas pueden faltar", () => {
  assert.deepEqual(metasDeFila({ target_cpa_micros: null, target_roas_bp: null }), SIN_METAS);
  const m = metasDeFila({ target_cpa_micros: 8_000_000_000, target_roas_bp: 350, target_cpm_micros: 3_000_000_000, target_ctr_bp: 150, max_frequency_x10: 35 });
  assert.deepEqual(m, { cpaMicros: 8_000_000_000, roas: 3.5, cpmMicros: 3_000_000_000, ctrMinimo: 0.015, frecuenciaMaxima: 3.5 });
});

test("conversiones a enteros para la base y de vuelta, sin errores de coma flotante", () => {
  assert.equal(ctrABp(0.015), 150);
  assert.equal(ctrABp(0.0123), 123);
  assert.equal(frecuenciaAX10(3.5), 35);
  assert.equal(frecuenciaAX10(2.3), 23);
  const ida = metasDeFila({ target_cpa_micros: null, target_roas_bp: null, target_ctr_bp: ctrABp(0.0123), max_frequency_x10: frecuenciaAX10(2.3) });
  assert.equal(ida.ctrMinimo, 0.0123);
  assert.equal(ida.frecuenciaMaxima, 2.3);
});

test("validación de metas: rangos razonables y mensajes claros", () => {
  assert.equal(validarMetas({}), null);
  assert.equal(validarMetas({ targetCpmMicros: 3_000_000_000, targetCtr: 0.015, maxFrequency: 3.5 }), null);
  assert.equal(validarMetas({ targetCpmMicros: null, targetCtr: null, maxFrequency: null }), null, "null = quitar la meta");
  assert.match(validarMetas({ targetCpmMicros: 0 }), /CPM/);
  assert.match(validarMetas({ targetCpmMicros: -5 }), /CPM/);
  assert.match(validarMetas({ targetCtr: 0 }), /CTR/);
  assert.match(validarMetas({ targetCtr: 1.5 }), /CTR/, "1,5 sería 150%: se escribe como 0,015");
  assert.match(validarMetas({ maxFrequency: 0.5 }), /frecuencia/i);
  assert.match(validarMetas({ maxFrequency: 25 }), /frecuencia/i);
});
