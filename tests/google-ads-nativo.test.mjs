import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const {
  GAQL_ANUNCIOS,
  GoogleAdsNativoError,
  actualizarAnuncioRsa,
  armarMutacionRsa,
  consultarGaql,
  idNumerico,
  validarCambiosRsa,
} = await import("../lib/google-ads-nativo.ts");

const CRED = {
  accessToken: "tok",
  developerToken: "dev",
  apiVersion: "v25",
  managerId: "111-222-3333",
};

async function conFetch(respuesta, fn) {
  const original = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url: String(url), init });
    return typeof respuesta === "function" ? respuesta(url, init) : respuesta;
  };
  try {
    return await fn(llamadas);
  } finally {
    globalThis.fetch = original;
  }
}

const ok = (cuerpo) => new Response(JSON.stringify(cuerpo), { status: 200 });
const falla = (status, cuerpo) => new Response(JSON.stringify(cuerpo), { status });

test("los ids se validan antes de ir a una consulta (nada de inyección en GAQL)", () => {
  assert.equal(idNumerico("423-204-0466"), "4232040466");
  assert.equal(idNumerico("825843439416"), "825843439416");
  assert.throws(() => idNumerico("1 OR 1=1"), GoogleAdsNativoError);
  assert.throws(() => idNumerico("12'; DROP"), GoogleAdsNativoError);
  assert.throws(() => idNumerico(""), GoogleAdsNativoError);
});

test("la consulta usa searchStream, las cabeceras de Google y el login del administrador", async () => {
  await conFetch(ok([{ results: [{ a: 1 }] }, { results: [{ a: 2 }] }]), async (llamadas) => {
    const filas = await consultarGaql(CRED, "423-204-0466", GAQL_ANUNCIOS);
    assert.deepEqual(filas, [{ a: 1 }, { a: 2 }]);
    const [{ url, init }] = llamadas;
    assert.equal(url, "https://googleads.googleapis.com/v25/customers/4232040466/googleAds:searchStream");
    assert.equal(init.headers.authorization, "Bearer tok");
    assert.equal(init.headers["developer-token"], "dev");
    assert.equal(init.headers["login-customer-id"], "1112223333");
    assert.equal(JSON.parse(init.body).query, GAQL_ANUNCIOS);
  });
});

test("sin administrador no se manda login-customer-id", async () => {
  await conFetch(ok([]), async (llamadas) => {
    await consultarGaql({ ...CRED, managerId: null }, "1", "SELECT 1");
    assert.equal("login-customer-id" in llamadas[0].init.headers, false);
  });
});

test("las consultas de lectura no traen entidades eliminadas pero sí las pausadas", () => {
  assert.match(GAQL_ANUNCIOS, /status != 'REMOVED'/);
  assert.doesNotMatch(GAQL_ANUNCIOS, /status = 'ENABLED'/);
});

test("un 401 pide volver a conectar la cuenta de Google", async () => {
  await conFetch(falla(401, { error: { status: "UNAUTHENTICATED", message: "x" } }), async () => {
    await assert.rejects(
      () => consultarGaql(CRED, "1", "SELECT 1"),
      (e) => e instanceof GoogleAdsNativoError && e.requiereAutorizar === true && /Integraciones/.test(e.message),
    );
  });
});

test("un 403 dice que falta permiso y no pide reconectar", async () => {
  await conFetch(falla(403, { error: { status: "PERMISSION_DENIED" } }), async () => {
    await assert.rejects(
      () => consultarGaql(CRED, "1", "SELECT 1"),
      (e) => e.status === 403 && e.requiereAutorizar === false && /permiso/.test(e.message),
    );
  });
});

test("el error técnico de Google se conserva para la bitácora pero no en el mensaje", async () => {
  await conFetch(falla(400, { error: { status: "INVALID_ARGUMENT", message: "secreto interno" } }), async () => {
    await assert.rejects(
      () => consultarGaql(CRED, "1", "SELECT 1"),
      (e) => e.detalle?.status === "INVALID_ARGUMENT" && !/secreto/.test(e.message),
    );
  });
});

test("un corte de red se convierte en un error entendible", async () => {
  await conFetch(() => { throw new Error("ECONNRESET"); }, async () => {
    await assert.rejects(
      () => consultarGaql(CRED, "1", "SELECT 1"),
      (e) => e.status === 504 && /Intenta de nuevo/.test(e.message),
    );
  });
});

