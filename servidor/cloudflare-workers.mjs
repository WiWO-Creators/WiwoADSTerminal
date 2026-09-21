// Sustituto de `cloudflare:workers` para correr la app en Node (VPS).
//
// En Cloudflare, `env` trae las variables y los "bindings" (D1, R2). Acá los
// mismos nombres se sirven con SQLite en un archivo y una carpeta en disco,
// así el código de la app no se entera de la diferencia.
//
// Variables propias de este puente (además de las de la app):
//   WIWO_DB_PATH    archivo SQLite         (por defecto ./datos/wiwo.sqlite)
//   WIWO_MEDIA_DIR  carpeta de creativos   (por defecto ./datos/creativos)
import path from "node:path";

import { crearD1 } from "./d1.mjs";
import { crearR2 } from "./r2.mjs";

const raiz = process.cwd();
const rutaDb = path.resolve(raiz, process.env.WIWO_DB_PATH ?? "datos/wiwo.sqlite");
const carpetaMedia = path.resolve(raiz, process.env.WIWO_MEDIA_DIR ?? "datos/creativos");

export const env = {
  ...process.env,
  // Le avisa a la app que corre en un servidor propio: ignora las cabeceras
  // `oai-authenticated-user-*` (las puede falsificar cualquiera).
  WIWO_RUNTIME: "node",
  DB: crearD1(rutaDb),
  MEDIA: crearR2(carpetaMedia),
};
