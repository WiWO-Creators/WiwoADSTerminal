/**
 * Conexión de una persona del equipo con LinkedIn por OAuth (3 patas): autorizar, canjear el código y guardar el token
 * cifrado en `integration_connections` (provider = «linkedin»), igual que Google y Meta.
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
  renovarTokenDeLinkedin,
} from "@/lib/linkedin-nativo";

const PROVEEDOR = "linkedin";
/** Cuántos días antes de vencer se avisa que hay que reconectar. */
export const DIAS_DE_AVISO = 10;

/** La URL de retorno que hay que tener registrada, igual y completa, en la pestaña Auth de la app de LinkedIn. */
export const RUTA_DE_RETORNO = "/api/integrations/linkedin/callback";

type FilaDeConexion = { id: string; status: string; token_ciphertext: string; token_expires_at: number | null; scopes: string | null };

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
  return crearUrlDeAutorizacion(redirectUri, state, alcancesSolicitados({ administrar: true, anuncios: true }));
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

async function guardarTokens(user: Actor, tokens: TokensLinkedin, refreshAnterior: string | null) {
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
    .bind(crypto.randomUUID(), user.id, PROVEEDOR, tokens.alcances, cifrado, tokens.expiraEn, ahora, ahora)
    .run();
}

/** Cierra el OAuth: valida el estado, canjea el código y guarda el token cifrado. */
export async function completarConexionLinkedin(user: Actor, state: string, code: string): Promise<void> {
  exigirPermiso(user);
  if (!state || !code) throw new ErrorDeLinkedin("La autorización llegó incompleta.", 400);
  const sesion = await consumirSesion(user.id, state);
  const tokens = await canjearCodigoDeLinkedin(code, sesion.redirect_uri);
  await guardarTokens(user, tokens, null);
  await registrarEventoDeIntegracion(user, "integration_connected", "Conectó LinkedIn", `Alcances: ${tokens.alcances || "sin informar"}`);
}

async function buscarConexion(userId: string): Promise<FilaDeConexion | null> {
  return getRawDb()
    .prepare(
      `SELECT id, status, token_ciphertext, token_expires_at, scopes FROM integration_connections
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
};

/** Qué se sabe de la conexión de esta persona. No incluye el token. */
export async function estadoDeLinkedin(user: Actor): Promise<EstadoDeLinkedin> {
  const base: EstadoDeLinkedin = {
    configurado: linkedinNativoConfigurado(),
    falta: faltaParaLinkedin(),
    conectado: false,
    alcances: [],
    diasRestantes: null,
    reconectar: false,
  };
  const fila = await buscarConexion(user.id);
  if (!fila || fila.status !== "connected") return base;
  const dias = diasHastaVencer(fila.token_expires_at, Date.now());
  return {
    ...base,
    conectado: true,
    alcances: (fila.scopes ?? "").split(/[\s,]+/).filter(Boolean),
    diasRestantes: dias,
    reconectar: dias !== null && dias <= DIAS_DE_AVISO,
  };
}

/**
 * Token de acceso de esta persona (nunca el de otra: lo que se haga con él debe quedar a su nombre en LinkedIn).
 * Si venció y hay `refresh_token`, lo renueva; si no hay cómo, pide reconectar.
 */
export async function tokenDeLinkedin(user: Actor): Promise<string> {
  const fila = await buscarConexion(user.id);
  if (!fila || fila.status !== "connected") throw new ErrorDeLinkedin("Conecta tu cuenta de LinkedIn antes de continuar.", 409);
  const paquete = JSON.parse(await descifrarSecretoDeConexion(fila.token_ciphertext)) as { accessToken: string; refreshToken: string | null };
  const dias = diasHastaVencer(fila.token_expires_at, Date.now());
  if (dias === null || dias >= 0) return paquete.accessToken;
  if (!paquete.refreshToken) throw new ErrorDeLinkedin("Tu conexión con LinkedIn venció: vuelve a conectar.", 409);
  const renovados = await renovarTokenDeLinkedin(paquete.refreshToken);
  await guardarTokens(user, renovados, paquete.refreshToken);
  return renovados.accessToken;
}

/** Con esto se escribe en LinkedIn por la vía nativa. Es el token de QUIEN edita, nunca el de otra persona. */
export type CredencialesLinkedin = { token: string };

/**
 * Credenciales para editar una cuenta de LinkedIn por su API directa, o `null` si no corresponde: no hay credenciales de la app,
 * la persona no conectó su LinkedIn (o venció), o esa cuenta no es una que su conexión vea. `null` no es un error: quien llama
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