const CAMBIOS = {
  titulares: [{ texto: "Uno" }, { texto: "Dos", fijado: "HEADLINE_1" }, { texto: "Tres" }],
  descripciones: [{ texto: "Descripción uno" }, { texto: "Descripción dos" }],
  urlsFinales: ["https://colbun.cl/hogar"],
};

test("la mutación edita el mismo anuncio y manda la lista completa con su máscara", () => {
  const { ruta, cuerpo } = armarMutacionRsa("423-204-0466", "825843439416", CAMBIOS);
  assert.equal(ruta, "customers/4232040466/ads:mutate");
  const [op] = cuerpo.operations;
  assert.equal(op.update.resourceName, "customers/4232040466/ads/825843439416");
  assert.deepEqual(op.update.responsiveSearchAd.headlines, [
    { text: "Uno" },
    { text: "Dos", pinnedField: "HEADLINE_1" },
    { text: "Tres" },
  ]);
  assert.deepEqual(op.update.finalUrls, ["https://colbun.cl/hogar"]);
  assert.equal(op.updateMask, "responsiveSearchAd.headlines,responsiveSearchAd.descriptions,finalUrls");
  assert.equal(cuerpo.validateOnly, false);
  assert.equal(cuerpo.partialFailure, false);
});

test("solo entra a la máscara lo que se cambió: un campo ausente no se toca", () => {
  const { cuerpo } = armarMutacionRsa("1", "2", { urlsFinales: ["https://x.cl"] });
  const [op] = cuerpo.operations;
  assert.equal(op.updateMask, "finalUrls");
  assert.equal("responsiveSearchAd" in op.update, false);
});

test("path vacío se manda (para borrarlo) y no se confunde con ausente", () => {
  const { cuerpo } = armarMutacionRsa("1", "2", { path1: "" });
  const [op] = cuerpo.operations;
  assert.equal(op.update.responsiveSearchAd.path1, "");
  assert.equal(op.updateMask, "responsiveSearchAd.path1");
});

test("validateOnly viaja a Google para simular sin aplicar", async () => {
  await conFetch(ok({ results: [{ resourceName: "customers/1/ads/2" }] }), async (llamadas) => {
    const r = await actualizarAnuncioRsa(CRED, "1", "2", CAMBIOS, { validateOnly: true });
    assert.equal(r.soloValidado, true);
    assert.equal(JSON.parse(llamadas[0].init.body).validateOnly, true);
  });
});

test("editar de verdad no manda validateOnly y devuelve el recurso", async () => {
  await conFetch(ok({ results: [{ resourceName: "customers/1/ads/2" }] }), async (llamadas) => {
    const r = await actualizarAnuncioRsa(CRED, "1", "2", CAMBIOS);
    assert.equal(r.soloValidado, false);
    assert.equal(r.resourceName, "customers/1/ads/2");
    assert.equal(JSON.parse(llamadas[0].init.body).validateOnly, false);
  });
});

test("un cambio inválido se rechaza ANTES de llamar a Google", async () => {
  await conFetch(ok({}), async (llamadas) => {
    await assert.rejects(
      () => actualizarAnuncioRsa(CRED, "1", "2", { titulares: [{ texto: "x".repeat(31) }] }),
      (e) => e.status === 400 && /caracteres/.test(e.message),
    );
    assert.equal(llamadas.length, 0);
  });
});

test("validación: límites de titulares, descripciones, paths y URL", () => {
  assert.deepEqual(validarCambiosRsa(CAMBIOS), []);
  assert.match(validarCambiosRsa({ titulares: [{ texto: "a" }, { texto: "b" }] })[0], /entre 3 y 15/);
  assert.match(validarCambiosRsa({ titulares: Array.from({ length: 16 }, () => ({ texto: "a" })) })[0], /entre 3 y 15/);
  assert.match(validarCambiosRsa({ descripciones: [{ texto: "a" }] })[0], /entre 2 y 4/);
  assert.match(validarCambiosRsa({ descripciones: [{ texto: "a" }, { texto: "y".repeat(91) }] })[0], /90/);
  assert.match(validarCambiosRsa({ path1: "z".repeat(16) })[0], /15/);
  assert.match(validarCambiosRsa({ urlsFinales: ["colbun.cl"] })[0], /no es válida/);
  assert.match(validarCambiosRsa({ urlsFinales: [] })[0], /Falta la URL/);
  assert.match(validarCambiosRsa({ titulares: [{ texto: "a" }, { texto: " " }, { texto: "c" }] })[0], /vacío/);
});

