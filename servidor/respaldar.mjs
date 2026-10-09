// Respaldo consistente de la base SQLite de produccion (modo WAL: no sirve un cp simple).
//   WIWO_DB_PATH=/var/lib/wiwo-ads/wiwo.sqlite node servidor/respaldar.mjs
// Deja la copia en <carpeta de la base>/respaldos/wiwo-deploy-AAAAMMDD-HHMMSS.sqlite
// y conserva solo las 20 copias de deploy mas recientes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rutaDb = path.resolve(raiz, process.env.WIWO_DB_PATH ?? "datos/wiwo.sqlite");
if (!fs.existsSync(rutaDb)) {
  console.log("Respaldo omitido: no existe " + rutaDb);
  process.exit(0);
}

const carpeta = path.join(path.dirname(rutaDb), "respaldos");
fs.mkdirSync(carpeta, { recursive: true });
const p2 = (n) => String(n).padStart(2, "0");
const d = new Date();
const marca = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
const destino = path.join(carpeta, "wiwo-deploy-" + marca + ".sqlite");

const origen = new Database(rutaDb, { readonly: true, fileMustExist: true });
await origen.backup(destino);
origen.close();

const copia = new Database(destino, { readonly: true });
const estado = copia.prepare("pragma integrity_check").all().map((r) => r.integrity_check).join(",");
copia.close();
for (const ext of ["-shm", "-wal"]) fs.rmSync(destino + ext, { force: true });
if (estado !== "ok") {
  console.error("Respaldo con integrity_check = " + estado);
  process.exit(1);
}
console.log("Respaldo listo: " + destino + " (" + fs.statSync(destino).size + " bytes, integrity_check ok)");

const viejos = fs.readdirSync(carpeta).filter((f) => /^wiwo-deploy-\d{8}-\d{6}\.sqlite$/.test(f)).sort().slice(0, -20);
for (const f of viejos) for (const ext of ["", "-shm", "-wal"]) fs.rmSync(path.join(carpeta, f + ext), { force: true });
if (viejos.length) console.log("Respaldos antiguos eliminados: " + viejos.length);
