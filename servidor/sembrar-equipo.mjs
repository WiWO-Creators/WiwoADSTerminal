// Da de alta personas del equipo directo en el SQLite del VPS, sin pasar por
// la interfaz uno por uno. Mismo efecto que inviteMember() en lib/equipo.ts,
// pero en batch. Idempotente: un correo ya existente se salta, no se pisa.
//
//   node servidor/sembrar-equipo.mjs correo@dominio.com:rol [correo:rol ...]
//   (usa WIWO_DB_PATH o ./datos/wiwo.sqlite)
import path from "node:path";

import { crearD1 } from "./d1.mjs";

const ROLES_VALIDOS = new Set(["admin", "lead", "buyer", "analyst", "client"]);

const entradas = process.argv.slice(2);
if (entradas.length === 0) {
  console.error("Uso: node servidor/sembrar-equipo.mjs correo@dominio.com:rol [correo:rol ...]");
  process.exit(1);
}

const raiz = process.cwd();
const rutaDb = path.resolve(raiz, process.env.WIWO_DB_PATH ?? "datos/wiwo.sqlite");
const db = crearD1(rutaDb);

for (const entrada of entradas) {
  const [correoCrudo, rol] = entrada.split(":");
  const email = (correoCrudo ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`  omitido  ${entrada}  (correo con formato inválido)`);
    continue;
  }
  if (!ROLES_VALIDOS.has(rol)) {
    console.error(`  omitido  ${entrada}  (rol "${rol}" no reconocido)`);
    continue;
  }

  const existente = await db
    .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first();
  if (existente) {
    console.log(`  ya existe  ${email}  (sin tocar)`);
    continue;
  }

  const id = `email:${email}`;
  const ahora = Date.now();
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, role, is_active, created_at, last_seen_at, invited_by, invited_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .bind(id, email, email, rol, ahora, ahora, "seed", ahora)
    .run();
  console.log(`  agregado  ${email}  (${rol})`);
}
