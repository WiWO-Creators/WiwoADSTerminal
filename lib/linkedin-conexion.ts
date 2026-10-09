/**
 * LA CONEXIÓN DE LINKEDIN ES DEL EQUIPO, no de cada persona: un administrador conecta una vez (OAuth, 3 patas) y TODO el equipo
 * actúa con esa conexión según su rol (`aprobar_cambios`, alcance por cliente…), sin iniciar sesión en LinkedIn. Es lo mismo que
 * Google (`definirConexionDelEquipo`) y Meta (usuario del sistema). Las acciones quedan a nombre de la cuenta conectada en
 * LinkedIn, pero la bitácora de WiWO.ADS sigue registrando quién fue. El token se guarda cifrado en `integration_connections`
 * (provider = «linkedin»), igual que Google y Meta.
 *
 * Va aparte de `integration-store.ts` a propósito: LinkedIn todavía no descubre cuentas ni sincroniza métricas por esta
 * vía (se lee por Windsor), así que no entra al registro `CONECTABLES` ni a las pantallas de Integraciones. Si entrara, cada
 * mapa tipado por proveedor en Google y Meta tendría que aprender a manejarlo sin poder probarlo contra LinkedIn.
 *
 * Los tokens de LinkedIn duran ~60 días. Un `refresh_token` solo llega si LinkedIn lo concede a la app: sin él, hay que
 * volver a conectar al vencer, y `estadoDeLinkedin` avisa con tiempo. Nunca se devuelve ni se registra un token.
 */
import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";
import { can, type Actor } from "@/lib/permisos";
import {
  aleatorioParaOAuth,
  cifrarSecretoDeConexion,
  descifrarSecretoDeConexion,
  hashDeEstadoOAuth,
  registrarEventoDeIntegracion,
} from "@/lib/integration-store";
import { diasHastaVencer, ErrorDeLinkedin, type TokensLinkedin } from "@/lib/linkedin-nativo-pura";
import {
  alcancesSolicitados,
  canjearCodigoDeLinkedin,
  crearUrlDeAutorizacion,
  cuentasDeLinkedin,
  faltaParaLinkedin,
  linkedinNativoConfigurado,
  nombreDeQuienAutorizo,
  renovarTokenDeLinkedin,
} from "@/lib/linkedin-nativo";

const PROVEEDOR = "linkedin";
/** Quién conectó la cuenta de LinkedIn que usa todo el equipo (clave de `app_meta`, como la de Google). */
const CLAVE_EQUIPO = "linkedin_conexion_equipo_user";
/** Cuántos días antes de vencer se avisa que hay que reconectar. */
export const DIAS_DE_AVISO = 10;

/** La URL de retorno que hay que tener registrada, igual y completa, en la pestaña Auth de la app de LinkedIn. */
export const RUTA_DE_RETORNO = "/api/integrations/linkedin/callback";

type FilaDeConexion = { id: string; status: string; token_ciphertext: string; token_expires_at: number | null; scopes: string | null; provider_user_name: string | null };

function exigirPermiso(user: Actor) {
  if (!can(user, "administrar_conexiones")) throw new ErrorDeLinkedin("Tu usuario no tiene permiso para administrar conexiones.", 403);
}

function origenDeLaApp(request: Request): string {
  const origenDePeticion = new URL(request.url).origin;
  const origen = (env.APP_ORIGIN ?? origenDePeticion).replace(/\/$/, "");
  if (origenDePeticion !== origen) throw new ErrorDeLinkedin("El origen de la conexión no es válido.", 400);
  return origen;
}

