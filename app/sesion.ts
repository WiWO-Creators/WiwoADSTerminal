import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { actorDeMiembro, resolveActor } from "@/lib/equipo";
import type { Actor } from "@/lib/permisos";

/**
 * Sesión efectiva: quién entró y qué puede hacer.
 *
 * Antes bastaba con estar en una lista de correos. Ahora hay dos preguntas
 * distintas: si la persona autenticó (lo resuelve chatgpt-auth) y si pertenece
 * al equipo con un rol vigente (lo resuelve equipo.ts). Todo el resto del
 * sistema debe pasar por acá y no volver a leer la lista de correos.
 */

/** `verComo`: un administrador está viendo la app como esa persona (solo lectura; el actor es el de esa persona). */
export type Session = { actor: Actor; displayName: string; email: string; verComo?: { email: string; nombre: string; cargo: string | null } | null; realActor?: Actor };

export const COOKIE_VER_COMO = "wiwo_ver_como";

/** La sesión de quien de verdad entró, sin «Ver como». Para administrar el propio «Ver como». */
export async function getSessionReal(): Promise<Session | null> {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const actor = await resolveActor(identity);
  if (!actor) return null;
  return {
    actor,
    displayName: identity.displayName,
    email: identity.email,
  };
}

/** Un administrador con «Ver como» activo ve lo mismo que vería esa persona (sus permisos, su alcance, sus pantallas). */
async function aplicarVerComo(real: Session): Promise<Session> {
  if (real.actor.role !== "admin") return real;
  const valor = (await cookies()).get(COOKIE_VER_COMO)?.value;
  if (!valor) return real;
  let correo = "";
  try {
    correo = decodeURIComponent(valor).trim().toLowerCase();
  } catch {
    return real;
  }
  if (!correo || correo === real.actor.email) return real;
  const objetivo = await actorDeMiembro(correo);
  if (!objetivo) return real;
  return {
    actor: objetivo.actor,
    displayName: objetivo.nombre,
    email: objetivo.actor.email,
    verComo: { email: objetivo.actor.email, nombre: objetivo.nombre, cargo: objetivo.cargo },
    realActor: real.actor,
  };
}

export async function getSession(): Promise<Session | null> {
  const real = await getSessionReal();
  return real ? aplicarVerComo(real) : null;
}

/** Para páginas: manda a iniciar sesión si no hay identidad. */
export async function requireSession(returnTo: string): Promise<Session | null> {
  const identity = await getChatGPTUser();
  if (!identity) redirect(chatGPTSignInPath(returnTo));
  const actor = await resolveActor(identity);
  // Autenticado pero sin acceso: la página lo muestra, no se redirige, para
  // que la persona entienda por qué no entra en vez de dar vueltas.
  if (!actor) return null;
  return aplicarVerComo({ actor, displayName: identity.displayName, email: identity.email });
}
