import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_PLATFORMS,
  CONECTABLES,
  PLATFORM,
  PLATFORMS,
  capacidadDe,
  isConectable,
  nombreDeNivel,
} from "../lib/plataformas.ts";

// Acciones de escritura que Windsor expone de verdad, copiadas de `list_actions`
// (2026-09-29). Si Windsor agrega o quita una, se actualiza acá a propósito:
// esta lista es la que impide declarar en el registro una acción inventada.
const ACCIONES_WINDSOR = {
  google: new Set([
    "attach_user_list_to_ad_group", "create_customer_match_list", "delete_customer_match_list",
    "detach_user_list_from_ad_group", "create_campaign", "create_ad_group", "create_ad_asset",
    "create_responsive_search_ad", "enable_campaign", "get_customer_match_upload_status",
    "pause_campaign", "enable_ad_group", "pause_ad_group", "enable_ad", "pause_ad",
    "push_keywords", "push_negative_keywords", "rename_campaign", "rename_ad_group",
    "update_ad_group", "rename_customer_match_list", "upload_customer_match_list",
    "update_keywords", "remove_keywords", "remove_negative_keywords", "set_campaign_budget",
    "set_campaign_bidding_strategy", "set_campaign_geo_targeting", "set_campaign_language_targeting",
    "set_ad_schedule", "set_cpc_bid_ceiling", "set_max_cpc", "set_target_cpa", "set_target_roas",
  ]),
  meta: new Set([
    "enable_campaign", "pause_campaign", "enable_adset", "pause_adset", "enable_ad", "pause_ad",
    "set_campaign_budget", "set_adset_budget", "set_page_welcome_message", "create_campaign",
    "create_adset", "duplicate_adset", "create_ad", "create_ad_video", "create_ad_image",
    "boost_post", "update_campaign", "update_adset", "update_ad", "update_ad_creative",
  ]),
};

for (const plataforma of ["google", "meta"]) {
  test(`${plataforma}: toda acción declarada en capacidades existe en Windsor`, () => {
    for (const [nivel, campos] of Object.entries(PLATFORM[plataforma].capacidades)) {
      for (const [campo, cap] of Object.entries(campos)) {
        if (cap.via !== "windsor") continue;
        assert.ok(cap.acciones?.length, `${plataforma}.${nivel}.${campo} sin acciones`);
        for (const accion of cap.acciones) {
          assert.ok(
            ACCIONES_WINDSOR[plataforma].has(accion),
            `${plataforma}.${nivel}.${campo}: "${accion}" no es una acción real de Windsor`,
          );
        }
      }
    }
  });
}

test("una capacidad que no pasa por Windsor no declara acciones de Windsor", () => {
  for (const id of PLATFORMS) {
    for (const campos of Object.values(PLATFORM[id].capacidades)) {
      for (const cap of Object.values(campos)) {
        if (cap.via !== "windsor") assert.equal(cap.acciones, undefined);
        if (cap.via === "ninguna") assert.ok(cap.nota, "un límite debe decir su motivo");
      }
    }
  }
});

test("el contenido de un anuncio se edita en las dos: Meta por Windsor, Google por la API nativa", () => {
  assert.equal(capacidadDe("meta", "anuncio", "url_destino")?.via, "windsor");
  assert.equal(capacidadDe("meta", "anuncio", "imagen")?.via, "windsor");
  for (const campo of ["titulo", "descripcion", "url_destino"]) {
    assert.equal(capacidadDe("google", "anuncio", campo)?.via, "nativa");
  }
});

test("un campo que la plataforma no declara no es editable", () => {
  assert.equal(capacidadDe("google", "campana", "imagen"), null);
  assert.equal(capacidadDe("no-existe", "campana", "nombre"), null);
});

test("los niveles conservan el vocabulario de cada plataforma", () => {
  assert.equal(nombreDeNivel("google", "conjunto"), "Grupo de anuncios");
  assert.equal(nombreDeNivel("meta", "conjunto"), "Conjunto de anuncios");
  assert.equal(nombreDeNivel("desconocida", "campana"), "campana");
});

test("las plataformas con OAuth nativo son un subconjunto de las declaradas", () => {
  for (const c of CONECTABLES) assert.ok(PLATFORMS.includes(c));
  assert.equal(isConectable("google"), true);
  assert.equal(isConectable("tiktok"), false);
});

test("hoy solo Google y Meta están activas", () => {
  assert.deepEqual(ACTIVE_PLATFORMS, ["google", "meta"]);
});