/** Prepara la sesión OAuth (estado de un solo uso, 10 minutos) y devuelve a dónde mandar a la persona. */
export async function crearUrlDeConexionLinkedin(user: Actor, request: Request): Promise<string> {
  exigirPermiso(user);
  const falta = faltaParaLinkedin();
  if (!linkedinNativoConfigurado() || falta.length > 0) {
    throw new ErrorDeLinkedin(`LinkedIn todavía no está habilitado: falta ${falta.join(" y ")}.`, 503);
  }
  const state = aleatorioParaOAuth(32);
  const redirectUri = `${origenDeLaApp(request)}${RUTA_DE_RETORNO}`;
  const ahora = Date.now();
  const db = getRawDb();
  await db.prepare("DELETE FROM oauth_sessions WHERE expires_at <= ?").bind(ahora).run();
  await db.prepare("DELETE FROM oauth_sessions WHERE user_id = ? AND provider = ?").bind(user.id, PROVEEDOR).run();
  await db
    .prepare(
      `INSERT INTO oauth_sessions (state_hash, user_id, provider, code_verifier_ciphertext, redirect_uri, expires_at, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    )
    .bind(await hashDeEstadoOAuth(state), user.id, PROVEEDOR, redirectUri, ahora + 10 * 60 * 1000, ahora)
    .run();
  // Lectura, administración (crear/editar) y lo necesario para crear anuncios. Leads, audiencias y conversiones no: son productos
  // que todavía no se piden, y un alcance no aprobado hace fallar toda la autorización.
  return crearUrlDeAutorizacion(redirectUri, state, alcancesSolicitados({ administrar: true, anuncios: true, perfil: true }));
}

async function consumirSesion(userId: string, state: string): Promise<{ redirect_uri: string }> {
  const sesion = await getRawDb()
    .prepare(
      `DELETE FROM oauth_sessions WHERE state_hash = ? AND user_id = ? AND provider = ? AND expires_at > ?
       RETURNING redirect_uri`,
    )
    .bind(await hashDeEstadoOAuth(state), userId, PROVEEDOR, Date.now())
    .first<{ redirect_uri: string }>();
  if (!sesion) throw new ErrorDeLinkedin("La autorización venció o no coincide con esta sesión. Intenta de nuevo.", 409);
  return sesion;
}

async function guardarTokens(duenoId: string, tokens: TokensLinkedin, refreshAnterior: string | null) {
  const ahora = Date.now();
  const paquete = JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? refreshAnterior });
  const cifrado = await cifrarSecretoDeConexion(paquete);
  await getRawDb()
    .prepare(
      `INSERT INTO integration_connections
        (id, user_id, provider, status, provider_user_id, provider_user_name, scopes, token_ciphertext, token_expires_at,
         last_sync_at, last_error, created_at, updated_at)
       VALUES (?, ?, ?, 'connected', NULL, NULL, ?, ?, ?, NULL, NULL, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         status = 'connected', scopes = excluded.scopes, token_ciphertext = excluded.token_ciphertext,
         token_expires_at = excluded.token_expires_at, last_error = NULL, updated_at = excluded.updated_at`,
    )
    .bind(crypto.randomUUID(), duenoId, PROVEEDOR, tokens.alcances, cifrado, tokens.expiraEn, ahora, ahora)
    .run();
}

/** Quién conectó la cuenta de LinkedIn del equipo (`null`: nadie la ha conectado todavía). */
export async function usuarioDeConexionEquipoLinkedin(): Promise<string | null> {
  try {
    const fila = await getRawDb().prepare("SELECT value FROM app_meta WHERE key = ? LIMIT 1").bind(CLAVE_EQUIPO).first<{ value: string }>();
    return fila?.value || null;
  } catch {
    return null;
  }
}

async function fijarConexionDelEquipo(userId: string) {
  await getRawDb()
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(CLAVE_EQUIPO, userId, Date.now())
    .run();
}

/**
 * Marca la conexión de LinkedIn de quien pregunta (ya hecha) como la de todo el equipo, sin volver a autorizar. Solo administración.
 * Sirve para una conexión anterior a este cambio, o para devolverle el rol a otra persona conectada.
 */
export async function usarMiConexionParaElEquipo(user: Actor): Promise<void> {
  exigirPermiso(user);
  const fila = await buscarConexion(user.id);
  if (!fila || fila.status !== "connected") throw new ErrorDeLinkedin("Primero conecta tu cuenta de LinkedIn.", 409);
  await fijarConexionDelEquipo(user.id);
  await registrarEventoDeIntegracion(user, "integration_connected", "Fijó su LinkedIn como la del equipo", "Todo el equipo actúa con esta conexión");
}

/** Cierra el OAuth: valida el estado, canjea el código y guarda el token cifrado. */
export async function completarConexionLinkedin(user: Actor, state: string, code: string): Promise<void> {
  exigirPermiso(user);
  if (!state || !code) throw new ErrorDeLinkedin("La autorización llegó incompleta.", 400);
  const sesion = await consumirSesion(user.id, state);
  const tokens = await canjearCodigoDeLinkedin(code, sesion.redirect_uri);
  await guardarTokens(user.id, tokens, null);
  // Con qué cuenta de LinkedIn se autorizó (informativo: si no se puede leer, la conexión sigue igual).
  const nombre = await nombreDeQuienAutorizo(tokens.accessToken);
  if (nombre) {
    await getRawDb().prepare("UPDATE integration_connections SET provider_user_name = ? WHERE user_id = ? AND provider = ?").bind(nombre, user.id, PROVEEDOR).run();
  }
  // Solo un administrador llega hasta aquí: su conexión pasa a ser la de todo el equipo (reemplaza a la anterior, por ejemplo la vencida).
  await fijarConexionDelEquipo(user.id);
  await registrarEventoDeIntegracion(user, "integration_connected", "Conectó LinkedIn para todo el equipo", `Alcances: ${tokens.alcances || "sin informar"}`);
}

async function buscarConexion(userId: string): Promise<FilaDeConexion | null> {
  return getRawDb()
    .prepare(
      `SELECT id, status, token_ciphertext, token_expires_at, scopes, provider_user_name FROM integration_connections
       WHERE user_id = ? AND provider = ? LIMIT 1`,
    )
    .bind(userId, PROVEEDOR)
    .first<FilaDeConexion>();
}

export type EstadoDeLinkedin = {
  configurado: boolean;
  falta: string[];
  conectado: boolean;
  alcances: string[];
  diasRestantes: number | null;
  /** Vence pronto (o ya venció): conviene reconectar. */
  reconectar: boolean;
  /** `LINKEDIN_ESCRITURA_CLIENTES=true`: se puede crear y modificar en cuentas de clientes, no solo en la de prueba. */
  escrituraEnClientes: boolean;
  /** Quién conectó la cuenta del equipo. Solo se informa a quien administra conexiones. */
  conectadoPor: string | null;
  /** La cuenta de LinkedIn con la que se autorizó (`null`: se conectó antes de pedir el perfil; reconectar la muestra). */
  cuentaDeLinkedin: string | null;
};

/** El nombre legible de quien conectó (sus ids son `email:correo`), solo para administradores. */
const correoDe = (userId: string | null): string | null => (userId ? userId.replace(/^email:/, "") : null);

/** Quién es el dueño de la conexión que se usa: la del equipo y, si aún no hay, la de esta persona. */
async function duenoDeLaConexion(userId: string): Promise<string> {
  return (await usuarioDeConexionEquipoLinkedin()) ?? userId;
}

/** Qué se sabe de la conexión de LinkedIn del equipo (la que usa todo el mundo). No incluye el token. */
export async function estadoDeLinkedin(user: Actor): Promise<EstadoDeLinkedin> {
  const base: EstadoDeLinkedin = {
    configurado: linkedinNativoConfigurado(),
    falta: faltaParaLinkedin(),
    conectado: false,
    alcances: [],
    diasRestantes: null,
    reconectar: false,
    escrituraEnClientes: env.LINKEDIN_ESCRITURA_CLIENTES === "true",
    conectadoPor: null,
    cuentaDeLinkedin: null,
  };
  const dueno = await duenoDeLaConexion(user.id);
  const fila = await buscarConexion(dueno);
  if (!fila || fila.status !== "connected") return base;
  const dias = diasHastaVencer(fila.token_expires_at, Date.now());
  return {
    ...base,
    conectado: true,
    alcances: (fila.scopes ?? "").split(/[\s,]+/).filter(Boolean),
    diasRestantes: dias,
    reconectar: dias !== null && dias <= DIAS_DE_AVISO,
    conectadoPor: can(user, "administrar_conexiones") ? correoDe(dueno) : null,
    cuentaDeLinkedin: can(user, "administrar_conexiones") ? fila.provider_user_name : null,
  };
}

/**
 * Token de acceso de la conexión de LinkedIn DEL EQUIPO: lo usa cualquier persona que pueda actuar según su rol, sin iniciar sesión
 * en LinkedIn. Si venció y hay `refresh_token`, lo renueva; si no hay cómo, un administrador debe volver a conectar.
 */
export async function tokenDeLinkedin(user: Actor): Promise<string> {
  const dueno = await duenoDeLaConexion(user.id);
  const fila = await buscarConexion(dueno);
  if (!fila || fila.status !== "connected") {
    throw new ErrorDeLinkedin("LinkedIn no está conectado: un administrador debe conectarlo en Integraciones.", 409);
  }
  const paquete = JSON.parse(await descifrarSecretoDeConexion(fila.token_ciphertext)) as { accessToken: string; refreshToken: string | null };
  const dias = diasHastaVencer(fila.token_expires_at, Date.now());
  if (dias === null || dias >= 0) return paquete.accessToken;
  if (!paquete.refreshToken) {
    throw new ErrorDeLinkedin("La conexión de LinkedIn del equipo venció: un administrador debe volver a conectarla en Integraciones.", 409);
  }
  const renovados = await renovarTokenDeLinkedin(paquete.refreshToken);
  await guardarTokens(dueno, renovados, paquete.refreshToken);
  return renovados.accessToken;
}

/** Con esto se escribe en LinkedIn por la vía nativa: el token de la conexión del equipo. Quién puede usarlo lo decide su rol. */
export type CredencialesLinkedin = { token: string };

/**
 * Credenciales para editar una cuenta de LinkedIn por su API directa, o `null` si no corresponde: no hay credenciales de la app,
 * el equipo no tiene LinkedIn conectado (o venció), o esa cuenta no es una que la conexión vea. `null` no es un error: quien llama
 * cae a Windsor, como con Google.
 *
 * REGLA DE SEGURIDAD: una cuenta de CLIENTE solo se escribe por esta vía si `LINKEDIN_ESCRITURA_CLIENTES=true`. Es la misma
 * guarda que `/api/linkedin/escritura`; vive aquí para que el editor, el asistente y las solicitudes aprobadas no puedan
 * saltársela. Con la guarda cerrada, las cuentas de clientes siguen por Windsor, como antes.
 */
export async function accesoNativoLinkedin(user: Actor, accountId: string): Promise<CredencialesLinkedin | null> {
  if (!linkedinNativoConfigurado()) return null;
  try {
    const token = await tokenDeLinkedin(user);
    const cuenta = (await cuentasDeLinkedin(token)).find((c) => c.id === accountId);
    if (!cuenta) return null;
    if (!cuenta.prueba && env.LINKEDIN_ESCRITURA_CLIENTES !== "true") return null;
    return { token };
  } catch {
    // Sin conexión, vencida o LinkedIn caído: se sigue por Windsor, no se rompe la edición.
    return null;
  }
}
