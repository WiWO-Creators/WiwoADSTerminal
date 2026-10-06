import assert from "node:assert/strict";
import test from "node:test";

import { CTA_CODIGOS, CTA_COMUNES, CTA_CON_DESTINO, CTA_ETIQUETAS, esCta, etiquetaCta } from "../lib/cta.ts";

// Enum de `call_to_action_type` de `create_ad` / `update_ad_creative`, copiado de
// `list_actions` de Windsor (2026-09-29). Si Meta o Windsor agregan uno, se
// actualiza acá a propósito: esta lista es la que evita ofrecer un botón inválido.
const ENUM_WINDSOR = [
  "ADD_TO_CART","APPLY_NOW","AUDIO_CALL","BOOK_NOW","BOOK_TRAVEL","BUY","BUY_NOW","BUY_TICKETS","CALL","CALL_ME","CALL_NOW",
  "CONFIRM","CONTACT","CONTACT_US","DONATE","DONATE_NOW","DOWNLOAD","EVENT_RSVP","FIND_A_GROUP","FIND_YOUR_GROUPS",
  "FOLLOW_NEWS_STORYLINE","FOLLOW_PAGE","FOLLOW_USER","GET_DIRECTIONS","GET_OFFER","GET_OFFER_VIEW","GET_PROMOTIONS","GET_QUOTE",
  "GET_SHOWTIMES","GET_STARTED","INQUIRE_NOW","INSTALL_APP","INSTALL_MOBILE_APP","LEARN_MORE","LIKE_PAGE","LISTEN_MUSIC","LISTEN_NOW",
  "MESSAGE_PAGE","MOBILE_DOWNLOAD","NO_BUTTON","OPEN_INSTANT_APP","OPEN_LINK","ORDER_NOW","PAY_TO_ACCESS","PLAY_GAME",
  "PLAY_GAME_ON_FACEBOOK","PURCHASE_GIFT_CARDS","RAISE_MONEY","RECORD_NOW","REFER_FRIENDS","REQUEST_TIME","SAY_THANKS","SEE_MORE",
  "SELL_NOW","SEND_A_GIFT","SEND_GIFT_MONEY","SEND_UPDATES","SHARE","SHOP_NOW","SIGN_UP","SOTTO_SUBSCRIBE","START_ORDER","SUBSCRIBE",
  "SWIPE_UP_PRODUCT","SWIPE_UP_SHOP","UPDATE_APP","USE_APP","USE_MOBILE_APP","VIDEO_ANNOTATION","VIDEO_CALL","VISIT_PAGES_FEED",
  "WATCH_MORE","WATCH_VIDEO","WHATSAPP_MESSAGE","WOODHENGE_SUPPORT",
];

test("ofrece exactamente los botones que acepta Windsor, ni uno más ni uno menos", () => {
  assert.deepEqual([...CTA_CODIGOS].sort(), [...ENUM_WINDSOR].sort());
  assert.equal(CTA_CODIGOS.length, ENUM_WINDSOR.length);
});

test("no hay códigos repetidos y todos tienen etiqueta en español", () => {
  assert.equal(new Set(CTA_CODIGOS).size, CTA_CODIGOS.length);
  for (const c of CTA_CODIGOS) {
    assert.ok(CTA_ETIQUETAS[c] && CTA_ETIQUETAS[c] !== c, `${c} sin etiqueta`);
  }
});

test("los más usados van primero y son un subconjunto de la lista", () => {
  assert.deepEqual(CTA_CODIGOS.slice(0, CTA_COMUNES.length), [...CTA_COMUNES]);
  for (const c of CTA_COMUNES) assert.ok(ENUM_WINDSOR.includes(c));
});

test("esCta distingue lo que se puede elegir de lo que solo se lee", () => {
  assert.equal(esCta("LEARN_MORE"), true);
  assert.equal(esCta("VIEW_INSTAGRAM_PROFILE"), false, "Meta lo muestra pero no lo acepta al editar");
  assert.equal(esCta("HACKEAR"), false);
  assert.equal(esCta("toString"), false, "no debe colarse por el prototipo");
});

test("etiquetaCta muestra en español incluso botones de solo lectura, y lo desconocido tal cual", () => {
  assert.equal(etiquetaCta("SIGN_UP"), "Registrarse");
  assert.equal(etiquetaCta("VIEW_INSTAGRAM_PROFILE"), "Ver perfil de Instagram");
  assert.equal(etiquetaCta("ALGO_NUEVO"), "ALGO_NUEVO");
  assert.equal(etiquetaCta(null), "—");
});

test("los botones que exigen destino son botones reales", () => {
  for (const c of CTA_CON_DESTINO) assert.ok(ENUM_WINDSOR.includes(c), `${c} no existe`);
});
