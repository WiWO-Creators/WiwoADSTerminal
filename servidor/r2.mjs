// Adaptador con la forma de R2 (Cloudflare) sobre una carpeta en disco.
// Solo `put` y `get`, que es lo que usa la app para los creativos.
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const CLAVE_VALIDA = /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

function rutaSegura(raiz, clave) {
  // Nunca salir de la carpeta: una clave con `..` o absoluta se rechaza.
  if (!CLAVE_VALIDA.test(clave) || clave.split("/").includes("..")) {
    throw new Error(`Clave de almacenamiento no válida: ${clave}`);
  }
  const ruta = path.resolve(raiz, clave);
  if (!ruta.startsWith(path.resolve(raiz) + path.sep)) {
    throw new Error(`Clave de almacenamiento fuera de la carpeta: ${clave}`);
  }
  return ruta;
}

async function aBytes(datos) {
  if (typeof datos === "string") return Buffer.from(datos);
  if (datos instanceof ArrayBuffer) return Buffer.from(datos);
  if (ArrayBuffer.isView(datos)) {
    return Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength);
  }
  // Blob, ReadableStream, Response…
  return Buffer.from(await new Response(datos).arrayBuffer());
}

export function crearR2(carpeta) {
  fs.mkdirSync(carpeta, { recursive: true });
  return {
    async put(clave, datos, opciones = {}) {
      const ruta = rutaSegura(carpeta, clave);
      fs.mkdirSync(path.dirname(ruta), { recursive: true });
      const bytes = await aBytes(datos);
      fs.writeFileSync(ruta, bytes);
      fs.writeFileSync(`${ruta}.meta.json`, JSON.stringify(opciones.httpMetadata ?? {}));
      return { key: clave, size: bytes.byteLength };
    },

    async get(clave) {
      let ruta;
      try {
        ruta = rutaSegura(carpeta, clave);
      } catch {
        return null;
      }
      if (!fs.existsSync(ruta) || ruta.endsWith(".meta.json")) return null;
      let httpMetadata = {};
      try {
        httpMetadata = JSON.parse(fs.readFileSync(`${ruta}.meta.json`, "utf8"));
      } catch {
        // sin metadatos: se sirve como binario genérico
      }
      return {
        key: clave,
        size: fs.statSync(ruta).size,
        httpMetadata,
        get body() {
          return Readable.toWeb(fs.createReadStream(ruta));
        },
        async arrayBuffer() {
          const b = fs.readFileSync(ruta);
          return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        },
        async text() {
          return fs.readFileSync(ruta, "utf8");
        },
      };
    },
  };
}