test("un cambio vacío no se envía", () => {
  assert.match(validarCambiosRsa({})[0], /ningún cambio/);
});

// ---- Display con imagen (API de Google Ads) ----
const nativo = await import("../lib/google-ads-nativo.ts");

function pngDe(ancho, alto) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  v.setUint32(16, ancho);
  v.setUint32(20, alto);
  return b;
}

const ANUNCIO_DISPLAY = {
  titulares: ["Energía para tu empresa"],
  tituloLargo: "Soluciones energéticas a medida para tu empresa",
  descripciones: ["Cotiza hoy con Colbún."],
  nombreNegocio: "Colbún",
  urlFinal: "https://www.colbun.cl",
  imagenPaisajeUrl: "https://ejemplo.com/h.png",
  imagenCuadradaUrl: "https://ejemplo.com/s.png",
};

test("dimensionesDeImagen lee el ancho y el alto de un PNG", () => {
  assert.deepEqual(nativo.dimensionesDeImagen(pngDe(1200, 628)), { ancho: 1200, alto: 628 });
  assert.equal(nativo.dimensionesDeImagen(new Uint8Array([1, 2, 3, 4, 5])), null);
});

test("validarAnuncioDisplay exige textos dentro de límite y las dos imágenes", () => {
  assert.deepEqual(nativo.validarAnuncioDisplay(ANUNCIO_DISPLAY), []);
  const malo = nativo.validarAnuncioDisplay({
    ...ANUNCIO_DISPLAY,
    titulares: ["x".repeat(31)],
    tituloLargo: "",
    nombreNegocio: "n".repeat(26),
    imagenCuadradaUrl: "",
  });
  assert.equal(malo.length, 4);
});

test("el anuncio de Display nace ACTIVO y apunta a los recursos subidos", () => {
  const { ruta, cuerpo } = nativo.armarCreacionDisplay("423-204-0466", "196087153410", ANUNCIO_DISPLAY, {
    paisaje: "customers/423204046 6/assets/1".replace(" ", ""),
    cuadrada: "customers/4232040466/assets/2",
    logo: null,
  });
  assert.equal(ruta, "customers/4232040466/adGroupAds:mutate");
  const op = cuerpo.operations[0].create;
  assert.equal(op.status, "ENABLED");
  assert.equal(op.adGroup, "customers/4232040466/adGroups/196087153410");
  assert.equal(op.ad.responsiveDisplayAd.marketingImages[0].asset, "customers/4232040466/assets/1");
  assert.equal(op.ad.responsiveDisplayAd.logoImages, undefined);
});

test("crearAnuncioDisplay rechaza imágenes locales sin llamar a Google", async () => {
  await assert.rejects(
    () =>
      nativo.crearAnuncioDisplay({ accessToken: "x", developerToken: "x", apiVersion: "v20", managerId: null }, "4232040466", "1", {
        ...ANUNCIO_DISPLAY,
        imagenPaisajeUrl: "https://localhost/h.png",
      }),
    /dirección pública/,
  );
});

test("campaña de Google: fechas, redes y rotación arman la mutación exacta; fin vacío = sin fin", () => {
  const { ruta, cuerpo } = nativo.armarMutacionCampana("423-204-0466", "24327045550", {
    inicio: "2026-11-01",
    fin: "",
    redes: { busqueda: true, asociadas: false, display: false },
    rotacion: "ROTATE_INDEFINITELY",
  });
  assert.equal(ruta, "customers/4232040466/campaigns:mutate");
  const op = cuerpo.operations[0];
  assert.equal(op.update.resourceName, "customers/4232040466/campaigns/24327045550");
  assert.equal(op.update.startDateTime, "2026-11-01 00:00:00");
  assert.equal(op.update.endDateTime, "2037-12-30 00:00:00");
  assert.equal(op.update.adServingOptimizationStatus, "ROTATE_INDEFINITELY");
  assert.match(op.updateMask, /networkSettings\.targetSearchNetwork/);
});

test("campaña de Google: validaciones de fechas y redes", () => {
  assert.deepEqual(nativo.validarCambiosCampana({ inicio: "2026-11-01", fin: "2026-12-01" }), []);
  assert.ok(nativo.validarCambiosCampana({ inicio: "2026-12-01", fin: "2026-11-01" }).some((m) => /anterior/.test(m)));
  assert.ok(nativo.validarCambiosCampana({ redes: { busqueda: false, asociadas: false, display: true } }).some((m) => /Búsqueda/.test(m)));
  assert.ok(nativo.validarCambiosCampana({ inicio: "mañana" }).length > 0);
});

