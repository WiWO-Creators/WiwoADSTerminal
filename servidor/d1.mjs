// Adaptador con la forma de la API de D1 (Cloudflare) sobre better-sqlite3.
//
// Implementa lo que la app y Drizzle usan de verdad: prepare / bind / first /
// all / run / raw / batch / exec. No inventa más: si aparece otro método, que
// falle a la vista en vez de comportarse distinto en silencio.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// D1 trata los booleanos como enteros y rechaza `undefined`; better-sqlite3
// rechaza los booleanos. Se normalizan acá para no tocar el código de la app.
function normalizar(valor) {
  if (valor === undefined) return null;
  if (typeof valor === "boolean") return valor ? 1 : 0;
  return valor;
}

class Sentencia {
  constructor(base, sql, parametros = []) {
    this.base = base;
    this.sql = sql;
    this.parametros = parametros;
  }

  bind(...parametros) {
    return new Sentencia(this.base, this.sql, parametros.map(normalizar));
  }

  /** Ejecución síncrona: la comparten `run`, `all` y `batch` (transaccional). */
  ejecutarSync() {
    const sentencia = this.base.prepare(this.sql);
    if (sentencia.reader) {
      const filas = sentencia.all(...this.parametros);
      return {
        success: true,
        results: filas,
        meta: { changes: 0, last_row_id: 0, rows_read: filas.length, rows_written: 0, duration: 0 },
      };
    }
    const info = sentencia.run(...this.parametros);
    return {
      success: true,
      results: [],
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        rows_read: 0,
        rows_written: info.changes,
        duration: 0,
      },
    };
  }

  async run() {
    return this.ejecutarSync();
  }

  async all() {
    return this.ejecutarSync();
  }

  async first(columna) {
    const sentencia = this.base.prepare(this.sql);
    if (!sentencia.reader) {
      sentencia.run(...this.parametros);
      return null;
    }
    const fila = sentencia.get(...this.parametros);
    if (!fila) return null;
    return columna ? (fila[columna] ?? null) : fila;
  }

  async raw() {
    const sentencia = this.base.prepare(this.sql);
    return sentencia.raw(true).all(...this.parametros);
  }
}

class BaseDeDatos {
  constructor(base) {
    this.base = base;
  }

  prepare(sql) {
    return new Sentencia(this.base, sql);
  }

  /** Igual que D1: todo el lote es una transacción, o se aplica entero o no. */
  async batch(sentencias) {
    return this.base.transaction(() => sentencias.map((s) => s.ejecutarSync()))();
  }

  async exec(sql) {
    this.base.exec(sql);
    return { success: true, meta: {} };
  }
}

export function crearD1(rutaDelArchivo) {
  let Sqlite;
  try {
    Sqlite = require("better-sqlite3");
  } catch (error) {
    throw new Error(
      "Falta better-sqlite3 (dependencia opcional). Ejecuta `npm rebuild better-sqlite3` " +
        `o instálalo con las herramientas de compilación. Detalle: ${error.message}`,
    );
  }
  fs.mkdirSync(path.dirname(rutaDelArchivo), { recursive: true });
  const base = new Sqlite(rutaDelArchivo);
  base.pragma("journal_mode = WAL");
  base.pragma("foreign_keys = ON"); // D1 las exige por defecto
  base.pragma("busy_timeout = 5000");
  return new BaseDeDatos(base);
}
