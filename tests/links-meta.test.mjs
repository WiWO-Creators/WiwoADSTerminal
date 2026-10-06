import "./_alias.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const { clavesDeLink, resolverLinks, buscarPorNombre } = await import("../lib/links-meta-pura.ts");

const posts = [
  { id: "111_222333444", platform: "facebook", permalink: "https://www.facebook.com/anker/posts/222333444" },
  { id: "111_999888777", platform: "facebook", permalink: "https://www.facebook.com/anker/posts/pfbid0AbCdEfGhIj" },
  { id: "1789", platform: "instagram", permalink: "https://www.instagram.com/p/CxYz123AbC/" },
  { id: "1790", platform: "instagram", permalink: "https://www.instagram.com/reel/DdEeFf456/" },
];

test("extrae la clave de los formatos habituales de link", () => {
  assert.ok(clavesDeLink("https://www.facebook.com/permalink.php?story_fbid=222333444&id=111").includes("222333444"));
  assert.ok(clavesDeLink("https://facebook.com/anker/posts/pfbid0AbCdEfGhIj?ref=x").includes("pfbid0abcdefghij"));
  assert.ok(clavesDeLink("https://www.instagram.com/p/CxYz123AbC/?igsh=zzz").includes("cxyz123abc"));
  assert.deepEqual(clavesDeLink("no es un link"), []);
});

test("casa cada link con su publicación y reporta los que no encuentra", () => {
  const r = resolverLinks(
    [
      "https://www.facebook.com/permalink.php?story_fbid=222333444&id=111",
      "https://facebook.com/anker/posts/pfbid0AbCdEfGhIj",
      "https://www.instagram.com/reel/DdEeFf456/",
      "https://facebook.com/anker/posts/555566667777",
      "https://ejemplo.com/algo",
    ],
    posts,
  );
  assert.deepEqual(r.encontrados.map((e) => e.post.id), ["111_222333444", "111_999888777", "1790"]);
  assert.equal(r.noEncontrados.length, 2);
  assert.match(r.noEncontrados[1].motivo, /ni de Instagram/);
});

test("un link repetido no duplica la publicación y una red no se confunde con la otra", () => {
  const r = resolverLinks(["https://facebook.com/a/posts/222333444", "https://facebook.com/b/posts/222333444"], posts);
  assert.equal(r.encontrados.length, 1);
  assert.equal(resolverLinks(["https://instagram.com/p/222333444/"], posts).encontrados.length, 0);
});

test("buscarPorNombre exige todas las palabras y no adivina entre varios", () => {
  const conjuntos = [{ nombre: "Giveaway Anker Chile" }, { nombre: "Giveaway Anker Argentina" }, { nombre: "Always on" }];
  assert.equal(buscarPorNombre(conjuntos, "giveaway chile").unico?.nombre, "Giveaway Anker Chile");
  const varios = buscarPorNombre(conjuntos, "Giveaway");
  assert.equal(varios.unico, null);
  assert.equal(varios.candidatos.length, 2);
});
