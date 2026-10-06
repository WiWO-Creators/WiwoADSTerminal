// Importar esto PRIMERO en un test que cargue módulos con imports `@/...`.
import { register } from "node:module";

register("./_alias-hooks.mjs", import.meta.url);
