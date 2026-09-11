import { redirect } from "next/navigation";

import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { resolveActor } from "@/lib/equipo";
import type { Actor } from "@/lib/permisos";

/**
 * Sesión efectiva: quién entró y qué puede hacer.
 *
 * Antes bastaba con estar en una lista de correos. Ahora hay dos preguntas
 * distintas: si la persona autenticó (lo resuelve chatgpt-auth) y si pertenece
 * al equipo con un rol vigente (lo resuelve equipo.ts). Todo el resto del
 * sistema debe pasar por acá y no volver a leer la lista de correos.
 */

export type Session = { actor: Actor; displayName: string; email: string };

export async function getSession(): Promise<Session | null> {
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

/** Para páginas: manda a iniciar sesión si no hay identidad. */
export async function requireSession(returnTo: string): Promise<Session | null> {
  const identity = await getChatGPTUser();
  if (!identity) redirect(chatGPTSignInPath(returnTo));
  const actor = await resolveActor(identity);
  // Autenticado pero sin acceso: la página lo muestra, no se redirige, para
  // que la persona entienda por qué no entra en vez de dar vueltas.
  if (!actor) return null;
  return { actor, displayName: identity.displayName, email: identity.email };
}
