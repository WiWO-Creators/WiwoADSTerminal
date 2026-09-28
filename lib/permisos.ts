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

export const ROLES = ["admin", "supervisor", "analyst", "client"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  analyst: "Analista",
  client: "Cliente",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Ve todo, aprueba cambios y administra el equipo por completo.",
  supervisor: "Ve todo, crea y aprueba cambios. Puede sumar analistas y clientes, pero no modificar a quien ya está.",
  analyst: "Ve todos los clientes y propone cambios. Puede dar de alta clientes y asignarles su portafolio.",
  client: "Ve el rendimiento de su propio portafolio y puede proponer cambios.",
};

export type Capability =
  /** Ver todos los clientes sin asignación explícita. */
  | "ver_todos_los_clientes"
  /** Arma y publica campañas de verdad, desde el Constructor. */
  | "crear_campanas"
  /**
   * Deja una sugerencia de campaña (vía el asistente de IA) pendiente de que
   * alguien con `crear_campanas` la publique — no la publica ella misma. Todo
   * rol con `crear_campanas` puede sugerir también: `can()` no lo exige por
   * separado, pero `puedeSugerirCampanas` sí lo cubre.
   */
  | "sugerir_campanas"
  /** Aprobar y ejecutar un cambio sobre la plataforma. */
  | "aprobar_cambios"
  /** Entrar a la pantalla Equipo. Qué puede hacer ahí (invitar a quién,
   * modificar a alguien ya existente) lo deciden `rolesAsignables` y
   * `puedeModificarMiembros`, no esta capability por sí sola. */
  | "ver_equipo"
  /** Administrar las conexiones de datos. */
  | "administrar_conexiones"
  /** Ver la cola de decisiones y la bitácora interna. */
  | "ver_operacion";

const CAPABILITIES: Record<Role, Capability[]> = {
  admin: [
    "ver_todos_los_clientes",
    "crear_campanas",
    "aprobar_cambios",
    "ver_equipo",
    "administrar_conexiones",
    "ver_operacion",
  ],
  // Todo lo operativo de admin (ve, crea, aprueba, conecta), pero sin poder
  // tocar a nadie que ya esté en el equipo — solo sumar gente nueva, y con
  // rol analista o cliente (ver `rolesAsignables`).
  supervisor: [
    "ver_todos_los_clientes",
    "crear_campanas",
    "aprobar_cambios",
    "ver_equipo",
    "administrar_conexiones",
    "ver_operacion",
  ],
  // Decisión del equipo (2026-09-25): un analista ve TODO el roster de
  // clientes, sin necesitar asignación manual por portafolio. No crea
  // campañas de verdad, pero sí puede dejar una sugerencia, y puede dar de
  // alta a un cliente nuevo (solo ese rol) asignándole su portafolio.
  analyst: ["ver_todos_los_clientes", "sugerir_campanas", "ver_equipo", "ver_operacion"],
  client: ["sugerir_campanas"],
};

/**
 * Qué roles puede asignar esta persona al invitar a alguien nuevo — [] si no
 * puede invitar a nadie. Jerarquía estricta: cada rol solo suma por debajo de
 * sí mismo, nunca a su propio nivel ni por encima (ni siquiera admin invita
 * "otro admin" por accidente sin querer, aunque sí puede si de verdad lo
 * necesita: es el único con la lista completa).
 */
export function rolesAsignables(actor: Actor): Role[] {
  if (!actor.isActive) return [];
  switch (actor.role) {
    case "admin":
      return [...ROLES];
    case "supervisor":
      return ["analyst", "client"];
    case "analyst":
      return ["client"];
    default:
      return [];
  }
}

/**
 * Si puede modificar a alguien que YA está en el equipo (rol, estado,
 * portafolio) — distinto de poder invitar: invitar es crear una persona
 * nueva, esto es editar una que ya existe. Solo admin: supervisor y analyst
 * pueden sumar gente, pero no tocar lo que ya está.
 */
export function puedeModificarMiembros(actor: Actor): boolean {
  return actor.isActive && actor.role === "admin";
}

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

/** Si el ROL en sí tiene esta capacidad, sin mirar si la persona está activa
 * — para decisiones de solo-interfaz (ej. mostrar u ocultar un selector)
 * donde no hay un `Actor` completo a mano, no para autorizar una escritura
 * real (ahí siempre `can`, que sí exige `isActive`). */
export function roleCan(role: Role, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

export function can(actor: Actor, capability: Capability): boolean {
  if (!actor.isActive) return false;
  return roleCan(actor.role, capability);
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
