// Uso (mismo build, sin cambiar el código de la app):
//   NODE_OPTIONS="--import /ruta/a/servidor/registrar.mjs" npx vinext start -p 3030
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
