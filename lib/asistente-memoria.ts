/**
 * Memoria persistente del asistente: lo que se guarda, quién puede guardarlo y qué se le muestra al modelo.
 *
 * - Alcance «equipo»: vale para todos los clientes. Solo quien aprueba cambios (admin y supervisor) lo escribe.
 * - Alcance de un cliente: solo para quien tiene ese cliente a su alcance.
 * Las reglas de contenido (nada de datos personales ni credenciales) viven en `asistente-memoria-pura.ts`.
 */
import { getRawDb } from "@/db";
import { can, enAlcance, type Actor } from "@/lib/permisos";
import {
  MAX_NOTAS_POR_ALCANCE,
  bloqueDeMemoria,
  notaRepetida,
  problemaDeMemoria,
  type NotaDeMemoria,
} from "@/lib/asistente-memoria-pura";

export const ALCANCE_EQUIPO = "equipo";

type Fila = { id: string; scope: string; texto: string; autor_email: string; updated_at: number; usos: number };
const aNota = (f: Fila): NotaDeMemoria => ({ id: f.id, scope: f.scope, texto: f.texto, autor: f.autor_email, actualizada: f.updated_at, usos: f.usos });

export class ErrorDeMemoria extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** ¿Puede esta persona escribir (o borrar) en ese alcance? */
export function puedeEscribirMemoria(actor: Actor, scope: string): boolean {
  if (!actor.isActive) return false;
  if (scope === ALCANCE_EQUIPO) return can(actor, "aprobar_cambios");
  return enAlcance(actor, scope) && can(actor, "ver_operacion");
}

export async function notasDe(scope: string): Promise<NotaDeMemoria[]> {
  const { results } = await getRawDb()
    .prepare("SELECT id, scope, texto, autor_email, updated_at, usos FROM asistente_memoria WHERE scope = ? ORDER BY updated_at DESC")
    .bind(scope)
    .all<Fila>();
  return (results ?? []).map(aNota);
}

/** Las notas que ve quien pregunta: las del equipo y las del cliente activo (si lo tiene a su alcance). */
export async function notasVisibles(actor: Actor, clienteId: string | null): Promise<{ equipo: NotaDeMemoria[]; cliente: NotaDeMemoria[] }> {
  const [equipo, cliente] = await Promise.all([
    notasDe(ALCANCE_EQUIPO),
    clienteId && enAlcance(actor, clienteId) ? notasDe(clienteId) : Promise.resolve([] as NotaDeMemoria[]),
  ]);
  return { equipo, cliente };
}

/** El texto de memoria para el prompt; cuenta un uso por cada nota mostrada (las que sirven suben). */
export async function memoriaParaElPrompt(actor: Actor, clienteId: string | null, nombreCliente: string | null): Promise<string> {
  try {
    const { equipo, cliente } = await notasVisibles(actor, clienteId);
    const bloque = bloqueDeMemoria(equipo, cliente, nombreCliente);
    const ids = [...equipo, ...cliente].map((n) => n.id);
    if (ids.length > 0) {
      await getRawDb()
        .prepare(`UPDATE asistente_memoria SET usos = usos + 1 WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids)
        .run();
    }
    return bloque;
  } catch (error) {
    console.error("WiWO.ADS memoria del asistente", error instanceof Error ? error.message : error);
    return "";
  }
}

export async function guardarNota(actor: Actor, scope: string, texto: string): Promise<{ id: string; nueva: boolean }> {
  if (!puedeEscribirMemoria(actor, scope)) {
    throw new ErrorDeMemoria(
      scope === ALCANCE_EQUIPO ? "Solo un administrador o supervisor puede guardar notas para todo el equipo." : "No tienes ese cliente a tu alcance.",
      403,
    );
  }
  const problema = problemaDeMemoria(texto);
  if (problema) throw new ErrorDeMemoria(problema);
  const limpio = texto.trim().replace(/\s+/g, " ");
  const existentes = await notasDe(scope);
  const repetida = notaRepetida(existentes, limpio);
  const db = getRawDb();
  const ahora = Date.now();
  if (repetida) {
    await db.prepare("UPDATE asistente_memoria SET texto = ?, updated_at = ? WHERE id = ?").bind(limpio, ahora, repetida.id).run();
    return { id: repetida.id, nueva: false };
  }
  if (existentes.length >= MAX_NOTAS_POR_ALCANCE) {
    throw new ErrorDeMemoria(`Ya hay ${MAX_NOTAS_POR_ALCANCE} notas en este alcance: olvida alguna antes de guardar otra.`, 409);
  }
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO asistente_memoria (id, scope, texto, autor_email, created_at, updated_at, usos) VALUES (?, ?, ?, ?, ?, ?, 0)")
    .bind(id, scope, limpio, actor.email, ahora, ahora)
    .run();
  return { id, nueva: true };
}

/** Borra una nota por su id (completo o los 8 primeros caracteres que ve el modelo). */
export async function olvidarNota(actor: Actor, idOPrefijo: string, scopesPermitidos: string[]): Promise<{ olvidada: boolean }> {
  const prefijo = idOPrefijo.trim();
  if (prefijo.length < 6) throw new ErrorDeMemoria("Falta el id de la nota.");
  const db = getRawDb();
  const { results } = await db
    .prepare("SELECT id, scope FROM asistente_memoria WHERE id LIKE ?")
    .bind(`${prefijo}%`)
    .all<{ id: string; scope: string }>();
  const nota = (results ?? []).find((n) => scopesPermitidos.includes(n.scope));
  if (!nota) return { olvidada: false };
  if (!puedeEscribirMemoria(actor, nota.scope)) throw new ErrorDeMemoria("No puedes borrar notas de ese alcance.", 403);
  await db.prepare("DELETE FROM asistente_memoria WHERE id = ?").bind(nota.id).run();
  return { olvidada: true };
}
