// Aplica las migraciones de `drizzle/` en orden sobre el SQLite del VPS.
// Es idempotente: anota cada una en `_migraciones` y no repite las aplicadas.
//   node servidor/migrar.mjs            (usa WIWO_DB_PATH o ./datos/wiwo.sqlite)
import fs from "node:fs";
import path from "node:path";

import { crearD1 } from "./d1.mjs";

const raiz = process.cwd();
const rutaDb = path.resolve(raiz, process.env.WIWO_DB_PATH ?? "datos/wiwo.sqlite");
const carpeta = path.resolve(raiz, "drizzle");

const db = crearD1(rutaDb);
await db.exec(
  "CREATE TABLE IF NOT EXISTS _migraciones (nombre TEXT PRIMARY KEY, aplicada_en INTEGER NOT NULL)",
);
const hechas = new Set(
  (await db.prepare("SELECT nombre FROM _migraciones").all()).results.map((f) => f.nombre),
);

const archivos = fs
  .readdirSync(carpeta)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let nuevas = 0;
for (const archivo of archivos) {
  if (hechas.has(archivo)) continue;
  const sql = fs.readFileSync(path.join(carpeta, archivo), "utf8");
  // Cada migración entera y su registro, en una sola transacción.
  await db.exec(
    `BEGIN;\n${sql}\nINSERT INTO _migraciones (nombre, aplicada_en) VALUES ('${archivo}', ${Date.now()});\nCOMMIT;`,
  );
  console.log(`  aplicada  ${archivo}`);
  nuevas++;
}
console.log(
  nuevas === 0 ? "Base al día." : `Listo: ${nuevas} migración(es) aplicada(s) sobre ${rutaDb}`,
);
