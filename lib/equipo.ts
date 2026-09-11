import { env } from "cloudflare:workers";

import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getRawDb } from "@/db";
import {
  can,
  isRole,
  normalizeRole,
  type Actor,
  type Role,
} from "@/lib/permisos";

/**
 * Alta y consulta de las personas del equipo.
 *
 * Entrar a WiWO.ADS exige una de dos cosas: ser administrador fundador
 * (declarado en OAUTH_ADMIN_EMAILS) o haber sido invitado por alguien y seguir
 * activo. No hay registro abierto: un correo desconocido no entra aunque
 * autentique bien con Google.
 */

/**
 * Correos que son administradores por configuración, no por invitación.
 *
 * Resuelve el arranque en frío: sin esto nadie podría dar de alta al primer
 * usuario. Se definen en OAUTH_ADMIN_EMAILS y no se les puede quitar el rol
 * desde la interfaz, para no dejar el sistema sin administrador.
 */
export function isFoundingAdmin(email: string): boolean {
  return ownerEmails().includes(email.trim().toLowerCase());
}

export function ownerEmails(): string[] {
  return (env.OAUTH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export class EquipoError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export type TeamMember = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  portfolioIds: string[];
  foundingAdmin: boolean;
  invitedBy: string | null;
  lastSeenAt: number | null;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: number;
  invited_by: string | null;
  last_seen_at: number | null;
};

/**
 * Resuelve quién es quien acaba de entrar. `null` significa sin acceso.
 *
 * Al administrador fundador se le crea la ficha en el momento: sin eso nadie
 * podría dar de alta al primero.
 */
export async function resolveActor(
  identity: ChatGPTUser,
): Promise<Actor | null> {
  const db = getRawDb();
  const email = identity.email.trim().toLowerCase();
  const now = Date.now();

  if (isFoundingAdmin(email)) {
    // La identidad se resuelve por **correo**, no por id.
    //
    // El id de la persona cambia según por dónde entre: la cabecera de ChatGPT
    // Sites trae uno y el inicio de sesión con Google trae otro. Con un
    // `ON CONFLICT(id)` el segundo intento chocaba contra el UNIQUE de
    // `users.email` y la página entera respondía 500. Además, conservar el id
    // guardado es lo que mantiene vivos los portafolios asignados, que cuelgan
    // de él.
    const existente = await db
      .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first<{ id: string }>();

    if (existente) {
      await db
        .prepare(
          `UPDATE users
           SET display_name = ?, role = 'admin', is_active = 1, last_seen_at = ?
           WHERE id = ?`,
        )
        .bind(identity.displayName, now, existente.id)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO users (id, email, display_name, role, is_active, created_at, last_seen_at)
           VALUES (?, ?, ?, 'admin', 1, ?, ?)`,
        )
        .bind(identity.id, email, identity.displayName, now, now)
        .run();
    }

    const id = existente?.id ?? identity.id;
    return {
      id,
      email,
      role: "admin",
      portfolioIds: await portfoliosOf(id),
      isActive: true,
    };
  }

  const row = await db
    .prepare(
      `SELECT id, email, display_name, role, is_active, invited_by, last_seen_at
       FROM users WHERE email = ? LIMIT 1`,
    )
    .bind(email)
    .first<UserRow>();

  if (!row || !row.is_active) return null;

  await db
    .prepare("UPDATE users SET last_seen_at = ?, display_name = ? WHERE id = ?")
    .bind(now, identity.displayName, row.id)
    .run();

  return {
    id: row.id,
    email,
    role: normalizeRole(row.role),
    portfolioIds: await portfoliosOf(row.id),
    isActive: true,
  };
}

async function portfoliosOf(userId: string): Promise<string[]> {
  const result = await getRawDb()
    .prepare("SELECT portfolio_id FROM user_portfolios WHERE user_id = ?")
    .bind(userId)
    .all<{ portfolio_id: string }>();
  return result.results.map((row) => row.portfolio_id);
}

export async function listTeam(actor: Actor): Promise<TeamMember[]> {
  assertCanManage(actor);
  const db = getRawDb();
  const [users, links] = await Promise.all([
    db
      .prepare(
        `SELECT id, email, display_name, role, is_active, invited_by, last_seen_at
         FROM users ORDER BY email COLLATE NOCASE`,
      )
      .all<UserRow>(),
    db
      .prepare("SELECT user_id, portfolio_id FROM user_portfolios")
      .all<{ user_id: string; portfolio_id: string }>(),
  ]);

  const byUser = new Map<string, string[]>();
  for (const link of links.results) {
    byUser.set(link.user_id, [
      ...(byUser.get(link.user_id) ?? []),
      link.portfolio_id,
    ]);
  }

  return users.results.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: normalizeRole(row.role),
    isActive: Boolean(row.is_active),
    portfolioIds: byUser.get(row.id) ?? [],
    foundingAdmin: isFoundingAdmin(row.email),
    invitedBy: row.invited_by,
    lastSeenAt: row.last_seen_at ? Number(row.last_seen_at) : null,
  }));
}

export async function inviteMember(
  actor: Actor,
  input: { email: string; role: string; portfolioIds: string[] },
): Promise<void> {
  assertCanManage(actor);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new EquipoError("Ese correo no tiene un formato válido");
  }
  if (!isRole(input.role)) throw new EquipoError("Rol no reconocido");

  const db = getRawDb();
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    throw new EquipoError("Ese correo ya está en el equipo", 409);
  }

  // El id replica el formato de la sesión para que al entrar calce la ficha.
  const id = `email:${email}`;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, role, is_active, created_at, last_seen_at, invited_by, invited_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .bind(id, email, email, input.role, now, now, actor.email, now)
    .run();

  await replacePortfolios(id, input.portfolioIds, actor.email);
}

export async function updateMember(
  actor: Actor,
  input: {
    userId: string;
    role?: string;
    isActive?: boolean;
    portfolioIds?: string[];
  },
): Promise<void> {
  assertCanManage(actor);
  const db = getRawDb();
  const row = await db
    .prepare("SELECT id, email FROM users WHERE id = ? LIMIT 1")
    .bind(input.userId)
    .first<{ id: string; email: string }>();
  if (!row) throw new EquipoError("Esa persona no existe", 404);

  // Un administrador fundador no se puede degradar ni desactivar desde acá:
  // sería la forma más fácil de dejar el sistema sin quién lo administre.
  if (isFoundingAdmin(row.email)) {
    if (input.role !== undefined || input.isActive !== undefined) {
      throw new EquipoError(
        "El administrador fundador se cambia en la configuración, no acá",
        409,
      );
    }
  }

  if (input.role !== undefined) {
    if (!isRole(input.role)) throw new EquipoError("Rol no reconocido");
    await db
      .prepare("UPDATE users SET role = ? WHERE id = ?")
      .bind(input.role, row.id)
      .run();
  }
  if (input.isActive !== undefined) {
    await db
      .prepare("UPDATE users SET is_active = ? WHERE id = ?")
      .bind(input.isActive ? 1 : 0, row.id)
      .run();
  }
  if (input.portfolioIds !== undefined) {
    await replacePortfolios(row.id, input.portfolioIds, actor.email);
  }
}

async function replacePortfolios(
  userId: string,
  portfolioIds: string[],
  by: string,
): Promise<void> {
  const db = getRawDb();
  await db
    .prepare("DELETE FROM user_portfolios WHERE user_id = ?")
    .bind(userId)
    .run();

  const unique = [...new Set(portfolioIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const now = Date.now();
  await db.batch(
    unique.map((portfolioId) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO user_portfolios
             (id, user_id, portfolio_id, created_at, created_by)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(`${userId}::${portfolioId}`, userId, portfolioId, now, by),
    ),
  );
}

function assertCanManage(actor: Actor): void {
  if (!can(actor, "administrar_equipo")) {
    throw new EquipoError("No tienes permiso para administrar el equipo", 403);
  }
}
