import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { mesDeNombre, campanaDeEpocaPasada } = await import("../lib/vigencia-campana-pura.ts");
const { sugerenciasDeContenido, sugerenciasDeCampanaApagada, DIAS_SIN_CONTENIDO } = await import("../lib/sugerencias.ts");

const hoy = new Date("2026-10-07T12:00:00Z");
const dia = 86_400_000;
const M = 1_000_000;

test("detecta el mes que nombra la campaña, con o sin tildes y abreviado, y el año si lo trae", () => {
  assert.deepEqual(mesDeNombre("[LDS] Leads | junio"), { mes: 6, anio: null });
  assert.deepEqual(mesDeNombre("Cyber SEPTIEMBRE 2026"), { mes: 9, anio: 2026 });
  assert.deepEqual(mesDeNombre("Promo set-oct"), { mes: 10, anio: null }, "se toma el último mes nombrado");
  assert.equal(mesDeNombre("[AE] Interacción perfil Colombia 2026"), null);
  assert.equal(mesDeNombre("Mar adentro"), null, "«mar» no cuenta como marzo: es una palabra común");
});

test("una campaña de junio ya cumplió su época en octubre; una de septiembre o de este mes, no; una de un mes futuro, tampoco", () => {
  assert.equal(campanaDeEpocaPasada("[LDS] Leads | junio", hoy), true);
  assert.equal(campanaDeEpocaPasada("Fiestas Patrias septiembre", hoy), false, "terminó hace una semana: todavía importa");
  assert.equal(campanaDeEpocaPasada("Campaña octubre", hoy), false);
  assert.equal(campanaDeEpocaPasada("Navidad diciembre", hoy), false, "es de un mes que todavía no llega");
  assert.equal(campanaDeEpocaPasada("Cyber diciembre 2025", hoy), true, "con año, diciembre de 2025 ya pasó");
  assert.equal(campanaDeEpocaPasada("[AE] Colbún | IG | Awareness", hoy), false, "sin mes en el nombre no se asume nada");
});

const base = { cliente: { id: "c", nombre: "C" }, provider: "meta", accountId: "1" };

test("el contenido repetido se sugiere cambiar desde los 20 días, pero no en campañas de una época pasada", () => {
  assert.equal(DIAS_SIN_CONTENIDO, 20);
  const s = sugerenciasDeContenido(
    [
      { ...base, campanaId: "a", campanaNombre: "[AE] Interacción perfil", ultimoAnuncio: hoy.getTime() - 25 * dia },
      { ...base, campanaId: "b", campanaNombre: "[AE] Interacción perfil 2", ultimoAnuncio: hoy.getTime() - 15 * dia },
      { ...base, campanaId: "c", campanaNombre: "[LDS] Leads | junio", ultimoAnuncio: hoy.getTime() - 117 * dia },
    ],
    hoy,
  );
  assert.deepEqual(s.map((x) => x.entityId), ["a"]);
});

test("una campaña que gastó el mes pasado y hoy está apagada pregunta si debía seguir; las de época pasada o sin gasto no", () => {
  const s = sugerenciasDeCampanaApagada(
    [
      { ...base, campanaId: "a", campanaNombre: "Fiestas Patrias septiembre", gastoMesAnteriorMicros: 50_000 * M, moneda: "CLP", mesAnterior: "septiembre" },
      { ...base, campanaId: "b", campanaNombre: "[LDS] Leads | junio", gastoMesAnteriorMicros: 80_000 * M, moneda: "CLP", mesAnterior: "septiembre" },
      { ...base, campanaId: "c", campanaNombre: "Sin gasto", gastoMesAnteriorMicros: 0, moneda: "CLP", mesAnterior: "septiembre" },
    ],
    hoy,
  );
  assert.deepEqual(s.map((x) => x.entityId), ["a"]);
  assert.equal(s[0].rule, "campana_apagada");
  assert.deepEqual(s[0].accion, { tipo: "reactivar" });
  assert.match(s[0].title, /dejó de correr/);
  assert.match(s[0].diagnosis, /septiembre/);
  assert.match(s[0].diagnosis, /Ya no estará activa|ya no estará activa/);
});

test("por cliente solo se muestran las 5 campañas con el contenido más viejo", () => {
  const entradas = Array.from({ length: 8 }, (_, i) => ({ ...base, campanaId: `k${i}`, campanaNombre: `Campaña ${i}`, ultimoAnuncio: hoy.getTime() - (25 + i) * dia }));
  const s = sugerenciasDeContenido(entradas, hoy);
  assert.equal(s.length, 5);
  assert.deepEqual(s.map((x) => x.entityId), ["k7", "k6", "k5", "k4", "k3"]);
});
