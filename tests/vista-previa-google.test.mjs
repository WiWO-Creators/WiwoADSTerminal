import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { archivosDeRecursos, conVisuales, detalleAnuncioGaql, recursosDeVisuales, visualesDeAnunciosGaql } = await import("../lib/detalle-entidad.ts");
const { gaqlDeRecursos } = await import("../lib/google-ads-nativo.ts");
const {
  dominioDe, familiaDeTipo, formatosDeFamilia, humanizarCta, imagenPara, piezaDeAnuncioGoogle, piezaDeGrupoDeRecursos, titularDeBusqueda,
} = await import("../lib/vista-previa-google-pura.ts");

const FILA_DISPLAY = {
  adGroupAd: {
    ad: {
      id: "77",
      type: "RESPONSIVE_DISPLAY_AD",
      responsiveDisplayAd: {
        headlines: [{ text: "Fertilizantes" }, { text: "Mejores cultivos" }],
        longHeadline: { text: "Fertilizantes de alta calidad para tu cultivo" },
        descriptions: [{ text: "Conoce la línea completa" }],
        businessName: "SQM",
        marketingImages: [{ asset: "customers/1/assets/10" }],
        squareMarketingImages: [{ asset: "customers/1/assets/11" }],
        logoImages: [{ asset: "customers/1/assets/12" }],
        callToActionText: "LEARN_MORE",
      },
    },
  },
};

const ARCHIVOS = archivosDeRecursos([
  { asset: { resourceName: "customers/1/assets/10", imageAsset: { fullSize: { url: "https://img/h.png" } } } },
  { asset: { resourceName: "customers/1/assets/11", imageAsset: { fullSize: { url: "https://img/s.png" } } } },
  { asset: { resourceName: "customers/1/assets/12", imageAsset: { fullSize: { url: "https://img/l.png" } } } },
  { asset: { resourceName: "customers/1/assets/13", youtubeVideoAsset: { youtubeVideoId: "abc123" } } },
]);

test("recursosDeVisuales junta los recursos de imágenes y videos sin repetir", () => {
  const filas = [FILA_DISPLAY, FILA_DISPLAY];
  assert.deepEqual(recursosDeVisuales(filas).sort(), ["customers/1/assets/10", "customers/1/assets/11", "customers/1/assets/12"]);
});

test("visualesDeAnunciosGaql arma textos, imágenes por forma y logo de un anuncio Display", () => {
  const v = visualesDeAnunciosGaql([FILA_DISPLAY], ARCHIVOS).get("77");
  assert.deepEqual(v.titulares, ["Fertilizantes", "Mejores cultivos"]);
  assert.deepEqual(v.titularesLargos, ["Fertilizantes de alta calidad para tu cultivo"]);
  assert.equal(v.negocio, "SQM");
  assert.equal(v.cta, "LEARN_MORE");
  assert.deepEqual(v.imagenes.map((i) => i.forma), ["horizontal", "cuadrada", "logo"]);
});

test("visualesDeAnunciosGaql lee los videos de YouTube de un anuncio de video", () => {
  const fila = { adGroupAd: { ad: { id: "5", type: "VIDEO_RESPONSIVE_AD", videoResponsiveAd: { headlines: [{ text: "Mira" }], videos: [{ asset: "customers/1/assets/13" }] } } } };
  const v = visualesDeAnunciosGaql([fila], ARCHIVOS).get("5");
  assert.deepEqual(v.videosYoutube, ["abc123"]);
});

test("una imagen que Google no entrega no rompe el anuncio", () => {
  const v = visualesDeAnunciosGaql([FILA_DISPLAY], new Map()).get("77");
  assert.equal(v.imagenes.length, 0);
  assert.equal(v.titulares.length, 2);
});

test("conVisuales suma lo visual solo al anuncio que lo tiene", () => {
  const base = detalleAnuncioGaql({ adGroupAd: { ad: { id: "77", type: "RESPONSIVE_DISPLAY_AD", finalUrls: ["https://www.sqm.com/agro"] }, status: "ENABLED" }, adGroup: { id: "1" }, campaign: { id: "2" } }, "123");
  const otro = detalleAnuncioGaql({ adGroupAd: { ad: { id: "78", type: "RESPONSIVE_SEARCH_AD" }, status: "ENABLED" }, adGroup: { id: "1" }, campaign: { id: "2" } }, "123");
  const salida = conVisuales([base, otro], visualesDeAnunciosGaql([FILA_DISPLAY], ARCHIVOS));
  assert.equal(salida[0].contenido.visual.negocio, "SQM");
  assert.equal(salida[1].contenido.visual, undefined);
});

