/**
 * Roles y permisos de WiWO.ADS.
 *
 * Este módulo es puro a propósito: no toca la base ni el entorno del Worker,
 * porque lo importan también componentes de cliente. Lo que depende del
 * entorno (quién es administrador fundador) vive en equipo.ts.
 *
 * Hasta ahora el rol se guardaba y se mostraba, pero no decidía nada: todas las
 * comprobaciones preguntaban solo si el correo estaba en una lista. Acá el rol
 * pasa a gobernar de verdad.
 *
 * Dos ejes independientes:
 *   - el ROL dice qué puede hacer una persona (crear, aprobar, administrar);
 *   - el ALCANCE dice sobre qué clientes puede hacerlo.
 * Un buyer con todos los clientes asignados sigue sin poder aprobar; un lead
 * sigue sin poder administrar el equipo.
 */

export const ROLES = ["admin", "lead", "buyer", "analyst", "client"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  lead: "Lead",
  buyer: "Buyer",
  analyst: "Analista",
  client: "Cliente",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Ve todo, aprueba cambios y administra el equipo.",
  lead: "Ve todos los clientes y aprueba cambios.",
  buyer: "Trabaja los clientes asignados y propone cambios.",
  analyst: "Solo lectura sobre los clientes asignados.",
  client: "Solo ve el rendimiento de su propio portafolio.",
};

export type Capability =
  /** Ver todos los clientes sin asignación explícita. */
  | "ver_todos_los_clientes"
  /** Crear o editar campañas y anuncios (queda pendiente de aprobación). */
  | "crear_campanas"
  /** Aprobar y ejecutar un cambio sobre la plataforma. */
  | "aprobar_cambios"
  /** Dar de alta personas, cambiar roles y asignar clientes. */
  | "administrar_equipo"
  /** Administrar las conexiones de datos. */
  | "administrar_conexiones"
  /** Ver la cola de decisiones y la bitácora interna. */
  | "ver_operacion";

const CAPABILITIES: Record<Role, Capability[]> = {
  admin: [
    "ver_todos_los_clientes",
    "crear_campanas",
    "aprobar_cambios",
    "administrar_equipo",
    "administrar_conexiones",
    "ver_operacion",
  ],
  lead: [
    "ver_todos_los_clientes",
    "crear_campanas",
    "aprobar_cambios",
    "administrar_conexiones",
    "ver_operacion",
  ],
  buyer: ["crear_campanas", "ver_operacion"],
  analyst: ["ver_operacion"],
  client: [],
};

export type Actor = {
  id: string;
  email: string;
  role: Role;
  /** Portafolios asignados. Se ignora si el rol ve todos los clientes. */
  portfolioIds: string[];
  isActive: boolean;
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: string | null | undefined): Role {
  return value && isRole(value) ? value : "analyst";
}

export function can(actor: Actor, capability: Capability): boolean {
  if (!actor.isActive) return false;
  return CAPABILITIES[actor.role].includes(capability);
}

/**
 * Los portafolios que esta persona puede ver, o `null` cuando los ve todos.
 *
 * `null` y lista vacía significan cosas opuestas: `null` es "sin restricción",
 * la lista vacía es "no tiene ningún cliente asignado todavía".
 */
export function visiblePortfolios(actor: Actor): string[] | null {
  return can(actor, "ver_todos_los_clientes") ? null : actor.portfolioIds;
}

/**
 * Si esta persona puede trabajar sobre ese cliente puntual.
 *
 * El alcance sale de los permisos, no del gasto: antes varias rutas exigían
 * que el cliente apareciera en el snapshot de rendimiento del periodo, y eso
 * bloqueaba justo el caso normal —armarle algo a un cliente que hoy no tiene
 * nada al aire—. Repetida idéntica en cuatro rutas del Constructor hasta
 * juntarla acá: una sola definición, cero riesgo de que una copia se
 * actualice y las otras tres queden con la regla vieja.
 */
export function enAlcance(actor: Actor, portfolioId: string): boolean {
  if (can(actor, "ver_todos_los_clientes")) return true;
  return actor.portfolioIds.includes(portfolioId);
}
