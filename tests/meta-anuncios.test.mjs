import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { filaDeAnuncioMeta } = await import("../lib/meta-anuncios-pura.ts");
const { detalleAnuncioMeta } = await import("../lib/detalle-entidad.ts");

const AD = {
  id: "555",
  name: "PRUEBA-WIWOADS basico",
  status: "ACTIVE",
  effective_status: "IN_PROCESS",
  adset_id: "444",
  campaign_id: "333",
  creative: {
    id: "999",
    effective_object_story_id: "123_456",
    object_story_spec: {
      page_id: "123",
      link_data: { link: "https://sitio.cl/", message: "Texto de prueba", name: "Título", image_hash: "abc", call_to_action: { type: "LEARN_MORE", value: { link: "https://sitio.cl/" } } },
    },
  },
};

test("un anuncio de enlace leído de Meta se traduce a la fila que entiende el detalle", () => {
  const fila = filaDeAnuncioMeta(AD, "act_2006250736667023");
  assert.equal(fila.ad_id, "555");
  assert.equal(fila.account_id, "2006250736667023");
  assert.equal(fila.body, "Texto de prueba");
  assert.equal(fila.title, "Título");
  assert.equal(fila.link, "https://sitio.cl/");
  assert.equal(fila.call_to_action_type, "LEARN_MORE");
  assert.equal(fila.image_hash, "abc");
});

test("el detalle de un anuncio recién creado queda editable (no «recién creado»)", () => {
  const d = detalleAnuncioMeta(filaDeAnuncioMeta(AD, "2006250736667023"));
  assert.equal(d.contenido.textoPrincipal, "Texto de prueba");
  assert.equal(d.contenido.titulo, "Título");
  assert.equal(d.contenido.cta, "LEARN_MORE");
  assert.equal(d.conjuntoId, "444");
  assert.equal(d.edicionDeContenido.editable, true);
});

test("un anuncio de video toma el texto, el título y el destino del video", () => {
  const fila = filaDeAnuncioMeta(
    { id: "7", creative: { object_story_spec: { video_data: { message: "M", title: "T", call_to_action: { type: "SIGN_UP", value: { link: "https://v.cl/" } } } } } },
    "1",
  );
  assert.equal(fila.body, "M");
  assert.equal(fila.title, "T");
  assert.equal(fila.link, "https://v.cl/");
  assert.equal(fila.call_to_action_type, "SIGN_UP");
});

test("sin id no hay anuncio", () => {
  assert.equal(filaDeAnuncioMeta({ name: "x" }, "1"), null);
});