// ---- Performance Max ----
const PMAX = {
  nombre: "[LDS] [GO] Prueba PMax",
  presupuestoDiarioMicros: 10_000 * 1_000_000,
  urlFinal: "https://www.colbun.cl",
  titulares: ["Uno", "Dos", "Tres"],
  titulosLargos: ["Un título largo de prueba"],
  descripciones: ["Descripción corta", "Otra descripción un poco más larga que la primera"],
  nombreNegocio: "Colbún",
  imagenPaisajeUrl: "https://ejemplo.com/h.png",
  imagenCuadradaUrl: "https://ejemplo.com/s.png",
  logoUrl: "https://ejemplo.com/l.png",
  ubicaciones: ["2152"],
};

test("Performance Max: validación de textos, logo y descripción corta", () => {
  assert.deepEqual(nativo.validarPmax(PMAX), []);
  const malo = nativo.validarPmax({ ...PMAX, titulares: ["a", "b"], logoUrl: "", descripciones: ["x".repeat(61), "y".repeat(70)], ubicaciones: [] });
  assert.ok(malo.some((m) => /títulos cortos/.test(m)));
  assert.ok(malo.some((m) => /logo/.test(m)));
  assert.ok(malo.some((m) => /60 caracteres/.test(m)));
  assert.ok(malo.some((m) => /ubicación/.test(m)));
});

test("Performance Max: una sola mutación atómica, activa, con nombre del negocio y logo a nivel de campaña", () => {
  const imgs = [
    { nombre: "h", base64: "AAAA", campo: "MARKETING_IMAGE" },
    { nombre: "s", base64: "BBBB", campo: "SQUARE_MARKETING_IMAGE" },
    { nombre: "l", base64: "CCCC", campo: "LOGO" },
  ];
  const { ruta, cuerpo } = nativo.armarMutacionPmax("423-204-0466", PMAX, imgs, { validateOnly: true, sello: 1 });
  assert.equal(ruta, "customers/4232040466/googleAds:mutate");
  assert.equal(cuerpo.validateOnly, true);
  const ops = cuerpo.mutateOperations;
  const campana = ops.find((o) => o.campaignOperation).campaignOperation.create;
  assert.equal(campana.status, "ENABLED");
  assert.equal(campana.advertisingChannelType, "PERFORMANCE_MAX");
  const deCampana = ops.filter((o) => o.campaignAssetOperation).map((o) => o.campaignAssetOperation.create.fieldType).sort();
  assert.deepEqual(deCampana, ["BUSINESS_NAME", "LOGO"]);
  const delGrupo = ops.filter((o) => o.assetGroupAssetOperation).map((o) => o.assetGroupAssetOperation.create.fieldType);
  assert.ok(!delGrupo.includes("LOGO") && !delGrupo.includes("BUSINESS_NAME"));
  assert.equal(delGrupo.filter((f) => f === "HEADLINE").length, 3);
  assert.equal(ops.find((o) => o.assetGroupOperation).assetGroupOperation.create.status, "ENABLED");
});

const { armarMutacionBusqueda, validarBusqueda } = await import("../lib/google-ads-nativo.ts");

function datosBusqueda(over = {}) {
  return {
    nombre: "Campaña de prueba",
    presupuestoDiarioMicros: 10_000_000,
    puja: { tipo: "clics", cpcMaximoMicros: 300_000 },
    redes: { socios: true, display: false },
    presencia: "presencia",
    ubicaciones: ["2152"],
    excluidas: [],
    idiomas: ["1003"],
    programacion: [{ dias: ["MONDAY", "TUESDAY"], desde: 9, hasta: 18, ajuste: 1.2 }],
    inicio: null,
    fin: "2026-12-31",
    rotacion: "indefinida",
    plantillaSeguimiento: "",
    sufijoUrl: "utm_source=google",
    grupo: { nombre: "Grupo", cpcMicros: 250_000 },
    palabras: [{ texto: "zapatos", tipo: "EXACT" }],
    negativas: [{ texto: "gratis", tipo: "BROAD" }],
    anuncio: { urlFinal: "https://ejemplo.com", titulares: ["Uno", "Dos", "Tres"], descripciones: ["Descripción uno", "Descripción dos"], path1: "ruta", path2: "" },
    enlaces: [{ texto: "Nosotros", descripcion1: "Quiénes somos", descripcion2: "Nuestra historia", url: "https://ejemplo.com/n" }],
    destacados: ["Envío gratis"],
    fragmento: { encabezado: "Servicios", valores: ["A", "B", "C"] },
    llamada: null,
    activarHijos: true,
    ...over,
  };
}