test("gaqlDeRecursos solo acepta nombres de recurso válidos y parte en lotes de 100", () => {
  const nombres = Array.from({ length: 230 }, (_, i) => `customers/1/assets/${i + 1}`);
  assert.equal(gaqlDeRecursos(nombres).length, 3);
  assert.equal(gaqlDeRecursos(["customers/1/assets/1'; DROP"]).length, 0);
});

test("la familia decide en qué superficies de Google sale", () => {
  assert.equal(familiaDeTipo("RESPONSIVE_SEARCH_AD"), "busqueda");
  assert.equal(familiaDeTipo("RESPONSIVE_DISPLAY_AD"), "display");
  assert.equal(familiaDeTipo("VIDEO_RESPONSIVE_AD"), "video");
  assert.equal(familiaDeTipo("DEMAND_GEN_MULTI_ASSET_AD"), "demanda");
  assert.deepEqual(formatosDeFamilia("busqueda"), ["busqueda-movil", "busqueda-escritorio"]);
  assert.ok(formatosDeFamilia("pmax").includes("maps"));
  assert.ok(formatosDeFamilia("demanda").includes("discover"));
});

test("la pieza de un anuncio de búsqueda arma la URL visible con sus rutas", () => {
  const a = detalleAnuncioGaql(
    {
      adGroupAd: { ad: { id: "9", type: "RESPONSIVE_SEARCH_AD", finalUrls: ["https://www.colbun.cl/energia"], responsiveSearchAd: { headlines: [{ text: "Energía" }, { text: "Limpia" }], descriptions: [{ text: "Conoce más" }], path1: "energia", path2: "limpia" } }, status: "ENABLED" },
      adGroup: { id: "1" },
      campaign: { id: "2" },
    },
    "123",
  );
  const p = piezaDeAnuncioGoogle(a, "Colbún");
  assert.equal(p.familia, "busqueda");
  assert.equal(p.urlVisible, "colbun.cl › energia › limpia");
  assert.deepEqual(p.titulares, ["Energía", "Limpia"]);
  assert.equal(p.negocio, "Colbún");
});

test("la pieza de un grupo de recursos separa imágenes por forma y toma el nombre del negocio", () => {
  const p = piezaDeGrupoDeRecursos(
    {
      id: "1", campaignId: "2", nombre: "G", estado: "ENABLED", urlsFinales: ["https://sqm.com/a"], path1: "agro", path2: null,
      recursos: [
        { campo: "HEADLINE", estado: "ENABLED", texto: "Uno", imagenUrl: null, videoYoutube: null },
        { campo: "BUSINESS_NAME", estado: "ENABLED", texto: "SQM", imagenUrl: null, videoYoutube: null },
        { campo: "MARKETING_IMAGE", estado: "ENABLED", texto: null, imagenUrl: "https://i/h", videoYoutube: null },
        { campo: "SQUARE_MARKETING_IMAGE", estado: "ENABLED", texto: null, imagenUrl: "https://i/s", videoYoutube: null },
        { campo: "LOGO", estado: "ENABLED", texto: null, imagenUrl: "https://i/l", videoYoutube: null },
        { campo: "YOUTUBE_VIDEO", estado: "ENABLED", texto: null, imagenUrl: null, videoYoutube: "vid1" },
      ],
    },
    "x",
  );
  assert.equal(p.negocio, "SQM");
  assert.equal(p.logo, "https://i/l");
  assert.equal(p.videoYoutube, "vid1");
  assert.equal(imagenPara(p, "discover").forma, "horizontal");
  assert.equal(imagenPara(p, "gmail").forma, "cuadrada");
  assert.equal(p.urlVisible, "sqm.com › agro");
});

test("utilidades de texto", () => {
  assert.equal(dominioDe("https://www.sqm.com/x"), "sqm.com");
  assert.equal(dominioDe(null), "");
  assert.equal(humanizarCta("LEARN_MORE"), "Más información");
  assert.equal(humanizarCta("SOMETHING_NEW"), "Something new");
  assert.equal(titularDeBusqueda(["A", "B", "C", "D"]), "A | B | C");
  assert.equal(titularDeBusqueda(["x".repeat(60), "y".repeat(60)]), "x".repeat(60));
});
