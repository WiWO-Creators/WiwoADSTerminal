// Resolvedor para los tests: el código de `lib/` importa como `@/lib/x` (alias
// de Vite/tsconfig) y a veces con rutas relativas sin extensión (`./x`), y
// Node, corriendo `.ts` directo, no conoce ninguna de las dos. Solo se
// registra desde `tests/_alias.mjs`.
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";

const raiz = process.cwd();
const EXTENSIONES = [".ts", ".tsx"];

function conExtension(base) {
  for (const ext of EXTENSIONES) {
    if (existsSync(`${base}${ext}`)) return `${base}${ext}`;
  }
  if (existsSync(join(base, "index.ts"))) return join(base, "index.ts");
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith("@/")) {
    base = join(raiz, specifier.slice(2));
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !extname(specifier) &&
    context.parentURL?.startsWith("file:")
  ) {
    base = join(dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const archivo = extname(base) ? base : conExtension(base);
    if (archivo) return nextResolve(pathToFileURL(archivo).href, context);
  }
  return nextResolve(specifier, context);
}