test("la campaña de Búsqueda nativa nace activa, con su estructura completa en una sola mutación", () => {
  const { ruta, cuerpo } = armarMutacionBusqueda("123-456-7890", datosBusqueda(), { validateOnly: true, sello: 1 });
  assert.equal(ruta, "customers/1234567890/googleAds:mutate");
  assert.equal(cuerpo.validateOnly, true);
  const ops = cuerpo.mutateOperations;
  const campana = ops.find((o) => o.campaignOperation).campaignOperation.create;
  assert.equal(campana.status, "ENABLED");
  assert.equal(campana.advertisingChannelType, "SEARCH");
  assert.deepEqual(campana.targetSpend, { cpcBidCeilingMicros: "300000" });
  assert.equal(campana.networkSettings.targetSearchNetwork, true);
  assert.equal(campana.geoTargetTypeSetting.positiveGeoTargetType, "PRESENCE");
  assert.equal(campana.adServingOptimizationStatus, undefined, "la rotación ya no va en la campaña");
  assert.equal(campana.endDateTime, "2026-12-31 23:59:59");
  const grupo = ops.find((o) => o.adGroupOperation).adGroupOperation.create;
  assert.equal(grupo.adRotationMode, "ROTATE_FOREVER");
  assert.equal(grupo.cpcBidMicros, "250000");
  assert.equal(ops.filter((o) => o.campaignCriterionOperation?.create.adSchedule).length, 2);
  assert.equal(ops.find((o) => o.campaignCriterionOperation?.create.adSchedule).campaignCriterionOperation.create.bidModifier, 1.2);
  assert.equal(ops.find((o) => o.adGroupCriterionOperation).adGroupCriterionOperation.create.keyword.matchType, "EXACT");
  const campos = ops.filter((o) => o.campaignAssetOperation).map((o) => o.campaignAssetOperation.create.fieldType).sort();
  assert.deepEqual(campos, ["CALLOUT", "SITELINK", "STRUCTURED_SNIPPET"]);
});

test("cada estrategia de puja se traduce a su campo de Google", () => {
  const camp = (puja) => armarMutacionBusqueda("1", datosBusqueda({ puja }), { sello: 1 }).cuerpo.mutateOperations.find((o) => o.campaignOperation).campaignOperation.create;
  assert.deepEqual(camp({ tipo: "conversiones", cpaObjetivoMicros: 5_000_000 }).maximizeConversions, { targetCpaMicros: "5000000" });
  assert.deepEqual(camp({ tipo: "valor_conversion", roasObjetivo: 3 }).maximizeConversionValue, { targetRoas: 3 });
  assert.deepEqual(camp({ tipo: "cpc_manual", mejorarCpc: true }).manualCpc, { enhancedCpcEnabled: true });
  assert.deepEqual(camp({ tipo: "cuota_impresiones", ubicacion: "TOP_OF_PAGE", porcentaje: 60, cpcMaximoMicros: 900_000 }).targetImpressionShare, { location: "TOP_OF_PAGE", locationFractionMicros: "600000", cpcBidCeilingMicros: "900000" });
});

test("las reglas de Google se validan antes de enviar nada", () => {
  assert.deepEqual(validarBusqueda(datosBusqueda()), []);
  const malos = validarBusqueda(datosBusqueda({
    palabras: [],
    anuncio: { urlFinal: "ejemplo.com", titulares: ["Uno"], descripciones: ["Una"], path1: "", path2: "x" },
    enlaces: [{ texto: "Nosotros", descripcion1: "Solo una", descripcion2: "", url: "https://ejemplo.com" }],
    fin: "2020-01-01",
    inicio: "2026-01-01",
  }));
  assert.ok(malos.some((m) => /palabra clave/.test(m)));
  assert.ok(malos.some((m) => /URL final/.test(m)));
  assert.ok(malos.some((m) => /3 y 15 títulos/.test(m)));
  assert.ok(malos.some((m) => /ruta visible 2 exige/.test(m)));
  assert.ok(malos.some((m) => /las dos descripciones o ninguna/.test(m)));
  assert.ok(malos.some((m) => /anterior a la de inicio/.test(m)));
});
