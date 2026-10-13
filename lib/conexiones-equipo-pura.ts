/**
 * Las conexiones del equipo (Google, Meta, LinkedIn) vistas por TODO el equipo, no solo por quien las administra. Nadie inicia sesión
 * en una plataforma para trabajar: un administrador conecta una vez y todos actúan con esa conexión según su rol. Lo que sí tiene que
 * pasar es que cualquiera sepa, sin ser administrador, cuando una conexión no está activa y a quién avisar. Puro (sin red).
 */

export type ProveedorDeConexion = "google" | "meta" | "linkedin";

export type EntradaDeConexion = {
  proveedor: ProveedorDeConexion;
  /** El servidor tiene lo necesario (claves de la aplicación) para esa conexión. */
  habilitada: boolean;
  /** Los nombres de lo que falta en el servidor (solo se muestran a quien administra). */
  falta: string[];
  /** Hay una conexión del equipo guardada y vigente. */
  conectada: boolean;
  /** Está por vencer o ya venció y hay que volver a conectar. */
  porVencer: boolean;
  diasRestantes: number | null;
};

export type EstadoDeConexion = {
  proveedor: ProveedorDeConexion;
  nombre: string;
  activa: boolean;
  /** `ok`, `por_vencer`, `sin_conectar` o `sin_habilitar`. */
  estado: "ok" | "por_vencer" | "sin_conectar" | "sin_habilitar";
  /** Lo que se dice a todos. */
  mensaje: string;
  /** Qué hacer: distinto para quien administra y para quien no. */
  accion: string;
  /** Solo para quien administra. */
  falta: string[];
};

const NOMBRE: Record<ProveedorDeConexion, string> = { google: "Google Ads", meta: "Meta Ads", linkedin: "LinkedIn Ads" };

/** Lo que se pierde cuando la conexión no está activa, dicho en lo que la persona hace (no en términos técnicos). */
const PERDIDA: Record<ProveedorDeConexion, string> = {
  google: "no se ven los textos ni las piezas de los anuncios de Google, ni los anuncios sin actividad, ni se pueden editar",
  meta: "no se puede crear ni editar directo en Meta",
  linkedin: "no se pueden crear ni editar campañas de LinkedIn",
};

export function estadoDeConexion(e: EntradaDeConexion, puedeAdministrar: boolean): EstadoDeConexion {
  const nombre = NOMBRE[e.proveedor];
  const avisarA = "Avisa a un administrador: se conecta una sola vez y queda para todo el equipo.";
  if (!e.habilitada) {
    return {
      proveedor: e.proveedor,
      nombre,
      activa: false,
      estado: "sin_habilitar",
      mensaje: `${nombre} no está habilitado en el servidor: ${PERDIDA[e.proveedor]}.`,
      accion: puedeAdministrar ? `Falta configurar en el servidor: ${e.falta.join(", ") || "las claves de la aplicación"}.` : "Avisa al equipo de plataforma: es un ajuste del servidor, no de tu cuenta.",
      falta: puedeAdministrar ? e.falta : [],
    };
  }
  if (!e.conectada) {
    return {
      proveedor: e.proveedor,
      nombre,
      activa: false,
      estado: "sin_conectar",
      mensaje: `${nombre} no está conectado para el equipo: ${PERDIDA[e.proveedor]}.`,
      accion: puedeAdministrar ? `Conéctalo ahora en Cuentas (una sola vez): queda para todo el equipo.` : avisarA,
      falta: [],
    };
  }
  if (e.porVencer) {
    const dias = e.diasRestantes;
    return {
      proveedor: e.proveedor,
      nombre,
      activa: true,
      estado: "por_vencer",
      mensaje: dias !== null && dias >= 0 ? `La conexión con ${nombre} vence en ${dias} ${dias === 1 ? "día" : "días"}.` : `La conexión con ${nombre} venció.`,
      accion: puedeAdministrar ? "Reconéctala en Cuentas antes de que venza." : avisarA,
      falta: [],
    };
  }
  return { proveedor: e.proveedor, nombre, activa: true, estado: "ok", mensaje: `${nombre} conectado para el equipo.`, accion: "", falta: [] };
}

export type ResumenDeConexiones = {
  conexiones: EstadoDeConexion[];
  /** Nada que avisar. */
  todoBien: boolean;
  puedeAdministrar: boolean;
};

export function resumenDeConexiones(entradas: EntradaDeConexion[], puedeAdministrar: boolean): ResumenDeConexiones {
  const conexiones = entradas.map((e) => estadoDeConexion(e, puedeAdministrar));
  return { conexiones, todoBien: conexiones.every((c) => c.estado === "ok"), puedeAdministrar };
}
