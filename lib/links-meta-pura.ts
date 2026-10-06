/**
 * Links de contenido de Facebook e Instagram → publicaciones reales. Parte pura (sin red) para poder probarla.
 *
 * Un link pegado por una persona puede ser `facebook.com/Pagina/posts/123`, `…/videos/123`, `…/reel/123`,
 * `…?story_fbid=123&id=456`, `…/permalink.php?story_fbid=…`, `…/posts/pfbid0abc…`, o de Instagram `…/p/CODIGO/`,
 * `…/reel/CODIGO/`. Windsor entrega cada publicación con su `permalink`, así que se compara por la clave que identifica
 * a la publicación dentro del link (el id numérico, el `pfbid` o el código corto de Instagram).
 */

export type PostConLink = { id: string; platform: "facebook" | "instagram"; permalink: string };

/** Todas las claves que pueden identificar la publicación a la que apunta un link. */
export function clavesDeLink(link: string): string[] {
  const claves = new Set<string>();
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return [];
  }
  for (const nombre of ["story_fbid", "fbid", "v", "id"]) {
    const v = url.searchParams.get(nombre);
    if (v && /^[A-Za-z0-9_.-]{5,}$/.test(v)) claves.add(v.toLowerCase());
  }
  const segmentos = url.pathname.split("/").filter(Boolean);
  for (let i = 0; i < segmentos.length; i++) {
    const previo = segmentos[i - 1]?.toLowerCase();
    if (previo && ["posts", "videos", "reel", "reels", "p", "tv", "photos", "permalink"].includes(previo)) {
      const s = segmentos[i];
      if (/^[A-Za-z0-9_-]{5,}$/.test(s)) claves.add(s.toLowerCase());
    }
  }
  // Fotos de Facebook: /photo/?fbid=… ya está cubierto; /photos/a.123/456/ deja el último número.
  const ultimo = segmentos[segmentos.length - 1];
  if (ultimo && /^\d{8,}$/.test(ultimo)) claves.add(ultimo.toLowerCase());
  return [...claves];
}

const dominio = (link: string): "facebook" | "instagram" | null => {
  try {
    const h = new URL(link.trim()).hostname.toLowerCase();
    if (h.includes("instagram.com")) return "instagram";
    if (h.includes("facebook.com") || h.includes("fb.com") || h.includes("fb.watch")) return "facebook";
  } catch {
    // no es un link
  }
  return null;
};

export type ResultadoDeLinks<T extends PostConLink> = {
  encontrados: Array<{ link: string; post: T }>;
  noEncontrados: Array<{ link: string; motivo: string }>;
};

/** Casa cada link con una publicación de la lista. Los que no calzan salen con el motivo, nunca se adivinan. */
export function resolverLinks<T extends PostConLink>(links: string[], posts: T[]): ResultadoDeLinks<T> {
  const encontrados: ResultadoDeLinks<T>["encontrados"] = [];
  const noEncontrados: ResultadoDeLinks<T>["noEncontrados"] = [];
  const vistos = new Set<string>();
  for (const link of links.map((l) => l.trim()).filter(Boolean)) {
    const red = dominio(link);
    if (!red) {
      noEncontrados.push({ link, motivo: "No es un link de Facebook ni de Instagram." });
      continue;
    }
    const claves = clavesDeLink(link);
    const post = posts.find((p) => {
      if (p.platform !== red) return false;
      const enPermalink = new Set(clavesDeLink(p.permalink));
      const idPost = p.id.toLowerCase();
      return claves.some((c) => enPermalink.has(c) || idPost === c || idPost.endsWith(`_${c}`));
    });
    if (!post) {
      noEncontrados.push({ link, motivo: "No encontré esa publicación entre las de la página del cliente (¿es de otra página o es muy antigua?)." });
      continue;
    }
    if (vistos.has(post.id)) continue;
    vistos.add(post.id);
    encontrados.push({ link, post });
  }
  return { encontrados, noEncontrados };
}

/** Elige el conjunto cuyo nombre contiene todas las palabras pedidas; si hay más de uno, no adivina. */
export function buscarPorNombre<T extends { nombre: string | null }>(items: T[], consulta: string): { unico: T | null; candidatos: T[] } {
  const normal = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const palabras = normal(consulta).split(/\s+/).filter((p) => p.length > 1);
  if (palabras.length === 0) return { unico: null, candidatos: [] };
  const candidatos = items.filter((i) => palabras.every((p) => normal(i.nombre ?? "").includes(p)));
  return { unico: candidatos.length === 1 ? candidatos[0] : null, candidatos };
}
