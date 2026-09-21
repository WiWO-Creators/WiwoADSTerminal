// Le enseña a Node a resolver `cloudflare:workers`, un esquema que solo existe
// dentro de Cloudflare Workers. Se carga con `registrar.mjs`.
const PUENTE = new URL("./cloudflare-workers.mjs", import.meta.url).href;

export async function resolve(specifier, context, siguiente) {
  if (specifier === "cloudflare:workers") {
    return { url: PUENTE, shortCircuit: true };
  }
  return siguiente(specifier, context);
}
